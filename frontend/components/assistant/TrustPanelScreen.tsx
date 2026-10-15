"use client";

/**
 * Trust Panel (README 10.3): anything that saves data, moves money or contacts someone is
 * shown here first and happens only after the user confirms it.
 */

import React, { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  addGuardian,
  confirmAction,
  pendingActions,
  rollbackAction,
  type PendingAction,
} from "@/lib/api/assistant";

export function TrustPanelScreen() {
  const [items, setItems] = useState<PendingAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [contact, setContact] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await pendingActions());
      setOffline(false);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 0 || cause.isUnavailable)) setOffline(true);
      else setError(cause instanceof Error ? cause.message : "Could not load pending actions");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function act(fn: (id: string) => Promise<unknown>, id: string) {
    setError(null);
    try {
      await fn(id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action failed");
    }
  }

  async function saveGuardian() {
    setError(null);
    try {
      await addGuardian(contact);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the contact");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-black/10 bg-white p-5 shadow-xs dark:border-white/15 dark:bg-neutral-900">
        <h2 className="text-2xl font-bold">Trust Panel</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Nothing below happens until you confirm it. You stay in control.
        </p>
      </div>

      {offline && (
        <Notice tone="info" title="Assistant service is not running">
          Start it with <code>docker compose up component4</code>.
        </Notice>
      )}
      {error && <Notice tone="error" title="Something went wrong">{error}</Notice>}

      <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-neutral-900">
        <h3 className="mb-3 text-base font-semibold">Waiting for your confirmation</h3>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">No pending actions.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.Id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {a.Kind.replace("_", " ")}
                  {a.To ? ` → ${a.To}` : ""}
                </p>
                <p className="mt-1 text-sm">{a.Summary}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {a.Reversible ? "You can undo this later." : "This cannot be undone once confirmed."}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => act(confirmAction, a.Id)}>Confirm</Button>
                  <Button onClick={() => act(rollbackAction, a.Id)}>Cancel</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/15 dark:bg-neutral-900">
        <h3 className="text-base font-semibold">Family Guardian</h3>
        <p className="mb-3 text-sm text-neutral-500">
          If a message is judged very likely a scam, this contact gets a short alert with the reason, never the
          message itself.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Contact (phone or email)">
            <Input value={contact} onChange={(e) => { setContact(e.target.value); setSaved(false); }} />
          </Field>
          <Button onClick={saveGuardian} disabled={contact.trim().length < 3}>Save</Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </div>
    </div>
  );
}
