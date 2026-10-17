"""shared/auth/zt_auth.py in RS256 mode: keys come from the platform's JWKS over HTTP, and this
service accepts nothing it could have minted itself."""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app as fraud_app  # noqa: E402
import zt_auth  # noqa: E402

SECRET = "unit-test-secret-long-enough-0123456789abcdef"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)
KID = "test-kid-1"


def _jwk(key, kid):
    return {**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key())), "kid": kid, "alg": "RS256", "use": "sig"}


@pytest.fixture(scope="module")
def jwks_url():
    body = json.dumps({"keys": [_jwk(KEY, KID)]}).encode()

    class H(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/.well-known/jwks.json"
    srv.shutdown()


@pytest.fixture
def c(monkeypatch, jwks_url):
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("PLATFORM_JWKS_URL", jwks_url)
    monkeypatch.setenv("JWT_SECRET", SECRET)  # present but must be ignored in RS256 mode
    monkeypatch.delenv("PLATFORM_PUBLIC_KEY", raising=False)
    zt_auth._jwks_clients.clear()
    return TestClient(fraud_app.app)


def rs(key=KEY, kid=KID, **claims):
    now = int(time.time())
    base = {"sub": "5", "iat": now, "exp": now + 600, "iss": "firststep-platform", "aud": ["firststep-app"]}
    return {"Authorization": "Bearer " + jwt.encode({**base, **claims}, key, algorithm="RS256", headers={"kid": kid})}


def hs(**claims):
    now = int(time.time())
    base = {"sub": "5", "iat": now, "exp": now + 600, "iss": "firststep-platform", "aud": ["firststep-app"]}
    return {"Authorization": "Bearer " + jwt.encode({**base, **claims}, SECRET, algorithm="HS256")}


PATH = "/odata/v1/fraud/Verdicts"


def test_platform_signed_user_token_is_accepted(c):
    assert c.get(PATH, headers=rs()).status_code == 200


def test_service_token_with_audience_and_scope_is_accepted(c):
    assert c.get("/audit", headers=rs(typ="service", aud=["fraud"], scope="fraud.read")).status_code == 200


@pytest.mark.parametrize("headers,why", [
    (hs(), "HS256 signed with the shared secret: a component could have minted it"),
    (rs(key=OTHER), "signed with a key the platform does not publish"),
    (rs(kid="unknown-kid"), "kid not in the JWKS"),
    (rs(aud=["audit"]), "user token not addressed to the app"),
    (rs(aud=None), "user token with no audience"),
    (rs(exp=int(time.time()) - 5), "expired"),
])
def test_everything_else_is_refused(c, headers, why):
    assert c.get(PATH, headers=headers).status_code in (401, 403), why


def test_roles_reach_the_principal(c, monkeypatch):
    seen = {}

    @fraud_app.app.get("/__probe_roles")
    def probe(http: fraud_app.Request):  # pragma: no cover - test-only route
        seen["roles"] = sorted(http.state.principal.roles)
        return {}

    try:
        assert c.get("/__probe_roles", headers=rs(roles=["auditor"])).status_code == 200
        assert seen["roles"] == ["auditor"]
    finally:
        fraud_app.app.router.routes[:] = [r for r in fraud_app.app.router.routes if getattr(r, "path", "") != "/__probe_roles"]
