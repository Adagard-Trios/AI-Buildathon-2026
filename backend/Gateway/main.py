"""API gateway (README 5): token verification and OData routing in front of the services.

/odata/v1/<service>/...  ->  that service's upstream. The caller's Authorization header is
forwarded unchanged, so every service re-verifies it (no implicit trust between hops).
Env: UPSTREAM_PLATFORM / _PORTFOLIO / _FRAUD / _AUDIT / _ASSISTANT (base URLs), JWT_SECRET,
AUTH_REQUIRED. Run: uvicorn main:app --port 8080
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Inside a container the file sits at /app/..., with no repo checkout 2 levels up.
_up = Path(__file__).resolve().parents
_repo_root = _up[2] if len(_up) > 2 else Path("/nonexistent")
for _p in (_repo_root / "shared" / "auth", Path("/app/shared_auth"),
           _repo_root / "shared" / "odata", Path("/app/shared_odata")):
    if _p.is_dir():
        sys.path.insert(0, str(_p))

import httpx  # noqa: E402
from fastapi import Depends, FastAPI, HTTPException, Request, Response  # noqa: E402
from zt_auth import require  # noqa: E402
from odata import install_error_handler  # noqa: E402

SERVICES = ("platform", "portfolio", "fraud", "audit", "assistant")
HOP_BY_HOP = {"host", "content-length", "connection", "transfer-encoding"}
app = FastAPI(title="FirstStep gateway", version="0.1.0")
# The gateway's own answers (unknown service, upstream down, auth denials) must be OData too:
# an external client cannot tell which hop produced an error, so they all share one format.
install_error_handler(app)


def upstream(service: str) -> str | None:
    return os.getenv(f"UPSTREAM_{service.upper()}")


@app.get("/health")
def health():
    return {"status": "ok", "component": "gateway"}


@app.api_route("/odata/v1/{service}/{rest:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
async def route(service: str, rest: str, request: Request, _p=Depends(require("gateway"))):
    base = upstream(service) if service in SERVICES else None
    if not base:
        raise HTTPException(status_code=404, detail="Unknown service")  # same answer for unknown and unconfigured
    url = f"{base.rstrip('/')}/odata/v1/{service}/{rest}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.request(request.method, url, params=request.query_params,
                                     content=await request.body(), headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail=f"{service} service is unavailable") from None
    return Response(r.content, r.status_code,
                    {k: v for k, v in r.headers.items() if k.lower() not in HOP_BY_HOP | {"content-encoding"}})
