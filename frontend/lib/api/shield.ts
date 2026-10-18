/** Component 2 — Scam Shield and STEP-UP re-authentication. Mirrors backend/Fraud-Detection. */

import { request } from "./client";

export type ShieldLevel = "LOW_RISK" | "CAUTION" | "HIGH_RISK";

export interface ShieldVerdict {
  id: string;
  level: ShieldLevel;
  /** false = too little evidence to say anything: show "unverified", never "safe". */
  verified: boolean;
  fired_rules: string[];
  reasons: string[];
  policy_version: string;
  flag_source: string;
  links: string[];
  /** OKF scam-pattern concepts the verdict rests on (backend/Fraud-Detection/knowledge). */
  patterns?: ScamPattern[];
}

export interface ScamPattern {
  id: string;
  title: string;
  description: string;
  rules: string[];
  /** OKF trust tier, derived from the concept's `verified` field. */
  trust: "unverified" | "machine-confirmed" | "human-reviewed";
  stale: boolean;
  sources: { title: string; resource: string }[];
}

export function checkMessage(text: string): Promise<ShieldVerdict> {
  return request<ShieldVerdict>("fraud", "/odata/v1/fraud/CheckMessage", { method: "POST", body: { text } });
}

export interface StepUpChallenge {
  challenge_id: string;
  expires_in: number;
  /** Present only when the server runs in DEMO_MODE. */
  demo_code?: string;
}

export function startStepUp(transactionId: string, userId: string): Promise<StepUpChallenge> {
  return request<StepUpChallenge>("fraud", "/step-up/challenge", {
    method: "POST",
    body: { transaction_id: transactionId, user_id: userId },
  });
}

export function verifyStepUp(
  challengeId: string,
  code: string,
): Promise<{ verified: boolean; reason?: string; attempts_left?: number }> {
  return request("fraud", "/step-up/verify", { method: "POST", body: { challenge_id: challengeId, code } });
}
