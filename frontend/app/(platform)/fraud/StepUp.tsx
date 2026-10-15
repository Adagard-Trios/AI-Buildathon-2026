"use client";

/** STEP-UP: a risky action needs fresh proof, even inside a valid session. */

import { useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { startStepUp, verifyStepUp, type StepUpChallenge } from "@/lib/api/shield";

export function StepUp({ transactionId, userId }: { transactionId: string; userId: string }) {
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "verified" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function begin() {
    setMessage(null);
    try {
      setChallenge(await startStepUp(transactionId, userId));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not start the check");
    }
  }

  async function submit() {
    if (!challenge) return;
    try {
      const out = await verifyStepUp(challenge.challenge_id, code);
      setStatus(out.verified ? "verified" : "failed");
      setMessage(out.verified ? null : (out.reason ?? "Incorrect code") + (out.attempts_left !== undefined ? ` (${out.attempts_left} left)` : ""));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not verify");
    }
  }

  if (status === "verified") {
    return <Notice tone="success" title="Identity confirmed">The transfer can now continue.</Notice>;
  }
  return (
    <Notice tone="warn" title="Extra check required">
      <p>This transfer looks unusual. Confirm it is you with a one-time code before it goes through.</p>
      {!challenge ? (
        <div className="mt-3"><Button onClick={begin}>Send me a code</Button></div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="6-digit code" hint={challenge.demo_code ? `Demo code: ${challenge.demo_code}` : undefined}>
            <Input value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button onClick={submit} disabled={code.length !== 6}>Confirm</Button>
        </div>
      )}
      {message && <p className="mt-2 text-sm">{message}</p>}
    </Notice>
  );
}
