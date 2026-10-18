import json
import os
import urllib.request

from langchain_core.tools import tool

import re

from caller_context import auth_headers, user_message

FRAUD_URL = os.environ.get("FRAUD_URL", "http://localhost:8001")


@tool
def check_scam_message(message_text: str) -> str:
    """
    Check whether a message, offer or investment pitch is a scam.
    ALWAYS call this when the user forwards or pastes a suspicious message or offer.
    Returns the verdict level, fired rules and reasons.
    """
    # The model tends to pass a shortened paraphrase, which drops what the policy needs (the
    # fund's name for the licence check, the exact wording for script similarity). When the
    # user's own message is substantially longer, check that instead, so the assistant and
    # Scam Shield reach the same verdict on the same message.
    original = re.sub(r"^\s*\[Reply in [^\]]*\]\s*", "", user_message() or "")
    if len(original) > len(message_text) * 1.2:
        message_text = original
    req = urllib.request.Request(
        f"{FRAUD_URL}/shield/check",
        json.dumps({"text": message_text}).encode(),
        {"Content-Type": "application/json", **auth_headers()},
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
