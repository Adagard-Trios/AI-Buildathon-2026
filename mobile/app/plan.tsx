import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import * as api from "../src/api/endpoints";
import type { Portfolio, WithdrawalResponse } from "../src/api/types";
import { money, parseAmount, pct } from "../src/lib/money";
import { BASELINE_LABELS, comparisonRows, summarisePlan } from "../src/lib/plan";
import { useApp, useUser } from "../src/state/app";
import { store } from "../src/state/store";
import { errorText, useAsync } from "../src/state/useAsync";
import { Banner, Button, Card, ErrorBox, Field, Gap, Loading, Pill, Row, Screen, Segmented, Title } from "../src/ui/components";
import { c, s, type } from "../src/ui/theme";

type Urgency = "low" | "mid" | "high";
const URGENCY: Record<Urgency, number> = { low: 0.2, mid: 0.5, high: 0.9 };

export default function Plan() {
  const { t } = useApp();
  const user = useUser();
  const params = useLocalSearchParams<{ portfolio?: string }>();
  const list = useAsync(() => api.listPortfolios());
  const [chosen, setPid] = useState<number | null>(params.portfolio ? Number(params.portfolio) : null);
  // Default to the first portfolio when the user came from Home rather than from a portfolio.
  const pid = chosen ?? list.data?.[0]?.id ?? null;
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("10");
  const [urgency, setUrgency] = useState<Urgency>("mid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WithdrawalResponse | null>(null);

  useEffect(() => {
    if (pid !== null) api.getPortfolio(pid).then(setPortfolio).catch((e) => setError(errorText(e)));
  }, [pid]);

  const run = async () => {
    const target = parseAmount(amount);
    const deadline = Math.min(30, Math.max(1, Math.round(Number(days) || 1)));
    if (!portfolio || !target) return;
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const p = await api.planCash({
        holdings: portfolio.holdings,
        targetAmount: target,
        deadlineDays: deadline,
        urgency: URGENCY[urgency],
        baseCurrency: portfolio.base_currency,
      });
      setPlan(p);
      await store.addReceipt(user.id, {
        id: p.decision_id ?? `plan_${p.generated_at}`,
        kind: "cash_plan",
        label: `${money(p.raised_amount, portfolio.base_currency)} · ${p.model_version}`,
        at: Date.now(),
        verifiable: Boolean(p.decision_id),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (list.loading && !list.data) return <Loading label={t("loading")} />;
  if (list.data && list.data.length === 0) {
    return (
      <Screen>
        <Title>{t("planTitle")}</Title>
        <Text style={type.body}>{t("nothingYet")}</Text>
        <Gap />
        <Button label={t("addPortfolio")} onPress={() => router.replace("/portfolio/new")} />
      </Screen>
    );
  }

  const cur = portfolio?.base_currency ?? "LKR";
  const summary = plan ? summarisePlan(plan) : null;

  return (
    <Screen>
      {list.data && list.data.length > 1 ? (
        <View style={{ marginBottom: s.md }}>
          <Segmented options={list.data.map((p) => ({ value: String(p.id), label: p.name }))} value={String(pid ?? "")} onChange={(v) => setPid(Number(v))} />
        </View>
      ) : null}

      <Field label={t("planHowMuch")} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="300,000" />
      <Field label={t("planBy")} value={days} onChangeText={setDays} keyboardType="number-pad" hint="1–30" />
      <Text style={[type.small, { marginBottom: s.sm }]}>{t("planUrgency")}</Text>
      <Segmented
        options={[
          { value: "low", label: t("urgencyLow") },
          { value: "mid", label: t("urgencyMid") },
          { value: "high", label: t("urgencyHigh") },
        ]}
        value={urgency}
        onChange={setUrgency}
      />
      <Gap size={s.lg} />
      <Button label={t("planButton")} onPress={run} busy={busy} disabled={!portfolio?.holdings.length || !parseAmount(amount)} />
      <Gap size={s.lg} />

      {error ? <ErrorBox message={error} onRetry={run} retryLabel={t("retry")} /> : null}

      {plan && summary ? (
        <View>
          {summary.feasible ? (
            <Banner tone="ok" title={`${t("planRaised")} ${money(summary.raised, cur)}`}>
              <Text style={type.body}>
                {t("planCost")}: {money(summary.cost, cur)} ({pct(plan.expected_slippage_pct * 100)})
              </Text>
              {summary.savedVsNaive !== null && summary.savedVsNaive > 0 ? (
                <Text style={[type.body, { marginTop: s.sm, fontWeight: "700" }]}>
                  {money(summary.savedVsNaive, cur)} — {t("planSaved")}
                </Text>
              ) : null}
            </Banner>
          ) : (
            // Infeasible is a real answer, said plainly: how much CAN be raised by the deadline.
            <Banner tone="warn" title={`${t("planShortfall")} ${money(summary.raised, cur)}`}>
              <Text style={type.body}>
                {money(summary.shortfall, cur)} short of {money(summary.target, cur)}.
              </Text>
            </Banner>
          )}

          {summary.days.map((d) => (
            <Card key={d.day}>
              <Text style={type.h2}>
                {t("planDay")} {d.day + 1}
              </Text>
              {d.sales.map((x) => {
                const fc = plan.market_context?.[x.symbol]?.forecast;
                return (
                  <View key={x.symbol}>
                    <Row
                      left={`${t("planSell")} ${x.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${x.symbol}`}
                      sub={`≈ ${money(x.expected_price, cur)} · ${pct(x.expected_slippage_pct * 100, 2)}`}
                      right={money(x.proceeds, cur)}
                    />
                    {fc ? (
                      <Text style={[type.small, { marginTop: s.xs }]}>
                        {t("planForecast")} ({fc.horizon}d): {pct(fc.p10 * 100)} / {pct(fc.p50 * 100)} / {pct(fc.p90 * 100)} · {fc.method}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              <Text style={[type.body, { marginTop: s.sm, fontWeight: "700", textAlign: "right" }]}>{money(d.total, cur)}</Text>
            </Card>
          ))}

          {comparisonRows(plan).length ? (
            <Card>
              <Text style={[type.h2, { marginBottom: s.sm }]}>{t("planCompare")}</Text>
              {comparisonRows(plan).map((r) => (
                <Row
                  key={r.method}
                  left={BASELINE_LABELS[r.method] ?? r.method}
                  sub={r.feasible ? `${r.days_required} d` : "can't raise it in time"}
                  right={money(r.expected_realized_loss, cur)}
                />
              ))}
              <Row left={BASELINE_LABELS.fuzzy_ga} right={money(plan.expected_realized_loss, cur)} />
            </Card>
          ) : null}

          <Pill text={`${t("planModel")}: ${plan.model_version}`} />
          <Text style={[type.small, { color: c.muted }]}>{t("demoNote")}</Text>
        </View>
      ) : null}
    </Screen>
  );
}
