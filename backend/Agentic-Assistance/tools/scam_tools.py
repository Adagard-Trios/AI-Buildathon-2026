import json
import os
import urllib.request

from langchain_core.tools import tool

FRAUD_URL = os.environ.get("FRAUD_URL", "http://localhost:8001")


@tool
def check_scam_message(message_text: str) -> str:
    """
    Check whether a message, offer or investment pitch is a scam.
    ALWAYS call this when the user forwards or pastes a suspicious message or offer.
    Returns the verdict level, fired rules and reasons.
    """
    req = urllib.request.Request(
        f"{FRAUD_URL}/shield/check",
        json.dumps({"text": message_text}).encode(),
        {"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            v = json.load(r)
    except Exception as exc:
        return f"Scam Shield is unavailable ({exc}). Do not state a verdict."
    return (
        f"SCAM VERDICT: {v['level']} (policy {v['policy_version']})\n"
        f"Verified: {v['verified']}\nRules fired: {', '.join(v['fired_rules']) or 'none'}\n"
        "Reasons:\n" + "\n".join(f"- {r}" for r in v["reasons"])
    )
