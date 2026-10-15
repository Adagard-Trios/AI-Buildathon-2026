"use client";

/**
 * Scam Shield: paste a suspicious message and get a SHIELD-P001 verdict with reasons.
 * The verdict comes from the deterministic policy; this screen only renders it.
 */

import { useState } from "react";

import { Button, Card, Notice } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { checkMessage, type ShieldVerdict } from "@/lib/api/shield";

const TONE = { LOW_RISK: "success", CAUTION: "warn", HIGH_RISK: "error" } as const;

const LABEL = (v: ShieldVerdict) =>
  v.level === "LOW_RISK" && !v.verified ? "UNVERIFIED — not confirmed safe" : v.level.replace("_", " ");

export function ScamShield() {
  const [text, setText] = useState("");
  const [verdict, setVerdict] = useState<ShieldVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setVerdict(await checkMessage(text));
    } catch (cause) {
      setVerdict(null);
      setError(
        cause instanceof ApiError && cause.status === 0
          ? "The fraud service is not running."
          : cause instanceof Error
            ? cause.message
            : "Could not check the message",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Check a message" subtitle="SMS, WhatsApp, email or an investment offer. The text is not stored.">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={8000}
          placeholder="Paste the message here…"
          className="w-full rounded-lg border border-neutral-300 bg-transparent p-3 text-sm"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={run} disabled={busy || !text.trim()}>
            {busy ? "Checking…" : "Check message"}
          </Button>
        </div>
      </Card>

      {error && <Notice tone="error" title="Could not check">{error}</Notice>}

      {verdict && (
        <div className="space-y-3">
          <Notice tone={verdict.verified ? TONE[verdict.level] : "info"} title={LABEL(verdict)}>
            {verdict.reasons.length > 0
              ? verdict.reasons.join(" ")
              : "No red flags matched, but there was not enough information to confirm this is safe."}
          </Notice>
          <p className="text-xs text-neutral-500">
            Policy {verdict.policy_version} · rules fired: {verdict.fired_rules.join(", ") || "none"} · flags read
            by: {verdict.flag_source}
          </p>
        </div>
      )}
    </div>
  );
}
