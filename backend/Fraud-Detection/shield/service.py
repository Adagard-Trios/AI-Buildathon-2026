"""Scam Shield: evidence in, SHIELD-P001 verdict out. Message text is never stored."""

from __future__ import annotations

import hashlib
import threading
from urllib.parse import urlparse
import uuid
from collections import deque
from datetime import datetime, timezone
from dataclasses import asdict

from . import evidence as ev
from . import flags as fl
from . import routing
from .policy import Evidence, evaluate


# Verdict summaries for the OData Verdicts set. The message text is never kept.
VERDICTS: deque = deque(maxlen=1000)
_lock = threading.Lock()


def check_message(text: str) -> dict:
    flags, source = routing.extract(text)
    links = fl.urls(text)
    lookalikes = [u for u in links if ev.lookalike(u)]
    # A lookalike host counts as brand new; otherwise the youngest RDAP age (RDAP_ENABLED=true).
    ages = sorted([0] * bool(lookalikes) + [a for a in (ev.domain_age_days(urlparse(u).hostname or "") for u in links) if a is not None])
    risk = fl.combined_risk(flags)
    if any(ev.web_risk_hit(u) for u in links):  # Web Risk listing feeds the combined score (-> S6)
        risk = round(1 - (1 - risk) * (1 - 0.8), 4)
    evidence = Evidence(
        guaranteed_return=flags["guaranteed_return"],
        entity_licensed=ev.licensed_status(text),
        personal_account_payment=flags["personal_account_payment"],
        script_similarity=ev.script_similarity(text),
        domain_age_days=ages[0] if ages else None,
        impersonates_authority=flags["impersonates_authority"] or bool(lookalikes),
        risk_score=risk,
    )
    verdict = evaluate(evidence)
    result = {
        "id": str(uuid.uuid4()),
        "level": verdict.level,
        "verified": verdict.verified,
        "fired_rules": verdict.fired_rules,
        "reasons": verdict.reasons,
        "policy_version": verdict.policy_version,
        "flag_source": source,
        "flags": flags,
        "evidence": asdict(evidence),
        "links": links,
    }
    with _lock:
        VERDICTS.append({
            "Id": result["id"], "Level": result["level"], "Verified": result["verified"],
            "ReasonCodes": ",".join(result["fired_rules"]), "PolicyVersion": result["policy_version"],
            "FlagSource": result["flag_source"],
            # Anonymised campaign features: hashes only, never text (README 8.4).
            "FeatureKey": hashlib.sha256(",".join(k for k, v in sorted(flags.items()) if v).encode()).hexdigest()[:16],
            "EntityHash": hashlib.sha256(",".join(sorted(urlparse(u).hostname or "" for u in links)).encode()).hexdigest()[:16] if links else "",
            "CreatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
    import events  # local import: events lives beside app.py, not in the package

    events.publish(events.build_event(
        "scam.verdict", {"links": len(links)},  # the message text is never published
        {"level": result["level"], "fired_rules": result["fired_rules"]},
        model_version=source, policy_version=result["policy_version"]))
    return result
