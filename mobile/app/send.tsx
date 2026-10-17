import { router } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import * as api from "../src/api/endpoints";
import type { ScoreResponse, StepUpChallenge } from "../src/api/types";
import { money, parseAmount } from "../src/lib/money";
import { buildTransaction, payeeId, recordTransfer, typingSpeedFrom, type Payee } from "../src/lib/transfer";
import { useApp, useUser } from "../src/state/app";
import { store } from "../src/state/store";
import { errorText } from "../src/state/useAsync";
import { Banner, Button, Card, ErrorBox, Field, Gap, Pill, Screen, Title } from "../src/ui/components";
import { c, s, type } from "../src/ui/theme";

type Phase = "form" | "stepup" | "allowed" | "blocked";

export default function Send() {
  const { t } = useApp();
  const user = useUser();
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  // Typing rhythm is one of Component 2's behavioural signals; only timestamps, never keys.
  const keyTimes = useRef<number[]>([]);
  const tap = () => keyTimes.current.push(Date.now());

  const payee: Payee = { id: payeeId(account), name: name.trim(), account: account.trim() };
  const value = parseAmount(amount);

  const complete = async () => {
    const deviceId = await store.deviceId();
    const h = await store.transfers(user.id);
    await store.setTransfers(user.id, recordTransfer(h, payee, value ?? 0, deviceId));
    if (score) {
      await store.addReceipt(user.id, {
        id: score.transaction_id,
        kind: "transfer",
        label: `${money(value)} → ${payee.name} · ${score.decision}`,
        at: Date.now(),
        verifiable: true, // Component 2 anchors the decision under this transaction id
      });
    }
    setPhase("allowed");
  };

  const submit = async () => {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const deviceId = await store.deviceId();
      const history = await store.transfers(user.id);
      const tx = buildTransaction({
        userId: user.id,
        amount: value,
        payee,
        deviceId,
        accountCreatedAt: user.created_at,
        history,
        typingSpeed: typingSpeedFrom(keyTimes.current),
      });
      // The gateway decides ALLOW / STEP-UP / BLOCK with deterministic rules over the scores.
      const r = await api.scoreTransfer(tx);
      setScore(r);
      if (r.decision === "ALLOW") await complete();
      else if (r.decision === "BLOCK") setPhase("blocked");
      else {
        setChallenge(await api.startStepUp(r.transaction_id, String(user.id)));
        setPhase("stepup");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.verifyStepUp(challenge.challenge_id, code.trim());
      if (r.verified) await complete();
      else {
        setAttemptsLeft(r.attempts_left ?? 0);
        setError(r.reason ?? "Incorrect code");
        if (!r.attempts_left) setPhase("blocked");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}

      {phase === "form" ? (
        <View>
          <Title sub={t("demoNote")}>{t("sendTitle")}</Title>
          <Field label={t("payeeName")} value={name} onChangeText={setName} onKeyPress={tap} />
          <Field label={t("payeeAccount")} value={account} onChangeText={setAccount} onKeyPress={tap} keyboardType="number-pad" />
          <Field label={t("amount")} value={amount} onChangeText={setAmount} onKeyPress={tap} keyboardType="numeric" placeholder="25,000" />
          <Button label={t("sendButton")} onPress={submit} busy={busy} disabled={!name.trim() || account.trim().length < 4 || !value} />
        </View>
      ) : null}

      {phase === "stepup" && challenge ? (
        <View>
          <Banner tone="warn" title={t("sendStepUp")}>
            <Text style={type.body}>{t("stepUpBody")}</Text>
            {score?.reason ? <Text style={[type.small, { marginTop: s.sm }]}>{score.reason}</Text> : null}
          </Banner>
          {challenge.demo_code ? (
            // No SMS delivery in the prototype: the server shows the code only in DEMO_MODE.
            <Card style={{ borderColor: c.warn }}>
              <Text style={type.small}>{t("demoCode")}</Text>
              <Text style={[type.big, { letterSpacing: 6 }]}>{challenge.demo_code}</Text>
            </Card>
          ) : null}
          <Field label={t("code")} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
          {attemptsLeft !== null ? <Text style={[type.small, { marginBottom: s.sm }]}>{attemptsLeft} left</Text> : null}
          <Button label={t("verify")} onPress={verify} busy={busy} disabled={code.trim().length !== 6} />
        </View>
      ) : null}

      {phase === "allowed" ? (
        <View>
          <Banner tone="ok" title={t("sendAllowed")}>
            <Text style={type.body}>
              {money(value)} → {payee.name}
            </Text>
          </Banner>
          <Text style={[type.small, { marginBottom: s.lg }]}>{t("demoNote")}</Text>
          <Button label={t("sendDone")} onPress={() => router.back()} />
        </View>
      ) : null}

      {phase === "blocked" ? (
        <View>
          <Banner tone="danger" title={t("sendBlocked")}>
            <Text style={type.body}>{score?.reason ?? t("adviceHigh")}</Text>
          </Banner>
          {score?.reasons?.length ? (
            <Card>
              <Text style={[type.h2, { marginBottom: s.sm }]}>{t("why")}</Text>
              {score.reasons.slice(0, 5).map((r, i) => (
                <Text key={i} style={[type.body, { marginBottom: s.xs }]}>
                  • {r}
                </Text>
              ))}
              {score.rules_fired?.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: s.sm }}>
                  {score.rules_fired.map((r) => (
                    <Pill key={r} text={r} tone="danger" />
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}
          <Gap />
          <Pill text={`Risk ${Math.round((score?.risk_score ?? 0) * 100)}/100`} tone="danger" />
          <Button label={t("askTitle")} variant="secondary" onPress={() => router.push({ pathname: "/(tabs)/ask", params: { prefill: "Why was my transfer stopped?" } })} />
        </View>
      ) : null}
    </Screen>
  );
}
