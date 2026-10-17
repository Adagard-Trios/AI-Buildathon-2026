"""The agent's tools call the real components with the caller's token, and say so when they
fall back to sample data."""

import io
import json
import urllib.error

import tools.services as services
from caller_context import reset_caller, set_caller
from tools.audit_tools import get_blockchain_audit
from tools.fraud_tools import get_fraud_analysis
from tools.portfolio_tools import get_portfolio_analysis


def fake_http(monkeypatch, routes: dict):
    """routes: url-substring -> json body, or an int HTTP status to fail with."""
    seen = []

    def urlopen(req, timeout=None):
        url = req.full_url
        seen.append((url, dict((k.lower(), v) for k, v in req.header_items())))
        for key, body in routes.items():
            if key in url:
                if isinstance(body, int):
                    raise urllib.error.HTTPError(url, body, "x", {}, None)
                return io.BytesIO(json.dumps(body).encode())
        raise urllib.error.URLError("no route")

    monkeypatch.setattr(services.urllib.request, "urlopen", urlopen)
    return seen


def with_user(fn):
    ctx = set_caller("Bearer user-7")
    try:
        return fn()
    finally:
        reset_caller(ctx)


def test_unconfigured_services_are_labelled_sample(monkeypatch):
    for env in ("FRAUD_URL", "AUDIT_URL", "PLATFORM_URL"):
        monkeypatch.delenv(env, raising=False)
    assert get_fraud_analysis.invoke({"transaction_id": ""}).strip().startswith("SAMPLE DATA")
    assert get_blockchain_audit.invoke({"transaction_id": "TX1001"}).strip().startswith("SAMPLE DATA")
    assert get_portfolio_analysis.invoke({}).strip().startswith("SAMPLE DATA")


def test_fraud_tool_reads_the_users_latest_decision_with_their_token(monkeypatch):
    monkeypatch.setenv("FRAUD_URL", "http://fraud:8001")
    row = {"Id": "tx_1", "Action": "STEP-UP", "RiskScore": 0.62, "BehaviouralScore": 0.4,
           "RelationalScore": 0.7, "Reason": "new beneficiary", "CreatedAt": 1.0}
    seen = fake_http(monkeypatch, {"TransactionDecisions?": {"value": [row]}})
    out = with_user(lambda: get_fraud_analysis.invoke({"transaction_id": ""}))
    assert "STEP-UP" in out and "0.62" in out and "SAMPLE" not in out
    url, headers = seen[0]
    assert "%24orderby=CreatedAt%20desc" in url or "$orderby=CreatedAt%20desc" in url
    assert headers["authorization"] == "Bearer user-7"


def test_fraud_tool_not_found_does_not_reveal_other_users(monkeypatch):
    monkeypatch.setenv("FRAUD_URL", "http://fraud:8001")
    fake_http(monkeypatch, {"TransactionDecisions(": 404})
    out = with_user(lambda: get_fraud_analysis.invoke({"transaction_id": "someone-elses"}))
    assert out.startswith("No transfer was found")


def test_fraud_tool_outage_forbids_inventing_a_decision(monkeypatch):
    monkeypatch.setenv("FRAUD_URL", "http://fraud:8001")
    fake_http(monkeypatch, {})
    assert "Do not state a decision" in with_user(lambda: get_fraud_analysis.invoke({"transaction_id": "x"}))


def test_audit_tool_fetches_and_verifies(monkeypatch):
    monkeypatch.setenv("AUDIT_URL", "http://audit:8002")
    fake_http(monkeypatch, {
        "AuditRecords(": {"Id": "v1", "Decision": "HIGH_RISK", "ModelVersion": "gemini", "PolicyVersion": "SHIELD-P001",
                          "CreatedAt": "2026-10-17", "AnchorStatus": "RECORDED_ON_CHAIN"},
        "Verify(": {"verified": True, "status": "VERIFIED", "message": "hash matches"},
    })
    out = with_user(lambda: get_blockchain_audit.invoke({"transaction_id": "v'1"}))
    assert "VERIFIED (verified: True)" in out and "SHIELD-P001" in out


def test_portfolio_tool_summarises_only_what_the_platform_returns(monkeypatch):
    monkeypatch.setenv("PLATFORM_URL", "http://platform:8100")
    fake_http(monkeypatch, {
        "/portfolios/3": {"id": 3, "name": "My shares", "base_currency": "LKR", "holdings": [
            {"symbol": "JKH", "quantity": 100, "current_price": 200.0, "avg_daily_volume": 5000.0},
            {"symbol": "COMB", "quantity": 100, "current_price": 100.0, "avg_daily_volume": 0},
        ]},
        "/portfolios": [{"id": 3}],
    })
    out = with_user(lambda: get_portfolio_analysis.invoke({}))
    assert "Total Value: LKR 30,000.00" in out
    assert "JKH: LKR 20,000.00 (66.7%), 4.0 days of average trading" in out
    assert "COMB: LKR 10,000.00 (33.3%), liquidity unknown" in out
