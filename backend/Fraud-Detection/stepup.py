"""STEP-UP re-authentication (README 13.2, continuous verification).

A STEP-UP gateway decision must be satisfied with a fresh one-time code before the
transfer proceeds. Codes expire after 5 minutes and allow 3 attempts. Delivery (SMS/app) is
out of scope: in DEMO_MODE the code is returned in the challenge so the demo can show it.
"""

from __future__ import annotations

import hmac
import os
import secrets
import threading
import time
import uuid

TTL_SECONDS = 300
MAX_ATTEMPTS = 3
_challenges: dict = {}
_lock = threading.Lock()


def create_challenge(transaction_id: str, user_id: str, owner: str | None = None) -> dict:
    """user_id is the transaction's customer; owner is the authenticated caller who opened the
    challenge. Only the owner can answer it."""
    cid, code = str(uuid.uuid4()), f"{secrets.randbelow(10**6):06d}"
    with _lock:
        _challenges[cid] = {"code": code, "tx": transaction_id, "user": user_id, "owner": owner,
                            "expires": time.time() + TTL_SECONDS, "attempts": 0}
    out = {"challenge_id": cid, "expires_in": TTL_SECONDS}
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        out["demo_code"] = code
    return out


def verify_challenge(challenge_id: str, code: str, caller: str | None = None) -> dict:
    """caller: the authenticated subject. A challenge opened by a signed-in caller can only be
    answered by that caller, so a stolen challenge id and code are useless from another
    account. A mismatch looks exactly like an unknown challenge: no hint that the id exists."""
    with _lock:
        c = _challenges.get(challenge_id)
        if c is not None and c.get("owner") is not None and c["owner"] != caller:
            return {"verified": False, "reason": "challenge expired, used up or unknown"}
        if c is None or time.time() > c["expires"] or c["attempts"] >= MAX_ATTEMPTS:
            _challenges.pop(challenge_id, None)
            return {"verified": False, "reason": "challenge expired, used up or unknown"}
        c["attempts"] += 1
        if hmac.compare_digest(c["code"], code):
            _challenges.pop(challenge_id)
            return {"verified": True, "transaction_id": c["tx"], "user_id": c["user"]}
        return {"verified": False, "reason": "incorrect code", "attempts_left": MAX_ATTEMPTS - c["attempts"]}
