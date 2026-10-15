import sys
import time
from pathlib import Path

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main  # noqa: E402

SECRET = "unit-test-secret-long-enough-0123456789abcdef"


@pytest.fixture
def c(monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("UPSTREAM_FRAUD", "http://fraud.test")
    return TestClient(main.app)


def tok(**claims):
    now = int(time.time())
    return {"Authorization": "Bearer " + jwt.encode(
        {"sub": "1", "iat": now, "exp": now + 600, "iss": "firststep-platform", **claims}, SECRET, algorithm="HS256")}


def test_rejects_without_token_and_unknown_services(c):
    assert c.get("/odata/v1/fraud/Verdicts").status_code == 401
    assert c.get("/odata/v1/nope/X", headers=tok()).status_code == 404
    assert c.get("/odata/v1/audit/X", headers=tok()).status_code == 404  # not configured


def test_forwards_with_auth_header_and_query(c, monkeypatch):
    seen = {}

    async def fake(self, method, url, params=None, content=None, headers=None):
        seen.update(method=method, url=url, params=dict(params), auth=headers.get("authorization"))
        return httpx.Response(200, json={"value": []})

    monkeypatch.setattr(httpx.AsyncClient, "request", fake)
    h = tok()
    r = c.get("/odata/v1/fraud/Verdicts?$top=1", headers=h)
    assert r.status_code == 200 and r.json() == {"value": []}
    assert seen["url"] == "http://fraud.test/odata/v1/fraud/Verdicts" and seen["params"] == {"$top": "1"}
    assert seen["auth"] == h["Authorization"]   # upstream re-verifies the same token


def test_upstream_down_is_502(c, monkeypatch):
    async def boom(self, *a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx.AsyncClient, "request", boom)
    assert c.get("/odata/v1/fraud/Verdicts", headers=tok()).status_code == 502
