"""Negative suite (README 20): no token, wrong audience, expired, tampered, bad scope, step-up abuse."""

import sys
import time
from pathlib import Path

import jwt
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
SECRET = "unit-test-secret-long-enough-0123456789abcdef"

from fastapi.testclient import TestClient  # noqa: E402

import app as fraud_app  # noqa: E402
import stepup  # noqa: E402


@pytest.fixture
def c(monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("JWT_SECRET", SECRET)
    return TestClient(fraud_app.app)


def tok(secret=SECRET, exp=3600, **claims):
    now = int(time.time())
    base = {"sub": "1", "iat": now, "exp": now + exp, "iss": "firststep-platform"}
    return {"Authorization": "Bearer " + jwt.encode({**base, **claims}, secret, algorithm="HS256")}


ROUTES = [("post", "/shield/check", {"text": "hi"}), ("get", "/odata/v1/fraud/Verdicts", None),
          ("get", "/audit", None), ("post", "/odata/v1/fraud/CheckMessage", {"text": "hi"})]


def call(c, method, path, body, headers=None):
    return getattr(c, method)(path, headers=headers or {}, **({"json": body} if body else {}))


@pytest.mark.parametrize("method,path,body", ROUTES)
def test_no_token_wrong_secret_expired_alg_none(c, method, path, body):
    assert call(c, method, path, body).status_code == 401
    assert call(c, method, path, body, tok(secret="x" * 40)).status_code == 401
    assert call(c, method, path, body, tok(exp=-10)).status_code == 401
    none_tok = jwt.encode({"sub": "1", "exp": int(time.time()) + 99, "iat": 1, "iss": "firststep-platform"},
                          None, algorithm="none")
    assert call(c, method, path, body, {"Authorization": f"Bearer {none_tok}"}).status_code == 401


def test_service_token_audience_and_scope(c):
    wrong = tok(typ="service", aud=["portfolio"], scope="fraud.read")
    assert c.get("/audit", headers=wrong).status_code == 403
    right = tok(typ="service", aud=["fraud"], scope="fraud.read")
    assert c.get("/audit", headers=right).status_code == 200


def test_user_token_ok_and_health_public(c):
    assert c.get("/audit", headers=tok()).status_code == 200
    assert c.get("/health").status_code == 200


def test_denial_message_does_not_reveal_reason(c):
    assert c.get("/audit", headers=tok(exp=-10)).json() == c.get("/audit").json()


def test_stepup_flow_and_abuse(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    ch = stepup.create_challenge("t1", "u1")
    assert stepup.verify_challenge(ch["challenge_id"], "000000")["verified"] is False or ch["demo_code"] == "000000"
    ch = stepup.create_challenge("t1", "u1")
    assert stepup.verify_challenge(ch["challenge_id"], ch["demo_code"])["verified"] is True
    assert stepup.verify_challenge(ch["challenge_id"], ch["demo_code"])["verified"] is False  # single use
    ch = stepup.create_challenge("t2", "u1")
    wrong = "111111" if ch["demo_code"] != "111111" else "222222"
    for _ in range(3):
        stepup.verify_challenge(ch["challenge_id"], wrong)
    assert stepup.verify_challenge(ch["challenge_id"], ch["demo_code"])["verified"] is False  # locked out
    monkeypatch.setenv("DEMO_MODE", "false")
    assert "demo_code" not in stepup.create_challenge("t3", "u1")


def test_campaigns_institution_only_and_grouping(c):
    from shield.radar import campaigns

    V = lambda lvl, f, e: {"Level": lvl, "FeatureKey": f, "EntityHash": e, "ReasonCodes": "S1", "CreatedAt": "2026-10-01"}
    got = campaigns([V("HIGH_RISK", "a", "h1"), V("HIGH_RISK", "b", "h1"), V("CAUTION", "b", ""),
                     V("HIGH_RISK", "z", ""), V("LOW_RISK", "a", "h1")])
    assert len(got) == 1 and got[0]["Size"] == 3  # h1 links a/b; b links the third; z alone; LOW ignored
    assert c.get("/odata/v1/fraud/Campaigns", headers=tok()).status_code == 403
    inst = tok(typ="service", aud=["fraud"], scope="campaigns.read")
    assert c.get("/odata/v1/fraud/Campaigns", headers=inst).status_code == 200


def test_stepup_is_bound_to_the_signed_in_user(c, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    ch = c.post("/step-up/challenge", json={"transaction_id": "t", "user_id": "u_1001"}, headers=tok(sub="1")).json()
    # another account holding the id AND the code still cannot satisfy it
    other = c.post("/step-up/verify", json={"challenge_id": ch["challenge_id"], "code": ch["demo_code"]}, headers=tok(sub="2"))
    assert other.json() == {"verified": False, "reason": "challenge expired, used up or unknown"}
    mine = c.post("/step-up/verify", json={"challenge_id": ch["challenge_id"], "code": ch["demo_code"]}, headers=tok(sub="1"))
    assert mine.json()["verified"] is True and mine.json()["user_id"] == "u_1001"


def test_customers_only_see_their_own_transfer_decisions(c):
    tx = {"amount": 1200.0, "location": "Colombo, LK", "device_id": "dev_1"}
    assert c.post("/score", json={**tx, "user_id": "1"}, headers=tok(sub="1")).status_code == 200
    assert c.post("/score", json={**tx, "user_id": "2"}, headers=tok(sub="2")).status_code == 200
    mine = c.get("/odata/v1/fraud/TransactionDecisions", headers=tok(sub="1")).json()["value"]
    assert mine and {r["UserId"] for r in mine} == {"1"}
    assert {e["user_id"] for e in c.get("/audit", headers=tok(sub="1")).json()["entries"]} == {"1"}
    # a back-office service identity with fraud.read sees everyone; without it, nothing
    everyone = c.get("/odata/v1/fraud/TransactionDecisions", headers=tok(typ="service", aud=["fraud"], scope="fraud.read")).json()["value"]
    assert {"1", "2"} <= {r["UserId"] for r in everyone}
    assert c.get("/audit", headers=tok(typ="service", aud=["fraud"], scope="")).json()["entries"] == []


def test_decision_events_carry_the_authenticated_owner(c, monkeypatch):
    import events

    sent = []
    monkeypatch.setattr(events, "publish", sent.append)
    c.post("/shield/check", json={"text": "Guaranteed 30% monthly returns, pay now"}, headers=tok(sub="9"))
    c.post("/score", json={"transaction_id": "tx_abc", "user_id": "u_1001", "amount": 10.0, "location": "Colombo, LK", "device_id": "d"}, headers=tok(sub="9"))
    assert [e["owner"] for e in sent] == ["9", "9"]
    assert sent[1]["event_id"] == "tx_abc"
    assert sent[1]["principal"] == "u_1001"  # the bank customer on the transfer is kept separately
