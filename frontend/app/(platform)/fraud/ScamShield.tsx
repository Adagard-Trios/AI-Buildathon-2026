"use client";

/**
 * Scam Shield: paste a suspicious message and get a SHIELD-P001 verdict with reasons.
 * The verdict comes from the deterministic policy; this screen only renders it.
 */

import { useState } from "react";

import { Button, Card, Notice } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { checkMessage, type ShieldVerdict } from "@/lib/api/shield";

/**
 * The verdict is the product's defining moment, so it is drawn as a bank stamp on the
 * message: one word, a shape and a colour that agree (never colour alone), then what to do
 * next, then why. "Unverified" is its own stamp: too little evidence is not "safe".
 */
const SEAL = {
  HIGH_RISK: { word: "Stop", line: "This looks like a scam.", tone: "text-danger border-danger", tint: "bg-danger-tint",
    next: ["Do not send money or share any code.", "Do not reply or click links in the message.",
      "Talk to someone you trust before doing anything."] },
  CAUTION: { word: "Check", line: "Some warning signs. Slow down.", tone: "text-caution border-caution", tint: "bg-caution-tint",
    next: ["Confirm the company is licensed before paying.", "Call them on a number you find yourself, not one in the message."] },
  LOW_RISK: { word: "Clear", line: "No warning signs found.", tone: "text-accent border-accent", tint: "bg-accent-tint",
    next: ["Still never share a one-time code with anyone."] },
  UNVERIFIED: { word: "Unsure", line: "Not enough information to call this safe.", tone: "text-muted border-muted", tint: "bg-sunken",
    next: ["Treat it with care, and check the sender another way."] },
} as const;

export function VerdictSeal({ verdict }: { verdict: ShieldVerdict }) {
  const key = verdict.level === "LOW_RISK" && !verdict.verified ? "UNVERIFIED" : verdict.level;
  const seal = SEAL[key];
  return (
    <section aria-live="polite" className={`overflow-hidden rounded-2xl border border-line bg-surface`}>
      <div className={`flex flex-col gap-5 p-6 sm:flex-row sm:items-center ${seal.tint}`}>
        <div
          role="img"
          aria-label={`Verdict: ${seal.word}`}
          className={`grid size-28 shrink-0 place-items-center rounded-full border-[3px] border-double ${seal.tone}`}
          style={{ animation: "stamp 240ms ease-out both" }}
        >
          <span className="text-2xl font-black uppercase tracking-[0.18em]">{seal.word}</span>
        </div>
        <div>
          <p className={`text-2xl font-semibold tracking-tight ${seal.tone.split(" ")[0]}`}>{seal.line}</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink">
            {seal.next.map((step) => (
              <li key={step} className="flex gap-2">
                <span aria-hidden className="text-muted">→</span>
                {step}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="p-6 pt-5">
        <h3 className="text-sm font-semibold">Why</h3>
        {verdict.reasons.length > 0 ? (
          <ul className="mt-2 space-y-2 text-sm">
            {verdict.reasons.map((reason) => (
              <li key={reason} className="flex gap-2.5">
                <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${seal.tone.includes("danger") ? "bg-danger" : seal.tone.includes("caution") ? "bg-caution" : "bg-muted"}`} />
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No red flags matched the message.</p>
        )}
        {verdict.patterns && verdict.patterns.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Known scam patterns</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {verdict.patterns.map((p) => (
                <li key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{p.title}</p>
                    <span
                      title="Open Knowledge Format trust tier"
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        p.trust === "human-reviewed" ? "bg-accent-tint text-accent" : "bg-sunken text-muted"
                      }`}
                    >
                      {p.trust}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{p.description}</p>
                  {p.sources.filter((s) => s.resource?.startsWith("http")).slice(0, 1).map((s) => (
                    <a key={s.resource} href={s.resource} target="_blank" rel="noreferrer"
                       className="mt-1.5 inline-block text-xs font-medium text-accent underline-offset-2 hover:underline">
                      Source: {s.title}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Decided by policy {verdict.policy_version}
          {verdict.fired_rules.length > 0 && ` (rules ${verdict.fired_rules.join(", ")})`}. Red flags read by{" "}
          {verdict.flag_source === "gemini" ? "Gemini" : "the rule engine"}; the policy, not the model, makes the call.
          Sealed in the audit trail.
        </p>
      </div>
    </section>
  );
}

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
          aria-label="Message to check"
          className="w-full rounded-xl border border-line bg-surface p-3.5 text-[15px] leading-relaxed transition focus:border-accent"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={run} disabled={busy || !text.trim()}>
            {busy ? "Checking…" : "Check message"}
          </Button>
        </div>
      </Card>

      {error && <Notice tone="error" title="Could not check">{error}</Notice>}

      {verdict && <VerdictSeal verdict={verdict} />}
    </div>
  );
}
