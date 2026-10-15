"""Evidence tools: licensed-entity lookup, scam-script similarity, link checks."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

_DATA = Path(__file__).resolve().parent.parent / "data"
_ENTITIES = json.loads((_DATA / "licensed_entities.json").read_text("utf-8"))["entities"]
_SCRIPTS = json.loads((_DATA / "scam_corpus.json").read_text("utf-8"))["scripts"]
_TOKEN = re.compile(r"\w+")
_BRANDS = ("combank", "commercialbank", "peoplesbank", "hnb", "sampath", "paypal", "binance")
_OFFICIAL = {"combank.lk", "peoplesbank.lk", "hnb.lk", "sampath.lk", "paypal.com", "binance.com"}


def _tokens(s: str) -> set:
    return {t for t in _TOKEN.findall(s.lower()) if len(t) > 2}


def licensed_status(text: str) -> Optional[bool]:
    """True if a registered entity is named; False if an unregistered investment-style
    entity is implied; None if no entity can be detected."""
    low = text.lower()
    if any(name.lower() in low for name in _ENTITIES):
        return True
    return False if re.search(r"\b(?:invest\w*|capital|trading|forex|crypto|fx)\b", low) else None


def script_similarity(text: str) -> float:
    """Jaccard overlap with the closest known scam script (0-1)."""
    t = _tokens(text)
    best = 0.0
    for s in _SCRIPTS:
        st = _tokens(s["text"])
        if t and st:
            best = max(best, len(t & st) / len(t | st))
    return round(best, 4)


def lookalike(url: str) -> bool:
    """Brand name inside a host that is not the brand's official domain."""
    host = (urlparse(url).hostname or "").lower()
    squashed = host.replace("-", "").replace(".", "")
    official = any(host == d or host.endswith("." + d) for d in _OFFICIAL)
    return any(b in squashed for b in _BRANDS) and not official


# --- live link checks (opt-in; network failures mean "unknown", never "safe") ---------------------
def domain_age_days(host: str, timeout: float = 5.0) -> Optional[int]:
    """Days since registration via RDAP, when RDAP_ENABLED=true. None = unknown."""
    import os

    if os.environ.get("RDAP_ENABLED", "").lower() != "true" or not host:
        return None
    import json
    import urllib.request
    from datetime import datetime, timezone

    try:
        with urllib.request.urlopen(f"https://rdap.org/domain/{host}", timeout=timeout) as r:
            events = json.load(r).get("events", [])
        reg = next(e["eventDate"] for e in events if e.get("eventAction") == "registration")
        return max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(reg.replace("Z", "+00:00"))).days)
    except Exception:  # noqa: BLE001
        return None


def web_risk_hit(url: str, timeout: float = 5.0) -> bool:
    """True if Google Web Risk lists the URL (needs WEBRISK_API_KEY). False = not listed OR unavailable."""
    import os

    key = os.environ.get("WEBRISK_API_KEY")
    if not key:
        return False
    import json
    import urllib.parse
    import urllib.request

    q = urllib.parse.urlencode([("threatTypes", "MALWARE"), ("threatTypes", "SOCIAL_ENGINEERING"),
                                ("threatTypes", "UNWANTED_SOFTWARE"), ("uri", url), ("key", key)])
    try:
        with urllib.request.urlopen(f"https://webrisk.googleapis.com/v1/uris:search?{q}", timeout=timeout) as r:
            return bool(json.load(r).get("threat"))
    except Exception:  # noqa: BLE001
        return False
