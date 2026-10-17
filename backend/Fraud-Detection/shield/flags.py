"""Red-flag extraction. Gemini when GEMINI_API_KEY is set, rule-based fallback otherwise."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from typing import Optional, Tuple

# English plus a few Sinhala/Tamil cues. Unvalidated for those languages (README 22.2).
_PATTERNS = {
    "guaranteed_return": r"guarantee|risk[- ]free|double your money|\d+\s?%\s*(?:monthly|weekly|daily|per month)|සහතික|உத்தரவாத",
    "personal_account_payment": r"personal account|usdt|bitcoin|\bbtc\b|wallet|send (?:payment|money)|ගිණුමට|கணக்கில்",
    "impersonates_authority": r"bank account.{0,30}(?:suspend|freeze|frozen|block)|verify your details|central bank|regulator|sec notice",
    "urgency": r"only \d+ slots?|limited seats|immediately|last chance|countdown|expires",
}
_WEIGHT = {"guaranteed_return": 0.45, "personal_account_payment": 0.30,
           "impersonates_authority": 0.45, "urgency": 0.20}
_URL = re.compile(r"https?://[^\s]+", re.I)


def heuristic_flags(text: str) -> dict:
    return {k: bool(re.search(p, text, re.I)) for k, p in _PATTERNS.items()}


def gemini_flags(text: str, timeout: float = 15.0) -> Optional[dict]:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
    prompt = ("Answer true or false for each key about this message. Return JSON only with keys "
              f"{list(_PATTERNS)}.\n\nMessage:\n{text[:4000]}")
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"responseMimeType": "application/json"}}).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        body, {"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = json.load(r)["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(raw)
        return {k: bool(data.get(k)) for k in _PATTERNS}
    except Exception:  # network, quota, malformed output: fall back, never fail the check
        return None


def extract(text: str) -> Tuple[dict, str]:
    flags = gemini_flags(text)
    return (flags, "gemini") if flags else (heuristic_flags(text), "rules")


def combined_risk(flags: dict) -> float:
    """Noisy-or of flag weights."""
    keep = 1.0
    for k, on in flags.items():
        if on:
            keep *= 1 - _WEIGHT[k]
    return round(1 - keep, 4)


def urls(text: str) -> list:
    return _URL.findall(text)
