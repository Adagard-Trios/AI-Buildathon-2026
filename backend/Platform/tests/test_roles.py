"""Staff roles and the starting data each account gets."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from service.api import app

STAFF = "admin@firststep.demo:admin auditor;auditor@firststep.demo:auditor"
PASSWORD = "a-staff-passphrase-long-enough"


@pytest.fixture
def staffed(monkeypatch):
    monkeypatch.setenv("PLATFORM_ROLES", STAFF)
    monkeypatch.setenv("PLATFORM_STAFF_PASSWORD", PASSWORD)
    with TestClient(app) as test_client:   # lifespan provisions the staff accounts
        yield test_client


def _login(client, email, password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_staff_accounts_are_provisioned_with_their_roles(staffed):
    response = _login(staffed, "admin@firststep.demo")
    assert response.status_code == 200, response.text
    assert response.json()["user"]["roles"] == ["admin", "auditor"]

    token = _login(staffed, "auditor@firststep.demo").json()["access_token"]
    me = staffed.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["roles"] == ["auditor"]


def test_staff_addresses_cannot_be_self_registered(staffed):
    response = staffed.post("/auth/register", json={
        "email": "ADMIN@firststep.demo", "display_name": "squatter", "password": "another-passphrase"})
    assert response.status_code == 403


def test_customers_get_no_roles(registered):
    _, user = registered()
    assert user["roles"] == []


def test_short_staff_password_provisions_nothing(monkeypatch):
    monkeypatch.setenv("PLATFORM_ROLES", STAFF)
    monkeypatch.setenv("PLATFORM_STAFF_PASSWORD", "short")
    with TestClient(app) as client:
        assert _login(client, "admin@firststep.demo", "short").status_code == 401


def test_new_accounts_get_a_starter_portfolio_when_enabled(monkeypatch, client, registered):
    monkeypatch.setenv("PLATFORM_STARTER_PORTFOLIO", "true")
    headers, _ = registered()
    portfolios = client.get("/portfolios", headers=headers).json()
    assert len(portfolios) == 1
    book = client.get(f"/portfolios/{portfolios[0]['id']}", headers=headers).json()
    assert {h["symbol"] for h in book["holdings"]} == {"JKH.N0000", "COMB.N0000", "AAPL", "SPY", "BTCUSDT"}
    assert book["base_currency"] == "LKR"


def test_starter_portfolio_is_off_by_default(client, registered):
    headers, _ = registered()
    assert client.get("/portfolios", headers=headers).json() == []
