// Pure: build the behavioural + relational signals Component 2 scores a transfer on.

import type { TransactionInput } from "../api/types";

export interface Payee {
  id: string;
  name: string;
  account: string;
}

export interface TransferHistory {
  /** Payee ids this user has paid before. A new payee is one of the strongest scam signals. */
  knownPayees: string[];
  /** Timestamps (ms) of this user's recent transfers. */
  recent: number[];
  lastAmount: number;
  /** The device id first seen for this account; a different one is a device change. */
  firstDeviceId: string | null;
}

export const EMPTY_HISTORY: TransferHistory = { knownPayees: [], recent: [], lastAmount: 0, firstDeviceId: null };

/** Stable payee id from the account number, so the same account is recognised across names. */
export function payeeId(account: string): string {
  return "p_" + account.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function buildTransaction(args: {
  userId: number | string;
  amount: number;
  payee: Payee;
  deviceId: string;
  accountCreatedAt: string;
  history: TransferHistory;
  /** Typing rhythm observed while the user filled the form, keystrokes per minute. */
  typingSpeed: number;
  now?: number;
}): TransactionInput {
  const now = args.now ?? Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const created = Date.parse(args.accountCreatedAt);
  const ageDays = Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 86_400_000)) : 0;
  return {
    transaction_id: `tx_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    user_id: String(args.userId),
    amount: Math.max(0, args.amount),
    location: "Colombo, LK",
    device_id: args.deviceId,
    device_change: args.history.firstDeviceId !== null && args.history.firstDeviceId !== args.deviceId,
    typing_speed: Math.min(2000, Math.max(0, Math.round(args.typingSpeed))),
    navigation_pattern: "normal",
    transaction_frequency: Math.min(1000, args.history.recent.filter((t) => t >= dayAgo).length),
    beneficiary_change: !args.history.knownPayees.includes(args.payee.id),
    beneficiary_id: args.payee.id,
    previous_transaction_amount: args.history.lastAmount,
    account_age: Math.min(50_000, ageDays),
  };
}

/** History after a transfer actually went through (allowed, or allowed after step-up). */
export function recordTransfer(h: TransferHistory, payee: Payee, amount: number, deviceId: string, now = Date.now()): TransferHistory {
  return {
    knownPayees: h.knownPayees.includes(payee.id) ? h.knownPayees : [...h.knownPayees, payee.id],
    recent: [...h.recent.filter((t) => t >= now - 7 * 86_400_000), now],
    lastAmount: amount,
    firstDeviceId: h.firstDeviceId ?? deviceId,
  };
}

/** Keystrokes per minute from first/last key timestamps; a neutral default when too few. */
export function typingSpeedFrom(keyTimes: number[]): number {
  if (keyTimes.length < 5) return 240;
  const minutes = (keyTimes[keyTimes.length - 1] - keyTimes[0]) / 60_000;
  return minutes > 0 ? keyTimes.length / minutes : 240;
}
