import assert from "node:assert/strict";
import { test } from "node:test";

import type { WithdrawalResponse } from "../api/types.ts";
import { ApiError, messageFrom } from "../lib/errors.ts";
import { KEYS, STRINGS, assistantPrefix, translate } from "../lib/i18n.ts";
import { money, parseAmount } from "../lib/money.ts";
import { comparisonRows, summarisePlan } from "../lib/plan.ts";
import { EMPTY_HISTORY, buildTransaction, payeeId, recordTransfer, typingSpeedFrom } from "../lib/transfer.ts";
import { resolveBaseUrls } from "../lib/urls.ts";

test("error messages: OData, FastAPI string, FastAPI validation, C3 shape, fallback", () => {
  assert.equal(
    messageFrom(400, { error: { code: "BadRequest", message: "Invalid.", details: [{ target: "text", message: "Field required" }] } }),
    "Invalid. text: Field required",
  );
  assert.equal(messageFrom(400, { detail: "too much" }), "too much");
  assert.equal(messageFrom(422, { detail: [{ loc: ["body", "amount"], msg: "must be > 0" }] }), "amount: must be > 0");
  assert.equal(messageFrom(403, { success: false, message: "Forbidden" }), "Forbidden");
  assert.equal(messageFrom(500, "<html>"), "Request failed (500)");
  assert.equal(new ApiError(401, "x").isAuth, true);
  assert.equal(new ApiError(0, "x").isUnavailable, true);
});

test("urls: override > env > dev host, trailing slash trimmed", () => {
  const u = resolveBaseUrls({ fraud: "https://fraud.run.app/" }, { platform: "https://platform.run.app" }, "192.168.1.20:8081");
  assert.equal(u.fraud, "https://fraud.run.app");
  assert.equal(u.platform, "https://platform.run.app");
  assert.equal(u.portfolio, "http://192.168.1.20:8000");
  assert.equal(u.audit, "http://192.168.1.20:8002");
  assert.equal(resolveBaseUrls({}, {}, null).assistant, "http://localhost:8003");
});

test("money parsing understands how people type amounts", () => {
  assert.equal(parseAmount("300,000"), 300000);
  assert.equal(parseAmount("Rs 300000"), 300000);
  assert.equal(parseAmount("3 lakh"), 300000);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("0"), null);
  assert.equal(money(300000), "Rs 300,000");
  assert.equal(money(12.5, "USD"), "USD 12.50");
});

test("i18n: every key has English; translations fall back; prefixes match the web app", () => {
  for (const k of KEYS) assert.ok(STRINGS.en[k], k);
  for (const lang of ["si", "ta"] as const) {
    for (const k of Object.keys(STRINGS[lang])) assert.ok(KEYS.includes(k as never), `${lang} has unknown key ${k}`);
  }
  assert.equal(translate("si", "appName"), "FirstStep"); // falls back to English
  assert.equal(translate("ta", "signIn"), "உள்நுழைக");
  assert.equal(assistantPrefix("si"), "[Reply in Sinhala] ");
  assert.equal(assistantPrefix("en"), "");
});

test("transfer signals: new payee, device change, frequency, account age", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");
  const payee = { id: payeeId("123-456 789"), name: "School", account: "123-456 789" };
  const tx = buildTransaction({
    userId: 7,
    amount: 300000,
    payee,
    deviceId: "dev_b",
    accountCreatedAt: "2026-09-17T10:00:00Z",
    history: { knownPayees: [], recent: [now - 3600_000, now - 3 * 86_400_000], lastAmount: 5000, firstDeviceId: "dev_a" },
    typingSpeed: 99999,
    now,
  });
  assert.equal(tx.user_id, "7");
  assert.equal(tx.beneficiary_change, true);
  assert.equal(tx.device_change, true);
  assert.equal(tx.transaction_frequency, 1);
  assert.equal(tx.account_age, 30);
  assert.equal(tx.typing_speed, 2000); // clamped to the service's bound
  assert.equal(tx.previous_transaction_amount, 5000);
  assert.equal(payee.id, "p_123456789");

  const after = recordTransfer(EMPTY_HISTORY, payee, 300000, "dev_b", now);
  assert.deepEqual(after.knownPayees, [payee.id]);
  assert.equal(after.firstDeviceId, "dev_b");
  const again = buildTransaction({ userId: 7, amount: 1, payee, deviceId: "dev_b", accountCreatedAt: "x", history: after, typingSpeed: 240, now });
  assert.equal(again.beneficiary_change, false);
  assert.equal(again.device_change, false);
  assert.equal(again.account_age, 0); // unparseable date -> treated as brand new, the cautious reading

  assert.equal(typingSpeedFrom([0, 1000]), 240);
  assert.equal(Math.round(typingSpeedFrom([0, 15000, 30000, 45000, 60000])), 5);
});

const PLAN: WithdrawalResponse = {
  assets_to_sell: [
    { symbol: "JKH", sell_fraction: 0.5, quantity: 100, expected_price: 199, expected_slippage_pct: 0.005, execution_day: 1 },
    { symbol: "COMB", sell_fraction: 0.2, quantity: 50, expected_price: 98, expected_slippage_pct: 0.002, execution_day: 0 },
    { symbol: "HNB", sell_fraction: 0, quantity: 0, expected_price: 250, expected_slippage_pct: 0, execution_day: 0 },
  ],
  raised_amount: 24800,
  target_amount: 24000,
  shortfall: 0,
  expected_slippage_pct: 0.004,
  expected_realized_loss: 120,
  days_required: 2,
  feasible: true,
  model_version: "fuzzy-ga-1",
  generated_at: "2026-10-17T00:00:00Z",
  baseline_comparison: [
    { method: "fuzzy_ga", feasible: true, raised_amount: 24800, expected_realized_loss: 120, expected_slippage_pct: 0.004, days_required: 2 },
    { method: "pro_rata", feasible: true, raised_amount: 24000, expected_realized_loss: 410, expected_slippage_pct: 0.017, days_required: 1 },
    { method: "largest_first", feasible: false, raised_amount: 9000, expected_realized_loss: 50, expected_slippage_pct: 0.01, days_required: 2 },
  ],
};

test("plan summary: grouped by day, proceeds not double-discounted, saving vs pro-rata", () => {
  const sum = summarisePlan(PLAN);
  assert.deepEqual(sum.days.map((d) => d.day), [0, 1]);
  assert.equal(sum.days[0].sales.length, 1); // zero-quantity rows dropped
  assert.equal(sum.days[0].total, 50 * 98); // expected_price is already net of slippage
  assert.equal(sum.days[1].total, 100 * 199);
  assert.equal(sum.savedVsNaive, 290);
  assert.deepEqual(comparisonRows(PLAN).map((r) => r.method), ["pro_rata", "largest_first"]);
});

test("plan summary: no saving claimed against an infeasible baseline or an infeasible plan", () => {
  const noNaive = summarisePlan({ ...PLAN, baseline_comparison: [{ ...PLAN.baseline_comparison![1], feasible: false }] });
  assert.equal(noNaive.savedVsNaive, null);
  const infeasible = summarisePlan({ ...PLAN, feasible: false, shortfall: 5000 });
  assert.equal(infeasible.savedVsNaive, null);
  assert.equal(infeasible.shortfall, 5000);
});
