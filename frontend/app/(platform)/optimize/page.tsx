"use client";

/**
 * Long-term allocation via MOEA/D.
 *
 * The selection-rule switch is the interesting part: choosing a single point from a Pareto
 * front is a value judgement, so all three rules are exposed and RQ2's sensitivity analysis
 * becomes something you can see rather than something buried in a notebook. The screen
 * itself speaks plainly: the rules are offered as ways to pick a mix, not by their names.
 */

import { Suspense, useState } from "react";

import { Button, Card, Field, Notice, Spinner, Stat, percent } from "@/components/ui";
import { optimizeAllocation, type SelectionRule } from "@/lib/api/portfolio";
import type { OptimizeResponse } from "@/lib/api/types";
import { usePortfolio } from "@/lib/usePortfolio";

// knee = maximum trade-off curvature on the Pareto front; max_sharpe = best return per unit
// of CVaR; scalarized = weighted sum under the risk slider.
const RULES: Array<{ value: SelectionRule; label: string; blurb: string }> = [
  {
    value: "knee",
    label: "Balanced",
    blurb: "The point where taking even less risk would start to cost a lot of return. No settings needed.",
  },
  {
    value: "max_sharpe",
    label: "Best return for the risk",
    blurb: "The mix that earns the most for each unit of downside risk.",
  },
  {
    value: "scalarized",
    label: "Follow my setting",
    blurb: "Uses the slider: towards safety favours small losses on bad days, towards return favours growth.",
  },
];

/** Liquidity cost at or above 100% means a holding had no traded value to price the trade. */
const UNPRICED_COST = 1;

function OptimizeScreen() {
  const { portfolio, loading, error } = usePortfolio();

  const [rule, setRule] = useState<SelectionRule>("knee");
  const [riskPreference, setRiskPreference] = useState(0.5);
  const [maxWeight, setMaxWeight] = useState(0.25);

  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    if (!portfolio) return;
    setBusy(true);
    setRunError(null);
    setResult(null);
    try {
      setResult(
        await optimizeAllocation({
          holdings: portfolio.holdings,
          riskPreference,
          selectionRule: rule,
          maxWeight,
        }),
      );
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : "Optimization failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading portfolio" />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!portfolio) return <Notice tone="info">Create a portfolio first.</Notice>;

  // Today's weights come from the service, converted into one currency; summing native
  // prices here would weigh an LKR holding against a USD one at par.
  const extra = result as
    | (OptimizeResponse & { current_weights?: Record<string, number> | null; forecast_used?: boolean | null })
    | null;
  const current = new Map(Object.entries(extra?.current_weights ?? {}));
  const forecastUsed = extra?.forecast_used ?? (result ? result.expected_return !== 0 : false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Long-term allocation</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A suggested mix for your holdings that weighs three things at once: return, how much
          you could lose on a bad day, and what it costs to trade from today&apos;s mix to the new one.
        </p>
      </div>

      <Card title="Parameters">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="How to pick the mix">
            <select
              value={rule}
              onChange={(e) => setRule(e.target.value as SelectionRule)}
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            >
              {RULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {rule === "scalarized" && (
            <Field
              label={`Safety or return: ${riskPreference < 0.4 ? "safety" : riskPreference > 0.6 ? "return" : "even"}`}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={riskPreference}
                aria-label="Safety or return"
                onChange={(e) => setRiskPreference(Number(e.target.value))}
                className="w-full"
              />
            </Field>
          )}

          <Field label={`Most in any one holding: ${(maxWeight * 100).toFixed(0)}%`} hint="Keeps the mix spread out.">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={maxWeight}
              onChange={(e) => setMaxWeight(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          {RULES.find((r) => r.value === rule)?.blurb}
        </p>

        <Button onClick={handleRun} disabled={busy} className="mt-4">
          {busy ? "Working out the mix…" : "Suggest a mix"}
        </Button>
      </Card>

      {runError && <Notice tone="error" title="Could not optimize">{runError}</Notice>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {forecastUsed ? (
              <Stat label="Expected return" value={percent(result.expected_return, 2)} hint="per day" />
            ) : (
              <Stat label="Expected return" value="No forecast" hint="chosen on risk and trading cost" />
            )}
            <Stat label="Bad-day loss" value={percent(result.expected_cvar, 2)} hint="average of the worst 1 in 20 days" />
            {result.expected_liquidity_cost >= UNPRICED_COST ? (
              <Stat label="Cost to trade" value="Unknown" hint="refresh quotes on the Portfolio page" />
            ) : (
              <Stat label="Cost to trade" value={percent(result.expected_liquidity_cost, 2)} hint="only on what changes" />
            )}
            <Stat label="Mixes compared" value={String(result.pareto_front_size)} />
          </div>

          <Card title="Suggested mix" subtitle={RULES.find((r) => r.value === result.selection_rule)?.blurb}>
            <div className="space-y-2">
              {Object.entries(result.recommended_weights)
                .sort(([, a], [, b]) => b - a)
                .map(([symbol, weight]) => {
                  const now = current.get(symbol) ?? 0;
                  const delta = weight - now;
                  return (
                    <div key={symbol} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-sm font-medium sm:w-28" title={symbol}>{symbol}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-black/5 dark:bg-white/10">
                        <div
                          className="h-full bg-neutral-900 dark:bg-white"
                          style={{ width: `${Math.min(weight * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-sm tabular-nums">
                        {(weight * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`w-14 shrink-0 text-right text-xs tabular-nums ${
                          Math.abs(delta) < 0.005
                            ? "text-neutral-400"
                            : delta > 0
                              ? "text-emerald-600"
                              : "text-red-600"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {(delta * 100).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              The right-hand column is the change from what you hold today. Trading costs apply
              only to that change, so a holding you keep as it is costs nothing.
              {!forecastUsed &&
                " None of these holdings has a forecast yet, so the mix favours lower risk and fewer trades rather than growth."}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
      <OptimizeScreen />
    </Suspense>
  );
}
