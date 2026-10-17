"""RS256 mode: only the platform can mint; everyone verifies with the published public key."""

from __future__ import annotations

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from auth import signing


@pytest.fixture
def rs256(monkeypatch, tmp_path):
    monkeypatch.setenv("PLATFORM_SIGNING_KEY_FILE", str(tmp_path / "signing_key.pem"))
    monkeypatch.setenv("PLATFORM_SIGNING_KEY_AUTOGEN", "true")
    monkeypatch.delenv("PLATFORM_SIGNING_KEY", raising=False)
    signing.reset_cache()
    from service.api import app

    with TestClient(app) as c:
        yield c
    signing.reset_cache()


def _register(c):
    r = c.post("/auth/register", json={"email": "rs@example.com", "display_name": "R", "password": "a-good-long-passphrase"})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def test_tokens_are_rs256_with_a_kid_that_the_jwks_publishes(rs256):
    token = _register(rs256)
    header = jwt.get_unverified_header(token)
    assert header["alg"] == "RS256" and header["kid"]
    keys = rs256.get("/.well-known/jwks.json").json()["keys"]
    assert [k["kid"] for k in keys] == [header["kid"]]
    # A verifier with only the JWKS can check it: no shared secret involved.
    public = jwt.PyJWK(keys[0]).key
    claims = jwt.decode(token, public, algorithms=["RS256"], issuer="firststep-platform", audience="firststep-app")
    assert claims["sub"]
    assert "d" not in keys[0] and "p" not in keys[0], "private key material must never be published"
    assert rs256.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_hs256_tokens_are_rejected_even_with_the_right_secret(rs256):
    import os

    _register(rs256)
    now = int(time.time())
    forged = jwt.encode({"sub": "1", "iat": now, "exp": now + 600, "iss": "firststep-platform"},
                        os.environ["JWT_SECRET"], algorithm="HS256")
    assert rs256.get("/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_service_tokens_are_rs256_too(rs256, monkeypatch):
    monkeypatch.setenv("SERVICE_CLIENTS", "fraud:" + "s" * 40 + ":audit.write")
    r = rs256.post("/auth/token", json={"client_id": "fraud", "client_secret": "s" * 40, "audience": "audit", "scope": "audit.write"})
    assert r.status_code == 200
    assert jwt.get_unverified_header(r.json()["access_token"])["alg"] == "RS256"


def test_key_is_persisted_and_reused(monkeypatch, tmp_path):
    path = tmp_path / "k.pem"
    monkeypatch.setenv("PLATFORM_SIGNING_KEY_FILE", str(path))
    monkeypatch.setenv("PLATFORM_SIGNING_KEY_AUTOGEN", "true")
    signing.reset_cache()
    first = signing.key_id()
    signing.reset_cache()
    assert signing.key_id() == first and path.exists()
    signing.reset_cache()


def test_missing_key_file_without_autogen_refuses(monkeypatch, tmp_path):
    monkeypatch.setenv("PLATFORM_SIGNING_KEY_FILE", str(tmp_path / "absent.pem"))
    monkeypatch.setenv("PLATFORM_SIGNING_KEY_AUTOGEN", "false")
    signing.reset_cache()
    with pytest.raises(RuntimeError):
        signing.private_key()
    signing.reset_cache()


def test_legacy_mode_publishes_no_keys(client):
    assert client.get("/.well-known/jwks.json").json() == {"keys": []}


def test_a_service_token_cannot_be_replayed_against_the_platform(rs256, monkeypatch):
    monkeypatch.setenv("SERVICE_CLIENTS", "fraud:" + "s" * 40 + ":audit.write")
    tok = rs256.post("/auth/token", json={"client_id": "fraud", "client_secret": "s" * 40,
                                          "audience": "audit", "scope": "audit.write"}).json()["access_token"]
    assert rs256.get("/portfolios", headers={"Authorization": f"Bearer {tok}"}).status_code == 401
