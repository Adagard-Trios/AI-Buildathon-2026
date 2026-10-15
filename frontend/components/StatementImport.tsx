"use client";

/**
 * Photo-to-Portfolio: upload a broker statement, review the rows Gemini extracted, and add
 * only the ones you confirm. Nothing is saved here; confirmed rows join the editable
 * holdings table and the existing Save button persists them.
 */

import { useState } from "react";

import { Button, Card, Notice } from "@/components/ui";
import { request } from "@/lib/api/client";
import type { Holding } from "@/lib/api/types";

interface DraftRow {
  symbol: string;
  quantity: number;
  avg_cost: number | null;
  currency: string | null;
}

const MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

export function StatementImport({ onConfirm }: { onConfirm: (rows: Holding[]) => void }) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setError(null);
    setNote(null);
    if (!MIME.includes(file.type)) return setError("Use a PNG, JPEG, WebP or PDF file.");
    if (file.size > 8 * 1024 * 1024) return setError("The file is larger than 8 MB.");
    setBusy(true);
    try {
      const out = await request<{ draft_holdings: DraftRow[]; rejected: { reason: string }[] }>(
        "portfolio",
        "/portfolio/import-statement",
        { method: "POST", body: { content_base64: await toBase64(file), mime_type: file.type } },
      );
      setRows(out.draft_holdings);
      setPicked(new Set());
      if (out.rejected.length) setNote(`${out.rejected.length} row(s) could not be read and were skipped.`);
      if (!out.draft_holdings.length) setNote("No holdings were found in that file.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    onConfirm(
      rows
        .filter((r) => picked.has(r.symbol))
        .map((r) => ({
          symbol: r.symbol,
          quantity: r.quantity,
          // Statements rarely show live prices: start from cost, then "Refresh quotes" corrects it.
          current_price: r.avg_cost && r.avg_cost > 0 ? r.avg_cost : 1,
          avg_daily_volume: 0,
          cost_basis: r.avg_cost,
          currency: r.currency,
        })) as Holding[],
    );
    setRows([]);
    setPicked(new Set());
  }

  return (
    <Card title="Import from a statement" subtitle="Photograph or upload your broker statement. You confirm every row.">
      <input
        type="file"
        accept={MIME.join(",")}
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
        className="text-sm"
      />
      {busy && <p className="mt-2 text-sm text-neutral-500">Reading the statement…</p>}
      {error && <div className="mt-3"><Notice tone="error" title="Could not import">{error}</Notice></div>}
      {note && <p className="mt-2 text-sm text-neutral-500">{note}</p>}

      {rows.length > 0 && (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="pb-2">Add</th><th className="pb-2">Symbol</th><th className="pb-2 text-right">Quantity</th><th className="pb-2 text-right">Avg cost</th><th className="pb-2">Currency</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-t border-neutral-200/60">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`Add ${r.symbol}`}
                      checked={picked.has(r.symbol)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(r.symbol);
                        else next.delete(r.symbol);
                        setPicked(next);
                      }}
                    />
                  </td>
                  <td className="py-2 font-medium">{r.symbol}</td>
                  <td className="py-2 text-right">{r.quantity}</td>
                  <td className="py-2 text-right">{r.avg_cost ?? "—"}</td>
                  <td className="py-2">{r.currency ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-neutral-500">Check each row against your statement before adding it.</p>
          <div className="mt-3"><Button onClick={confirm} disabled={picked.size === 0}>Add {picked.size} confirmed row(s)</Button></div>
        </div>
      )}
    </Card>
  );
}
