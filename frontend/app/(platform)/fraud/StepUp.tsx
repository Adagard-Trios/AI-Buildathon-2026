"use client";

/**
 * STEP-UP for a risky transfer: a pause, a question and an explanation, then fresh proof.
 *
 * In an authorised push payment scam the victim passes a plain OTP check herself, because she
 * believes the payment is hers to make. So before any code is sent the customer is asked what
 * the payment is for; whatever she pastes or writes goes through Scam Shield, and a scam verdict
 * is shown at the moment of payment. On STOP the default action is to cancel; continuing needs
 * an explicit acknowledgement, and only then is a one-time code issued.
 */

import { useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { checkMessage, startStepUp, verifyStepUp, type ShieldVerdict, type StepUpChallenge } from "@/lib/api/shield";

import { VerdictSeal } from "./ScamShield";

type Stage = "ask" | "verdict" | "code" | "verified" | "cancelled";

export function StepUp({ transactionId, userId }: { transactionId: string; userId: string }) {
  const [stage, setStage] = useState<Stage>("ask");
  const [reason, setReason] = useState("");
  const [verdict, setVerdict] = useState<ShieldVerdict | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const risky = verdict !== null && verdict.level !== "LOW_RISK";

  async function sendCode() {
    setMessage(null);
    setBusy(true);
    try {
      setChallenge(await startStepUp(transactionId, userId));
      setStage("code");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not start the check");
    } finally {
      setBusy(false);
    }
  }

  async function checkReason() {
    setMessage(null);
    setBusy(true);
    try {
      const v = await checkMessage(reason.trim());
      setVerdict(v);
      if (v.level === "LOW_RISK") {
        await sendCode();
      } else {
        setStage("verdict");
      }
    } catch (cause) {
      setMessage(
        cause instanceof ApiError && cause.status === 0
          ? "The scam check is unavailable right now; you can still confirm with a code."
          : cause instanceof Error ? cause.message : "Could not check the message",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!challenge) return;
    try {
      const out = await verifyStepUp(challenge.challenge_id, code);
      if (out.verified) setStage("verified");
      setMessage(out.verified ? null : (out.reason ?? "Incorrect code") + (out.attempts_left !== undefined ? ` (${out.attempts_left} left)` : ""));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not verify");
    }
  }

  if (stage === "cancelled") {
    return (
      <Notice tone="success" title="Transfer cancelled">
        Nothing was sent. If someone is pressuring you to pay, stop and talk to someone you trust, or call your bank on the
        number on the back of your card.
      </Notice>
    );
  }
  if (stage === "verified") {
    return <Notice tone="success" title="Identity confirmed">The transfer can now continue.</Notice>;
  }

  return (
    <div className="space-y-3">
      <Notice tone="warn" title="Before you pay, a quick check">
        {stage === "ask" && (
          <>
            <p>This transfer looks unusual. What is it for? Paste the message that asked you to pay, or describe it in your own words.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={8000}
              aria-label="What is this payment for?"
              placeholder="For example: the WhatsApp message about the investment, or 'school fees for term 3'"
              className="mt-3 w-full rounded-xl border border-line bg-surface p-3 text-[15px] text-ink transition focus:border-accent"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={checkReason} disabled={busy || reason.trim().length < 3}>
                {busy ? "Checking…" : "Check before paying"}
              </Button>
              <Button variant="secondary" onClick={sendCode} disabled={busy}>
                Skip the check and send me a code
              </Button>
            </div>
          </>
        )}
        {stage === "verdict" && (
          <p>
            {verdict?.level === "HIGH_RISK"
              ? "This payment matches a scam. We recommend you cancel it."
              : "This payment has warning signs. Please read why before you continue."}
          </p>
        )}
        {stage === "code" && challenge && (
          <>
            <p>Confirm it is really you with the one-time code. Never share this code with anyone who contacts you.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="6-digit code" hint={challenge.demo_code ? `Demo code: ${challenge.demo_code}` : undefined}>
                <Input value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <Button onClick={submit} disabled={code.length !== 6}>Confirm</Button>
            </div>
          </>
        )}
        {message && <p className="mt-2 text-sm">{message}</p>}
      </Notice>

      {stage === "verdict" && verdict && (
        <>
          <VerdictSeal verdict={verdict} />
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" />
              <span>I have read the warning and I still want to make this payment.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStage("cancelled")}>Cancel the transfer</Button>
              <Button variant="danger" onClick={sendCode} disabled={!acknowledged || busy}>
                Continue anyway
              </Button>
            </div>
          </div>
        </>
      )}
      {stage === "code" && risky && (
        <p className="text-xs text-muted">You chose to continue after a {verdict?.level === "HIGH_RISK" ? "STOP" : "CHECK"} warning.</p>
      )}
    </div>
  );
}
