// Pure: turn Component 1's withdrawal plan into what a customer needs to see.

import type { AssetSale, BaselineRow, WithdrawalResponse } from "../api/types";

export interface DayGroup {
  day: number;
  sales: (AssetSale & { proceeds: number })[];
  total: number;
}

export interface PlanSummary {
  days: DayGroup[];
  raised: number;
  target: number;
  shortfall: number;
  feasible: boolean;
  cost: number;
  /**
   * The naive comparison: "sell an equal slice of everything" (pro_rata), costed by the same
   * simulator as the plan (service/api.py _baseline_comparison). What most people do.
   */
  naive: BaselineRow | null;
  /** How much less the plan loses than the naive baseline. Null when not comparable. */
  savedVsNaive: number | null;
}

/** Labels for the baseline methods Component 1 reports (optimization/naive_liquidation.py). */
export const BASELINE_LABELS: Record<string, string> = {
  fuzzy_ga: "FirstStep plan",
  pro_rata: "Sell a slice of everything",
  largest_first: "Sell the biggest holding first",
  most_liquid_first: "Sell the easiest-to-sell first",
};

export function pickNaive(rows: BaselineRow[] | undefined): BaselineRow | null {
  return rows?.find((r) => r.method === "pro_rata") ?? null;
}

export function summarisePlan(plan: WithdrawalResponse): PlanSummary {
  const byDay = new Map<number, DayGroup>();
  for (const s of plan.assets_to_sell) {
    if (s.quantity <= 0) continue;
    // expected_price is already net of slippage (optimization/ga_withdrawal.py), and
    // expected_slippage_pct is a fraction despite its name: do not deduct it a second time.
    const proceeds = s.quantity * s.expected_price;
    const g = byDay.get(s.execution_day) ?? { day: s.execution_day, sales: [], total: 0 };
    g.sales.push({ ...s, proceeds });
    g.total += proceeds;
    byDay.set(s.execution_day, g);
  }
  const days = [...byDay.values()].sort((a, b) => a.day - b.day);
  const naive = pickNaive(plan.baseline_comparison);
  // Only compare like with like: a baseline that could not raise the money is not a cheaper option.
  const saved = naive && naive.feasible && plan.feasible ? naive.expected_realized_loss - plan.expected_realized_loss : null;
  return {
    days,
    raised: plan.raised_amount,
    target: plan.target_amount,
    shortfall: plan.shortfall,
    feasible: plan.feasible,
    cost: plan.expected_realized_loss,
    naive,
    savedVsNaive: saved,
  };
}

/** Other baselines to show in "compare", excluding the plan's own row. */
export function comparisonRows(plan: WithdrawalResponse): BaselineRow[] {
  return (plan.baseline_comparison ?? []).filter((r) => r.method !== "fuzzy_ga");
}
