"""Model routing (README 6.4): Laya fast path where validated, Gemini otherwise, 5% shadow check.

Order: Laya (validated language, short text) -> Gemini -> rules. Escalate to Gemini when the
language is unvalidated, the text is longer than Laya's window, or Laya's own answer lands in
the CAUTION band. Laya's confidence is never used for escalation (README 6.6).
"""

from __future__ import annotations

import json
import os
import random
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from . import flags as fl

MAX_CHARS = 1500  # proxy for Laya's 512-token window
SHADOW_LOG = Path(__file__).resolve().parent.parent / "shadow_log.jsonl"


def detect_language(text: str) -> str:
    si = sum("඀" <= c <= "෿" for c in text)
    ta = sum("஀" <= c <= "௿" for c in text)
    if si or ta:
        return "si" if si >= ta else "ta"
    return "en"


def validated_languages() -> set:
    return {l.strip() for l in os.environ.get("LAYA_LANGS_VALIDATED", "").split(",") if l.strip()}


def laya_flags(text: str, timeout: float = 5.0) -> Optional[dict]:
    url = os.environ.get("LAYA_ENDPOINT")
    if not url:
        return None
    req = urllib.request.Request(
        url.rstrip("/") + "/classify", json.dumps({"head": "scam_flags", "texts": [text]}).encode(),
        {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ans = json.load(r)["answers"][0]
        # noul answers are P(true); 0.5 cut-off. ponytail: tune per head after calibration (eval.py).
        return {k: float(_p(ans.get(k))) >= 0.5 for k in fl._PATTERNS}
    except Exception:  # service down, 503 (no checkpoint), malformed: fall through to Gemini
        return None


def _p(a) -> float:
    return a.get("probability", a.get("p", 0.0)) if isinstance(a, dict) else float(a or 0.0)


def _level_is_caution(flags: dict) -> bool:
    from .policy import Evidence, evaluate

    return evaluate(Evidence(guaranteed_return=flags["guaranteed_return"],
                             personal_account_payment=flags["personal_account_payment"],
                             impersonates_authority=flags["impersonates_authority"],
                             risk_score=fl.combined_risk(flags))).level == "CAUTION"


def _shadow(text: str, laya: dict, lang: str) -> None:
    ref = fl.gemini_flags(text)
    if ref is None or ref == laya:
        return
    try:
        with SHADOW_LOG.open("a", encoding="utf-8") as f:  # flags only, never the text
            f.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                "lang": lang, "laya": laya, "gemini": ref}) + "\n")
    except OSError:
        pass


def extract(text: str, rng: random.Random = random) -> Tuple[dict, str]:
    lang = detect_language(text)
    if lang in validated_languages() and len(text) <= MAX_CHARS:
        flags = laya_flags(text)
        if flags is not None:
            if _level_is_caution(flags):
                g = fl.gemini_flags(text)
                if g:
                    return g, "gemini(escalated)"
            elif rng.random() < float(os.environ.get("SHADOW_RATE", "0.05")):
                _shadow(text, flags, lang)
            return flags, "laya"
    return fl.extract(text)
