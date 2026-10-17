"""Zero-trust request verification shared by the Python services (README 13).

* Tokens are issued by the platform (users: /auth/login; machines: /auth/token, client
  credentials). With PLATFORM_JWKS_URL (or PLATFORM_PUBLIC_KEY) set they are RS256 and
  verified against the platform's PUBLIC key: this service holds nothing that can mint a
  token. Without either, legacy HS256 with the shared JWT_SECRET (unit tests). Exactly one
  algorithm is accepted in each mode, so an HS256 token is refused in RS256 mode.
* User tokens must be addressed to the first-party app (aud "firststep-app") in RS256 mode.
* A SERVICE token (typ=service) must name this service in `aud`; a token minted for another
  service is rejected. User tokens carry a user id and are accepted everywhere.
* Every denial is reported (fire-and-forget) to Component 3, which anchors it on the
  tamper-evident log. Reporting failure never changes the decision.
* Enforcement is ON unless AUTH_REQUIRED is explicitly false/0/no/off (fail closed). Test
  suites opt out in their conftest; nothing in production can by omission.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ALGORITHM = "HS256"
ISSUER = "firststep-platform"
bearer = HTTPBearer(auto_error=False)
log = logging.getLogger(__name__)


USER_AUDIENCE = "firststep-app"


@dataclass(frozen=True)
class Principal:
    subject: str
    kind: str  # "user" | "service"
    scopes: frozenset = field(default_factory=frozenset)
    email: Optional[str] = None
    roles: frozenset = field(default_factory=frozenset)


_jwks_clients: dict = {}


def _verification_key(token: str):
    """(key, algorithms, asymmetric) for this deployment, or raise LookupError if unconfigured."""
    pem = os.getenv("PLATFORM_PUBLIC_KEY", "").strip()
    if pem:
        return pem, ["RS256"], True
    url = os.getenv("PLATFORM_JWKS_URL", "").strip()
    if url:
        client = _jwks_clients.get(url)
        if client is None:
            # Caches keys and refetches on an unknown kid, so platform key rotation just works.
            client = _jwks_clients[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)
        return client.get_signing_key_from_jwt(token).key, ["RS256"], True
    secret = os.getenv("JWT_SECRET", "").strip()
    if secret:
        return secret, [ALGORITHM], False
    raise LookupError("no verification key configured")


def auth_required() -> bool:
    # Fail closed: only an explicit "off" disables enforcement. Unset, empty or a typo
    # ("ture") leaves it ON, so a misconfigured deployment refuses rather than accepts.
    return os.getenv("AUTH_REQUIRED", "true").strip().lower() not in {"0", "false", "no", "off"}


_tok: dict = {}


def service_token(audience: str = "audit", scope: str = "audit.write") -> dict:
    """Authorization header for service-to-service calls, via the platform's client-credentials
    endpoint (PLATFORM_URL + <SVC>_CLIENT_ID/SECRET). Cached until 60 s before expiry; returns
    {} when not configured (local demo with AUTH_REQUIRED off)."""
    import json as _j
    import os as _o
    import time as _t
    import urllib.request as _r

    cid, sec, plat = _o.getenv("SERVICE_CLIENT_ID"), _o.getenv("SERVICE_CLIENT_SECRET"), _o.getenv("PLATFORM_URL")
    if not (cid and sec and plat):
        return {}
    key = (audience, scope)
    if key in _tok and _tok[key][1] > _t.time() + 60:
        return {"Authorization": "Bearer " + _tok[key][0]}
    req = _r.Request(plat.rstrip("/") + "/auth/token",
                     _j.dumps({"client_id": cid, "client_secret": sec, "audience": audience, "scope": scope}).encode(),
                     {"Content-Type": "application/json"})
    try:
        body = _j.load(_r.urlopen(req, timeout=5))
    except Exception:  # noqa: BLE001
        return {}
    _tok[key] = (body["access_token"], _t.time() + body.get("expires_in", 900))
    return {"Authorization": "Bearer " + body["access_token"]}


def _report_denial(request: Request, reason: str) -> None:
    url = os.getenv("AUDIT_URL")
    if not url:
        return
    import json
    import urllib.request

    def send() -> None:
        try:
            req = urllib.request.Request(
                url.rstrip("/") + "/api/audit/security-events",
                json.dumps({"principal": request.client.host if request.client else "unknown",
                            "reason": reason, "path": request.url.path}).encode(),
                {"Content-Type": "application/json", **service_token()})
            urllib.request.urlopen(req, timeout=3).read()
        except Exception:  # noqa: BLE001 - reporting must never affect the decision
            pass

    threading.Thread(target=send, daemon=True).start()


def _deny(request: Request, reason: str, code: int = status.HTTP_401_UNAUTHORIZED) -> HTTPException:
    _report_denial(request, reason)
    # Same public message for every failure: do not tell an attacker which check failed.
    return HTTPException(status_code=code, detail="Not authenticated" if code == 401 else "Forbidden",
                         headers={"WWW-Authenticate": "Bearer"} if code == 401 else None)


def require(service: str, *scopes: str):
    """Dependency factory. `service` is this service's audience name, e.g. "fraud"."""

    def dep(request: Request,
            credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Optional[Principal]:
        if not auth_required():
            return None
        if credentials is None or not credentials.credentials:
            raise _deny(request, "missing token")
        try:
            key, algorithms, asymmetric = _verification_key(credentials.credentials)
        except LookupError:
            log.error("AUTH_REQUIRED is on but no PLATFORM_JWKS_URL, PLATFORM_PUBLIC_KEY or JWT_SECRET is set")
            raise HTTPException(status_code=500, detail="Server auth is misconfigured") from None
        except (jwt.PyJWKClientError, jwt.InvalidTokenError):
            # unknown kid, unreachable JWKS, or a token too malformed to read its header
            raise _deny(request, "invalid token") from None
        try:
            claims = jwt.decode(credentials.credentials, key, algorithms=algorithms, issuer=ISSUER,
                                options={"require": ["exp", "iat", "sub"], "verify_aud": False})
        except jwt.ExpiredSignatureError:
            raise _deny(request, "expired token") from None
        except jwt.InvalidTokenError:
            raise _deny(request, "invalid token") from None

        if claims.get("typ") == "service":
            aud = claims.get("aud") or []
            if service not in ([aud] if isinstance(aud, str) else aud):
                raise _deny(request, f"wrong audience for {service}", status.HTTP_403_FORBIDDEN)
            granted = frozenset(str(claims.get("scope", "")).split())
            if not set(scopes) <= granted:
                raise _deny(request, "insufficient scope", status.HTTP_403_FORBIDDEN)
            return Principal(claims["sub"], "service", granted)
        aud = claims.get("aud")
        auds = [aud] if isinstance(aud, str) else (aud or [])
        # A user token must be meant for the app. Legacy HS256 test tokens carry no aud.
        if (asymmetric or auds) and USER_AUDIENCE not in auds:
            raise _deny(request, "user token without the app audience", status.HTTP_403_FORBIDDEN)
        return Principal(claims["sub"], "user", email=claims.get("email"),
                         roles=frozenset(str(r) for r in (claims.get("roles") or [])))

    return dep
