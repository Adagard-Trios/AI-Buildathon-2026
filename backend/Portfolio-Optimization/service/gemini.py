"""Minimal Gemini REST client (no SDK dependency). Raises GeminiUnavailable without a key."""

from __future__ import annotations

import json
import os
import urllib.request


class GeminiUnavailable(RuntimeError):
    pass


def generate_json(parts: list[dict], *, timeout: float = 60.0) -> dict:
    """parts: [{"text": ...} | {"inline_data": {"mime_type": ..., "data": <base64>}}]."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise GeminiUnavailable("GEMINI_API_KEY is not set")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    body = json.dumps({"contents": [{"parts": parts}],
                       "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body,
        {"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(json.load(r)["candidates"][0]["content"]["parts"][0]["text"])
    except Exception as exc:  # network, quota, malformed output
        raise GeminiUnavailable(f"Gemini call failed: {exc}") from exc
