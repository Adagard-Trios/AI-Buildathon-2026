"""Zero-trust request verification shared by the Python services (README 13).

* Tokens are issued by the platform (users: /auth/login; machines: /auth/token, client
  credentials) and verified here with the shared JWT_SECRET. One algorithm is pinned.
* A SERVICE token (typ=service) must name this service in `aud`; a token minted for another
  service is rejected. User tokens carry a user id and are accepted everywhere.
* Every denial is reported (fire-and-forget) to Component 3, which anchors it on the
  tamper-evident log. Reporting failure never changes the decision.
* Enforcement follows AUTH_REQUIRED (default off, like Component 1) so existing tests and
  local demos keep working; compose and production turn it on.
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


@dataclass(frozen=True)
class Principal:
    subject: str
    kind: str  # "user" | "service"
    scopes: frozenset = field(default_factory=frozenset)
    email: Optional[str] = None


def auth_required() -> bool:
    return os.getenv("AUTH_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}


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
        secret = os.getenv("JWT_SECRET", "").strip()
        if not secret:
            log.error("AUTH_REQUIRED is on but JWT_SECRET is unset; refusing all requests")
            raise HTTPException(status_code=500, detail="Server auth is misconfigured")
        try:
            claims = jwt.decode(credentials.credentials, secret, algorithms=[ALGORITHM], issuer=ISSUER,
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
        return Principal(claims["sub"], "user", email=claims.get("email"))

    return dep
