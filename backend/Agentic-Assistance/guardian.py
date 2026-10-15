"""Family Guardian: on HIGH_RISK, alert a nominated contact with the reason, never the message."""

from __future__ import annotations

import os
from typing import Optional


def build_alert(verdict: dict, contact: Optional[str]) -> Optional[dict]:
    if os.environ.get("GUARDIAN_ENABLED", "true").lower() != "true":
        return None
    if verdict.get("level") != "HIGH_RISK" or not contact:
        return None
    return {
        "to": contact,
        "text": "FirstStep flagged a message your family member received as very likely a scam. "
                "Reason: " + " ".join(verdict.get("reasons", [])),
        "includes_message_content": False,
        "status": "pending_confirmation",  # Trust Panel: user confirms before anyone is contacted
    }
