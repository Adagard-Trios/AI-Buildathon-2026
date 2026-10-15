import time

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import trust_panel
from odata import install_error_handler

SECRET = "unit-test-secret-long-enough-0123456789abcdef"


@pytest.fixture
def c(monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.delenv("GUARDIAN_WEBHOOK", raising=False)
    trust_panel.PENDING.clear(); trust_panel.GUARDIANS.clear(); trust_panel.CONVERSATIONS.clear()
    app = FastAPI(); install_error_handler(app)
    for r in trust_panel.build_routers():
        app.include_router(r)
    return TestClient(app)


def H(sub):
    now = int(time.time())
    t = jwt.encode({"sub": sub, "iat": now, "exp": now + 600, "iss": "firststep-platform"}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


R = "/odata/v1/assistant"


def test_requires_auth(c):
    assert c.get(f"{R}/PendingActions").status_code == 401
    assert c.post(f"{R}/Confirm", json={"id": "x"}).status_code == 401


def test_confirm_flow_and_isolation(c):
    row = trust_panel.add_pending("1", {"text": "scam alert", "to": "+94"})
    assert c.get(f"{R}/PendingActions", headers=H("2")).json()["value"] == []
    assert c.post(f"{R}/Confirm", json={"id": row["Id"]}, headers=H("2")).status_code == 404
    ok = c.post(f"{R}/Confirm", json={"id": row["Id"]}, headers=H("1"))
    assert ok.json()["Status"] == "confirmed" and ok.json()["Delivery"] == "queued"
    assert c.post(f"{R}/Confirm", json={"id": row["Id"]}, headers=H("1")).status_code == 409
    assert c.post(f"{R}/Rollback", json={"id": row["Id"]}, headers=H("1")).status_code == 409  # alert can't be unsent


def test_cancel_pending_and_reversible_rollback(c):
    a = trust_panel.add_pending("1", {"text": "x"})
    assert c.post(f"{R}/Rollback", json={"id": a["Id"]}, headers=H("1")).json()["Status"] == "cancelled"
    b = trust_panel.add_pending("1", {"text": "save"}, kind="save_holdings", reversible=True)
    c.post(f"{R}/Confirm", json={"id": b["Id"]}, headers=H("1"))
    assert c.post(f"{R}/Rollback", json={"id": b["Id"]}, headers=H("1")).json()["Status"] == "rolled_back"


def test_guardians_scoped(c):
    assert c.post(f"{R}/Guardians", json={"contact": "+94770000000"}, headers=H("1")).status_code == 201
    assert trust_panel.guardian_for("1") == "+94770000000" and trust_panel.guardian_for("2") is None
    assert len(c.get(f"{R}/Guardians", headers=H("1")).json()["value"]) == 1
    assert c.get(f"{R}/Guardians", headers=H("2")).json()["value"] == []
