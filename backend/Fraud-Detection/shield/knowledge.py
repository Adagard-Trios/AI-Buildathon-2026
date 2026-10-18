"""The scam-pattern knowledge bundle, in Google's Open Knowledge Format (OKF v0.2).

knowledge/scam-patterns/ holds one markdown concept per pattern, each with YAML frontmatter
(type, title, description, sources, generated/verified, status, stale_after) plus two FirstStep
fields: `rules` (SHIELD-P001 rules that fire on it) and `flags` (red flags that indicate it).

A verdict carries the concepts it rests on, with each one's trust tier and sources, so a person
or another agent can check what the policy relied on. The bundle informs; it never decides:
the verdict is SHIELD-P001's alone.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

BUNDLE = Path(__file__).resolve().parents[1] / "knowledge" / "scam-patterns"
RESERVED = {"index.md", "log.md"}


def _frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    _, head, body = text.split("---", 2)
    return yaml.safe_load(head) or {}, body.strip()


def trust_tier(verified: Any) -> str:
    """OKF §5.3: none -> unverified; only non-human actors -> machine-confirmed; any human -> human-reviewed."""
    events = verified if isinstance(verified, list) else ([verified] if verified else [])
    actors = [str(e.get("by", "")) for e in events if isinstance(e, dict)]
    if not actors:
        return "unverified"
    return "human-reviewed" if any(a.startswith("human:") for a in actors) else "machine-confirmed"


def _stale(stale_after: Any) -> bool:
    if not stale_after:
        return False
    when = stale_after if isinstance(stale_after, datetime) else datetime.fromisoformat(str(stale_after).replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= when


@lru_cache(maxsize=1)
def concepts() -> tuple[dict[str, Any], ...]:
    """Every concept in the bundle. Unreadable files are skipped and logged, never fatal."""
    out = []
    for path in sorted(BUNDLE.glob("*.md")):
        if path.name in RESERVED:
            continue
        try:
            meta, _body = _frontmatter(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - one bad file must not take Scam Shield down
            logger.warning("skipping OKF concept %s: %s", path.name, exc)
            continue
        out.append({
            "id": path.stem,
            "type": meta.get("type", ""),
            "title": meta.get("title", path.stem),
            "description": meta.get("description", ""),
            "rules": list(meta.get("rules") or []),
            "flags": list(meta.get("flags") or []),
            "status": meta.get("status", "stable"),
            "trust": trust_tier(meta.get("verified")),
            "stale": _stale(meta.get("stale_after")),
            "sources": [{"title": s.get("title", s.get("resource")), "resource": s.get("resource")}
                        for s in (meta.get("sources") or []) if isinstance(s, dict)],
        })
    return tuple(out)


def patterns_for(fired_rules: list[str], flags: dict[str, Any]) -> list[dict[str, Any]]:
    """The scam patterns a verdict rests on: any rule of theirs fired, or any flag of theirs was read."""
    raised = {name for name, value in flags.items() if value is True}
    matched = []
    for c in concepts():
        if c["type"] != "Scam Pattern" or c["status"] == "deprecated":
            continue
        if set(c["rules"]) & set(fired_rules) or set(c["flags"]) & raised:
            matched.append({k: c[k] for k in ("id", "title", "description", "rules", "trust", "stale", "sources")})
    return matched
