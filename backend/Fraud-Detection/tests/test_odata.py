import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as fraud_app  # noqa: E402

c = TestClient(fraud_app.app)
R = "/odata/v1/fraud"


def test_verdicts_filter_and_metadata():
    c.post(f"{R}/CheckMessage", json={"text": "Guaranteed 30% monthly returns Quick Invest Capital"})
    c.post(f"{R}/CheckMessage", json={"text": "Lunch at 1pm?"})
    r = c.get(f"{R}/Verdicts", params={"$filter": "Level eq 'HIGH_RISK'", "$select": "Id,Level", "$count": "true"})
    assert r.status_code == 200
    body = r.json()
    assert body["@odata.count"] >= 1 and all(v["Level"] == "HIGH_RISK" for v in body["value"])
    assert "Verdicts" in c.get(f"{R}/$metadata").text
    assert any(s["name"] == "TransactionDecisions" for s in c.get(f"{R}/").json()["value"])


def test_decisions_and_errors():
    c.post(f"{R}/ScoreTransaction", json={"user_id": "u1", "amount": 100, "location": "Colombo, LK", "device_id": "d1"})
    assert c.get(f"{R}/TransactionDecisions", params={"$top": "1"}).json()["value"]
    bad = c.get(f"{R}/Verdicts", params={"$filter": "Nope eq 1"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "BadRequest"
    assert c.get(f"{R}/Nothing").status_code == 404
