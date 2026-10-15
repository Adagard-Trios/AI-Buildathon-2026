"""OData surface for Component 1: Plan action, CashPlans/PlanSteps sets, isolation, errors."""

from __future__ import annotations

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from service import events as events_mod
from service.api import app
from service.events import NullProducer
from tests.test_service import HOLDINGS

R = "/odata/v1/portfolio"
SECRET = "unit-test-secret-long-enough-0123456789abcdef"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(events_mod, "_producer_cache", {"producer": NullProducer()})
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    with TestClient(app) as c:
        yield c


def H(user_id: int) -> dict:
    now = int(time.time())
    t = jwt.encode({"sub": str(user_id), "iat": now, "exp": now + 600, "iss": "firststep-platform"},
                   SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


def test_plan_action_feeds_cash_plans_scoped_to_caller(client) -> None:
    body = {"holdings": HOLDINGS, "target_amount": 150_000, "urgency": 0.6, "deadline_days": 3}
    assert client.post(f"{R}/Plan", json=body).status_code == 401
    assert client.post(f"{R}/Plan", json=body, headers=H(7)).status_code == 200

    mine = client.get(f"{R}/CashPlans", headers=H(7), params={"$expand": "PlanSteps,Baselines", "$count": "true"}).json()
    assert mine["@odata.count"] >= 1
    plan = mine["value"][0]
    assert plan["PlanSteps"] and plan["Baselines"] and not any(k.startswith("_") for k in plan)

    assert client.get(f"{R}/CashPlans", headers=H(8)).json()["value"] == []
    assert client.get(f"{R}/PlanSteps", headers=H(8)).json()["value"] == []
    assert client.get(f"{R}/CashPlans('{plan['Id']}')", headers=H(8)).status_code == 404

    steps = client.get(f"{R}/PlanSteps", headers=H(7), params={"$filter": f"PlanId eq '{plan['Id']}'", "$orderby": "ExecutionDay"})
    assert steps.status_code == 200 and steps.json()["value"]


def test_metadata_errors_and_forecast_function(client) -> None:
    assert "CashPlans" in client.get(f"{R}/$metadata", headers=H(1)).text
    bad = client.get(f"{R}/CashPlans", headers=H(1), params={"$filter": "Nope eq 1"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "BadRequest"
    assert client.get(f"{R}/Forecast(Symbol='SPY',Horizon=99)", headers=H(1)).status_code == 400
    # No trained forecaster here: the function reports it as the same 503 the REST endpoint gives.
    assert client.get(f"{R}/Forecast(Symbol='SPY',Horizon=5)", headers=H(1)).status_code in (200, 503)
