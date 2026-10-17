"""Asymmetric token signing (RS256) and the public JWKS document.

Zero trust: only this service can MINT tokens. It holds the RSA private key; every other
component verifies against the public key published at /.well-known/jwks.json. A
compromised component can therefore no longer forge a token for any user or service, which
it could while every service shared one HS256 secret.

Key source, first match wins:
  PLATFORM_SIGNING_KEY        PEM text of an RSA private key (e.g. from Secret Manager)
  PLATFORM_SIGNING_KEY_FILE   path to a PEM file; created on first start when
                              PLATFORM_SIGNING_KEY_AUTOGEN=true (local compose only)
Neither set: legacy HS256 with JWT_SECRET, kept for unit tests and the old local setup.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _b64u(n: int) -> str:
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@lru_cache(maxsize=1)
def _load_private_key_cached(pem: Optional[str], path: Optional[str], autogen: bool):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    if pem:
        data = pem.encode()
    elif path:
        p = Path(path)
        if not p.exists():
            if not autogen:
                raise RuntimeError(f"PLATFORM_SIGNING_KEY_FILE {path} does not exist")
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                            serialization.NoEncryption()))
            try:
                os.chmod(p, 0o600)
            except OSError:  # Windows: best effort
                pass
            logger.warning("generated a new RS256 signing key at %s", path)
        data = p.read_bytes()
    else:
        return None
    key = serialization.load_pem_private_key(data, password=None)
    if not isinstance(key, rsa.RSAPrivateKey) or key.key_size < 2048:
        raise RuntimeError("The platform signing key must be an RSA key of at least 2048 bits")
    return key


def private_key():
    """The RSA private key, or None in legacy HS256 mode."""
    return _load_private_key_cached(
        os.getenv("PLATFORM_SIGNING_KEY", "").strip() or None,
        os.getenv("PLATFORM_SIGNING_KEY_FILE", "").strip() or None,
        os.getenv("PLATFORM_SIGNING_KEY_AUTOGEN", "false").strip().lower() in {"1", "true", "yes", "on"},
    )


def reset_cache() -> None:
    _load_private_key_cached.cache_clear()


def asymmetric() -> bool:
    return private_key() is not None


def key_id() -> str:
    """Stable kid: a thumbprint of the public key, so rotation changes it automatically."""
    nums = private_key().public_key().public_numbers()
    return hashlib.sha256(f"{nums.n}:{nums.e}".encode()).hexdigest()[:16]


def jwks() -> dict[str, Any]:
    if not asymmetric():
        return {"keys": []}
    nums = private_key().public_key().public_numbers()
    return {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": key_id(),
                      "n": _b64u(nums.n), "e": _b64u(nums.e)}]}


def public_key():
    return private_key().public_key()
