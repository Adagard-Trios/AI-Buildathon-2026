import * as SecureStore from "expo-secure-store";

import { EMPTY_HISTORY, type TransferHistory } from "../lib/transfer";
import type { Lang } from "../lib/i18n";

// Small, capped records kept on the device. SecureStore values should stay under ~2 KB, so
// every list is trimmed; the services remain the system of record.

export interface CheckRecord {
  id: string;
  level: "LOW_RISK" | "CAUTION" | "HIGH_RISK";
  at: number;
  /** First words only: the message itself is never stored or sent anywhere else. */
  preview: string;
}

export interface Receipt {
  id: string;
  kind: "scam_check" | "cash_plan" | "transfer";
  label: string;
  at: number;
  /** Set when Component 3 anchored it under this id and it can be verified. */
  verifiable: boolean;
}

const K = {
  lang: "firststep.lang",
  checks: "firststep.checks",
  receipts: "firststep.receipts",
  transfers: "firststep.transfers",
  device: "firststep.device",
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

// Per-user keys so two people sharing a phone never see each other's history.
const forUser = (key: string, userId: number) => `${key}.${userId}`;

export const store = {
  lang: () => read<Lang>(K.lang, "en"),
  setLang: (l: Lang) => write(K.lang, l),

  checks: (u: number) => read<CheckRecord[]>(forUser(K.checks, u), []),
  addCheck: async (u: number, r: CheckRecord) => {
    const next = [r, ...(await store.checks(u))].slice(0, 8);
    await write(forUser(K.checks, u), next);
    return next;
  },

  receipts: (u: number) => read<Receipt[]>(forUser(K.receipts, u), []),
  addReceipt: async (u: number, r: Receipt) => {
    const next = [r, ...(await store.receipts(u)).filter((x) => x.id !== r.id)].slice(0, 12);
    await write(forUser(K.receipts, u), next);
    return next;
  },

  transfers: (u: number) => read<TransferHistory>(forUser(K.transfers, u), EMPTY_HISTORY),
  setTransfers: (u: number, h: TransferHistory) =>
    write(forUser(K.transfers, u), { ...h, knownPayees: h.knownPayees.slice(-20), recent: h.recent.slice(-20) }),

  /** A random id for this installation; never derived from hardware identifiers. */
  deviceId: async () => {
    const existing = await SecureStore.getItemAsync(K.device);
    if (existing) return existing;
    const id = "dev_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    await SecureStore.setItemAsync(K.device, id);
    return id;
  },
};
