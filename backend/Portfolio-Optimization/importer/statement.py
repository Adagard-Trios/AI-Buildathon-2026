"""Photo-to-Portfolio: Gemini reads a broker statement into DRAFT holdings.

Nothing is saved here. Every row comes back needs_confirmation=True; the user confirms each
row before it reaches the platform service (README 7.1).
"""

from __future__ import annotations

import base64
import re

from service.gemini import generate_json

ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp", "application/pdf"}
MAX_BYTES = 8 * 1024 * 1024

PROMPT = (
    "Extract the holdings table from this broker or depository statement. Return JSON "
    '{"holdings":[{"symbol":str,"quantity":number,"avg_cost":number|null,"currency":str|null}]}. '
    "Copy values exactly as printed; use null when a value is not visible. Do not invent rows."
)


def validate_rows(raw: object) -> dict:
    """Normalise model output. Bad rows are reported, never silently repaired."""
    rows = raw.get("holdings", []) if isinstance(raw, dict) else []
    out, rejected, seen = [], [], set()
    for i, r in enumerate(rows if isinstance(rows, list) else []):
        try:
            symbol = re.sub(r"\s+", "", str(r["symbol"])).upper()
            qty = float(r["quantity"])
            cost = None if r.get("avg_cost") in (None, "") else float(r["avg_cost"])
            cur = str(r["currency"]).upper() if r.get("currency") else None
        except (KeyError, TypeError, ValueError):
            rejected.append({"index": i, "reason": "missing or non-numeric field"})
            continue
        if not symbol or qty <= 0 or (cost is not None and cost < 0):
            rejected.append({"index": i, "reason": "empty symbol, non-positive quantity or negative cost"})
        elif symbol in seen:
            rejected.append({"index": i, "reason": f"duplicate symbol {symbol}"})
        else:
            seen.add(symbol)
            out.append({"symbol": symbol, "quantity": qty, "avg_cost": cost, "currency": cur,
                        "needs_confirmation": True})
    return {"draft_holdings": out, "rejected": rejected}


def import_statement(data: bytes, mime: str) -> dict:
    if mime not in ALLOWED_MIME:
        raise ValueError(f"Unsupported file type {mime}")
    if not data or len(data) > MAX_BYTES:
        raise ValueError("File is empty or larger than 8 MB")
    raw = generate_json([{"text": PROMPT},
                         {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}])
    return validate_rows(raw)
