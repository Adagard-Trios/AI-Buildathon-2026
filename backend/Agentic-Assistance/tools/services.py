"""Calls from the agent's tools to the other components, on the user's behalf.

Every call carries the CALLER's own bearer token (caller_context), so each component applies
its own row-level authorisation: through the agent a user reaches exactly what they could
reach directly, never more.

When a component's URL is not configured (unit tests, a laptop without the full stack) the
tools fall back to the bundled sample dataset and SAY so in their output, so neither the
model nor the user can mistake sample figures for the customer's real data.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

from caller_context import auth_headers

SAMPLE_FILE = Path(__file__).resolve().parent.parent / "data" / "mock_financial_data.json"
SAMPLE_NOTICE = "SAMPLE DATA: this service is not connected, so these are example figures, not the user's."


class ServiceError(Exception):
    """The component answered with an error, or could not be reached."""


def base_url(env: str) -> Optional[str]:
    value = os.environ.get(env, "").strip()
    return value.rstrip("/") or None


def get_json(url: str, timeout: float = 15.0) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/json", **auth_headers()})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise ServiceError(f"HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ServiceError(str(getattr(exc, "reason", exc))) from None


def odata_key(value: str) -> str:
    """OData string key literal: quotes doubled, then URL-encoded."""
    return urllib.parse.quote("'" + value.replace("'", "''") + "'", safe="")


def load_sample() -> dict:
    with open(SAMPLE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)
