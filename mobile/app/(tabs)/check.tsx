import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import * as api from "../../src/api/endpoints";
import type { ShieldVerdict } from "../../src/api/types";
import { useApp, useUser } from "../../src/state/app";
import { store } from "../../src/state/store";
import { errorText } from "../../src/state/useAsync";
import { Banner, Button, Card, ErrorBox, Field, Gap, Pill, Screen, Title } from "../../src/ui/components";
import { s, type } from "../../src/ui/theme";
import { levelAdvice, levelLabel, levelTone } from "../../src/ui/verdict";

export default function Check() {
  const { t } = useApp();
  const user = useUser();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<ShieldVerdict | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    setVerdict(null);
    try {
      const v = await api.checkMessage(text.trim());
      setVerdict(v);
      // Only a short preview is kept on the phone; the full message is never stored.
      const preview = text.trim().split(/\s+/).slice(0, 8).join(" ");
      await store.addCheck(user.id, { id: v.id, level: v.level, at: Date.now(), preview });
      await store.addReceipt(user.id, { id: v.id, kind: "scam_check", label: `${levelLabel(t, v.level)} · ${preview}`, at: Date.now(), verifiable: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title sub={t("checkHint")}>{t("checkTitle")}</Title>
      <Field label={t("checkPlaceholder")} value={text} onChangeText={setText} multiline maxLength={8000} />
      <Button label={t("checkButton")} onPress={check} busy={busy} disabled={text.trim().length < 3} />
      <Gap size={s.lg} />

      {error ? <ErrorBox message={error} onRetry={check} retryLabel={t("retry")} /> : null}

      {verdict ? (
        <View>
          <Banner tone={levelTone(verdict.level)} title={levelLabel(t, verdict.level)}>
            <Text style={type.body}>{levelAdvice(t, verdict.level)}</Text>
          </Banner>

          {verdict.reasons.length ? (
            <Card>
              <Text style={type.h2}>{t("why")}</Text>
              {verdict.reasons.map((r, i) => (
                <Text key={i} style={[type.body, { marginTop: s.sm }]}>
                  • {r}
                </Text>
              ))}
            </Card>
          ) : null}

          {verdict.fired_rules.length ? (
            <Card>
              <Text style={[type.small, { marginBottom: s.sm }]}>{t("rulesFired")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {verdict.fired_rules.map((r) => (
                  <Pill key={r} text={r} tone={levelTone(verdict.level)} />
                ))}
              </View>
              <Text style={type.small}>
                {t("decidedBy")} {verdict.policy_version} · {verdict.flag_source}
              </Text>
            </Card>
          ) : null}

          <Card>
            <Text style={type.body}>{t("sealedProof")}</Text>
            <Gap />
            <Button label={t("checkProof")} variant="secondary" onPress={() => router.push({ pathname: "/receipts", params: { focus: verdict.id } })} />
          </Card>

          {verdict.level === "HIGH_RISK" ? (
            // The assistant re-runs the check as a tool and raises the Family Guardian alert,
            // which then waits for the customer's confirmation (Trust Panel).
            <Button
              label={`${t("askTitle")} →`}
              onPress={() => router.push({ pathname: "/(tabs)/ask", params: { prefill: `Is this a scam? "${text.trim().slice(0, 600)}"` } })}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
