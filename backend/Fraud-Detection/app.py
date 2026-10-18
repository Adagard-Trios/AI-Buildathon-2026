"""
app.py
======
FastAPI service for the Real-Time Fraud & Behavioral Anomaly Engine with
Deterministic Enforcement.

This file is deliberately thin. It only does HTTP: validation is in
schemas.py, detection is in fraud_model.py, enforcement is in gateway.py,
orchestration is in pipeline.py and logging is in audit_log.py.

Run it with:      uvicorn app:app --reload
Then open:        http://127.0.0.1:8000
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import adversarial_test
from audit_log import AuditLog
from config import SETTINGS
from fraud_model import MODEL_MODE
from pipeline import FraudPipeline
from pydantic import BaseModel, Field
from shield import check_message
import stepup
from schemas import (
    AttackRequest,
    AttackResponse,
    HealthResponse,
    ScoreRequest,
    ScoreResponse,
    Transaction,
)

BASE_DIR = Path(__file__).resolve().parent
SERVICE_NAME = "fraud-detection-gateway"
VERSION = "1.0.0-prototype"

DISCLAIMER = (
    "PROTOTYPE: risk scores are produced by deterministic simulations of an "
    "LSTM autoencoder and a GNN. No neural network is trained or executed."
)

# --- shared application state ----------------------------------------------
AUDIT = AuditLog()
PIPELINE = FraudPipeline(audit=AUDIT)
STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Announce the prototype status once, at start-up."""
    print(f"[{SERVICE_NAME}] {DISCLAIMER}", flush=True)
    print(f"[{SERVICE_NAME}] Demo UI : http://127.0.0.1:8000", flush=True)
    print(f"[{SERVICE_NAME}] API docs: http://127.0.0.1:8000/docs", flush=True)
    yield


import odata_service  # noqa: E402,F401  (puts shared/odata and shared/auth on sys.path)
from fastapi import Depends  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials  # noqa: E402
from zt_auth import bearer, require  # noqa: E402

_verify = require("fraud")
_PUBLIC = {"/", "/health", "/docs", "/openapi.json", "/redoc"}


def gate(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Zero trust: every route except health/docs verifies a token when AUTH_REQUIRED is on."""
    if request.url.path in _PUBLIC:
        return None
    request.state.principal = _verify(request, credentials)
    return request.state.principal


app = FastAPI(
    dependencies=[Depends(gate)],
    title="Real-Time Fraud & Behavioral Anomaly Engine with Deterministic Enforcement",
    description=(
        "Dual-stream anomaly detection (simulated LSTM autoencoder + simulated GNN) "
        "feeding a deterministic security gateway that enforces ALLOW / STEP-UP / BLOCK.\n\n"
        f"**{DISCLAIMER}**"
    ),
    version=VERSION,
    lifespan=lifespan,
)

# Browser origins from ALLOWED_ORIGINS, like every other component. The bundled demo.html is
# served by this app itself (same origin), so it needs no CORS entry; "*" is only used when
# the variable is explicitly set to it for local experiments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


import odata_service  # noqa: E402  (also puts the shared odata library on sys.path)
from odata import install_error_handler  # noqa: E402

install_error_handler(app)
app.include_router(odata_service.build_router(AUDIT))

# ---------------------------------------------------------------------------
# Error handling - the demo must never show a raw stack trace
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    problems = [
        f"{'.'.join(str(p) for p in err.get('loc', [])[1:])}: {err.get('msg')}"
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"error": "Invalid transaction input", "detail": "; ".join(problems)},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal error in the fraud engine", "detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def demo_page():
    """Serve the presentation UI."""
    page = BASE_DIR / "demo.html"
    if not page.exists():
        raise HTTPException(status_code=404, detail="demo.html not found")
    return FileResponse(page)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Liveness plus the currently enforced policy - useful on stage."""
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=VERSION,
        model_mode=MODEL_MODE,
        uptime_seconds=round(time.time() - STARTED_AT, 2),
        transactions_scored=PIPELINE.transactions_scored,
        policy_version=SETTINGS.gateway.policy_version,
        thresholds={
            "allow_below": SETTINGS.gateway.allow_max,
            "block_at_or_above": SETTINGS.gateway.block_min,
        },
    )


@app.post("/odata/v1/fraud/ScoreTransaction", response_model=ScoreResponse, tags=["odata"])
@app.post("/score", response_model=ScoreResponse, tags=["detection"])
async def score(request: ScoreRequest, http: Request) -> ScoreResponse:
    """
    Score one transaction and enforce a decision.

    Pipeline: behavioural analysis -> relational analysis -> fusion ->
    deterministic gateway -> audit log.
    """
    transaction = Transaction(**request.model_dump(exclude={"persist_state", "attack_type"}))
    return PIPELINE.evaluate(
        transaction,
        persist_state=request.persist_state,
        attack_type=request.attack_type,
        owner=_caller_subject(http),
    )


class ChallengeRequest(BaseModel):
    transaction_id: str
    user_id: str


class VerifyRequest(BaseModel):
    challenge_id: str
    code: str = Field(min_length=6, max_length=6)


def _caller_subject(http: Request) -> str | None:
    principal = getattr(http.state, "principal", None)
    return principal.subject if principal is not None and principal.kind == "user" else None


