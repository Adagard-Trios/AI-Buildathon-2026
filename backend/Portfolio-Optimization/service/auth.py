"""JWT verification for Component 1's endpoints.

Tokens are ISSUED by the platform service (backend/Platform) and only VERIFIED here.

* RS256 (PLATFORM_JWKS_URL or PLATFORM_PUBLIC_KEY set): verified against the platform's
  public key, cached from its JWKS, so this service holds nothing that could mint a token
  and does not call the platform per request. User tokens must carry aud "firststep-app".
* Legacy HS256 with the shared JWT_SECRET when neither is set (unit tests).
Exactly one algorithm is accepted in each mode.

`AUTH_REQUIRED` is ON unless explicitly false/0/no/off (fail closed). The unit suite opts
out in conftest.py; nothing in a deployment can disable it by omission.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
ISSUER = "firststep-platform"

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CallerIdentity:
    """Who the request is from, as far as the token claims."""

    user_id: int
    email: str | None = None


USER_AUDIENCE = "firststep-app"
_jwks_clients: dict = {}


def _verification_key(token: str):
    """(key, algorithms, asymmetric), or raise LookupError when nothing is configured."""
    import jwt

    pem = os.getenv("PLATFORM_PUBLIC_KEY", "").strip()
    if pem:
        return pem, ["RS256"], True
    url = os.getenv("PLATFORM_JWKS_URL", "").strip()
    if url:
        client = _jwks_clients.get(url)
        if client is None:
            client = _jwks_clients[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)
        return client.get_signing_key_from_jwt(token).key, ["RS256"], True
    secret = os.getenv("JWT_SECRET", "").strip()
    if secret:
        return secret, [ALGORITHM], False
    raise LookupError("no verification key configured")


def auth_required() -> bool:
    """Whether tokens are enforced. On unless explicitly disabled."""
    # Fail closed: only an explicit "off" disables enforcement. Unset, empty or a typo
    # ("ture") leaves it ON, so a misconfigured deployment refuses rather than accepts.
    return os.getenv("AUTH_REQUIRED", "true").strip().lower() not in {"0", "false", "no", "off"}


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CallerIdentity | None:
    """Verify the platform service's token.

    Returns None when AUTH_REQUIRED is off, so endpoints can accept the dependency
    unconditionally and simply receive nothing in unauthenticated mode.
    """
    if not auth_required():
        return None

    if credentials is None or not credentials.credentials:
        raise _unauthenticated()

    import jwt

    try:
        key, algorithms, asymmetric = _verification_key(credentials.credentials)
    except LookupError:
        # Enforcement is on but nothing to verify with. Refusing is the only safe answer;
        # 500, not 401: the fault is the deployment's, not the caller's.
        logger.error("AUTH_REQUIRED is on but no PLATFORM_JWKS_URL, PLATFORM_PUBLIC_KEY or JWT_SECRET is set")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server auth is misconfigured",
        ) from None
    except (jwt.PyJWKClientError, jwt.InvalidTokenError) as exc:
        logger.info("rejected a token before verification: %s", exc)
        raise _unauthenticated() from None

    try:
        payload = jwt.decode(
            credentials.credentials,
            key,
            # Pinned to one algorithm per mode: accepting a caller-controlled list is how the
            # "alg: none" and RS256->HS256 confusion attacks work.
            algorithms=algorithms,
            issuer=ISSUER,
            options={"require": ["exp", "iat", "sub"], "verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except jwt.InvalidTokenError as exc:
        logger.info("rejected an invalid token: %s", exc)
        raise _unauthenticated() from None

    aud = payload.get("aud")
    auds = [aud] if isinstance(aud, str) else (aud or [])
    # Only user tokens addressed to the app; a service token minted for another component
    # (or any token without the app audience in RS256 mode) is not a customer session.
    if payload.get("typ") == "service" or ((asymmetric or auds) and USER_AUDIENCE not in auds):
        logger.info("rejected a token not addressed to the app")
        raise _unauthenticated()

    try:
        return CallerIdentity(user_id=int(payload["sub"]), email=payload.get("email"))
    except (KeyError, TypeError, ValueError):
        logger.warning("token carried an unusable subject: %r", payload.get("sub"))
        raise _unauthenticated() from None