@app.post("/step-up/challenge", tags=["zero-trust"])
async def step_up_challenge(request: ChallengeRequest, http: Request) -> Dict[str, Any]:
    """Issue a one-time code for a STEP-UP transaction.

    With auth on, the challenge is owned by the signed-in caller and only they can answer it.
    user_id stays the transaction's customer (the simulated bank account on the fraud screen).
    """
    return stepup.create_challenge(request.transaction_id, request.user_id, owner=_caller_subject(http))


@app.post("/step-up/verify", tags=["zero-trust"])
async def step_up_verify(request: VerifyRequest, http: Request) -> Dict[str, Any]:
    return stepup.verify_challenge(request.challenge_id, request.code, caller=_caller_subject(http))


class ShieldRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


@app.post("/odata/v1/fraud/CheckMessage", tags=["odata"])
@app.post("/shield/check", tags=["detection"])
async def shield_check(request: ShieldRequest, http: Request) -> Dict[str, Any]:
    """Scam Shield: SHIELD-P001 verdict for a message. The text is not stored."""
    return check_message(request.text, owner=_caller_subject(http))


@app.get("/shield/knowledge", tags=["governance"])
async def shield_knowledge() -> Dict[str, Any]:
    """The OKF scam-pattern bundle Scam Shield cites, with each concept's trust tier."""
    from shield import knowledge

    return {"format": "OKF v0.2", "concepts": list(knowledge.concepts())}


@app.post("/odata/v1/fraud/SimulateAttack", response_model=AttackResponse, tags=["odata"])
@app.post("/simulate-attack", response_model=AttackResponse, tags=["research"])
async def simulate_attack(request: AttackRequest) -> AttackResponse:
    """
    Run one of the three SAFE, SIMULATED evasion scenarios from the research:
    camouflage, slow drift, or structuring.

    Each scenario runs in its own isolated engine instance, so it cannot
    pollute the state of the live demo, and returns the before/after scores
    and gateway decisions for every stage.
    """
    try:
        result = adversarial_test.run_attack(request.attack_type, steps=request.steps)
    except KeyError as exc:  # unknown attack type
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Mirror the simulation into the shared audit trail so the log on the demo
    # page shows the attack alongside the ordinary transactions.
    for step in result["steps"]:
        AUDIT.record(
            transaction_id=f"{request.attack_type}_step_{step['step']}",
            user_id=result["user_id"],
            behavioral_score=step["behavioral_score"],
            graph_score=step["graph_score"],
            risk_score=step["risk_score"],
            decision=step["decision"],
            reason=step["reason"],
            attack_type=request.attack_type,
        )

    return AttackResponse(**{k: v for k, v in result.items() if k != "user_id"})


@app.get("/audit", tags=["governance"])
async def audit(http: Request, limit: int = Query(default=25, ge=1, le=200)) -> Dict[str, Any]:
    """Most recent gateway decisions, newest first: the caller's own, unless a service
    identity holds fraud.read (see odata_service.visible_decisions)."""
    entries = odata_service.visible_decisions(http, AUDIT.recent(10_000))[:limit]
    return {"count": len(entries), "entries": entries}


@app.get("/config", tags=["governance"])
async def config() -> Dict[str, Any]:
    """
    Expose the enforced policy. Showing this on stage proves the thresholds
    are configuration, not something the model invented.
    """
    gw = SETTINGS.gateway
    return {
        "model_mode": MODEL_MODE,
        "disclaimer": DISCLAIMER,
        "policy_version": gw.policy_version,
        "bands": {
            "ALLOW": f"risk < {gw.allow_max}",
            "STEP-UP": f"{gw.allow_max} <= risk < {gw.block_min}",
            "BLOCK": f"risk >= {gw.block_min}",
        },
        "fusion": {
            "behavioral_weight": SETTINGS.fusion.behavioral_weight,
            "graph_weight": SETTINGS.fusion.graph_weight,
            "corroboration_bonus": SETTINGS.fusion.corroboration_bonus,
        },
        "navigation_patterns": list(SETTINGS.behavioral.navigation_risk.keys()),
    }


@app.post("/reset", tags=["system"])
async def reset(http: Request) -> Dict[str, str]:
    """Clear all learned user profiles and graph state, then reseed the demo graph.

    The state is shared by every user, so wiping it is an operator action: the platform's
    "admin" role, or a service holding fraud.admin. Signing in is not enough.
    """
    principal = getattr(http.state, "principal", None)
    if principal is not None:
        allowed = ("admin" in principal.roles) if principal.kind == "user" else ("fraud.admin" in principal.scopes)
        if not allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
    PIPELINE.reset()
    return {"status": "reset", "detail": "User profiles, graph memory and audit view cleared."}


@app.get("/pipeline", tags=["system"])
async def pipeline_description() -> Dict[str, List[str]]:
    """The processing chain, for the diagram on the demo page."""
    return {
        "stages": [
            "Transaction received and validated",
            "Behavioural analysis (typing, navigation, frequency, amount, device)",
            "LSTM-like sequence anomaly score  [SIMULATED]",
            "GNN-like relational risk score over the entity graph  [SIMULATED]",
            "Late fusion -> final fraud risk score",
            "Deterministic security gateway (thresholds + policy rules)",
            "ALLOW / STEP-UP / BLOCK + audit log entry",
        ]
    }
