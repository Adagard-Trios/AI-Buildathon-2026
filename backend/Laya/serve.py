"""Laya inference service (README 6.2). Run: uvicorn serve:app --port 8090

Env: LAYA_CHECKPOINT (fine-tuned directory or HF repo), LAYA_HEADS (comma list, default all).
Without laya or a checkpoint the service still starts; /classify answers 503 and callers
route to Gemini. A head is served only if it is listed in LAYA_HEADS, i.e. only after it has
been fine-tuned and validated (never zero-shot: README 6.6).
"""

from __future__ import annotations

import os
import threading
from importlib.util import find_spec

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from heads import HEADS

app = FastAPI(title="Laya inference", version="0.1.0")
_agent = None
_reason = "loading"
_lock = threading.Lock()


def _enabled() -> list[str]:
    wanted = os.environ.get("LAYA_HEADS")
    return [h for h in (wanted.split(",") if wanted else HEADS) if h in HEADS]


def _load() -> None:
    global _agent, _reason
    ckpt = os.environ.get("LAYA_CHECKPOINT")
    if find_spec("laya") is None:
        reason, agent = "laya is not installed (pip install laya)", None
    elif not ckpt:
        reason, agent = "LAYA_CHECKPOINT is not set (a fine-tuned checkpoint is required)", None
    else:
        try:
            import laya

            agent, reason = laya.load(ckpt, device=os.environ.get("LAYA_DEVICE", "cpu")), "ready"
        except Exception as exc:  # noqa: BLE001
            agent, reason = None, f"load failed: {type(exc).__name__}: {exc}"
    with _lock:
        _agent, _reason = agent, reason


threading.Thread(target=_load, daemon=True).start()


@app.get("/health")
def health():
    with _lock:
        return {"status": "ok", "ready": _agent is not None, "reason": _reason, "heads": _enabled()}


class ClassifyRequest(BaseModel):
    head: str
    texts: list[str] = Field(min_length=1, max_length=64)


@app.post("/classify")
def classify(req: ClassifyRequest):
    if req.head not in _enabled():
        raise HTTPException(status_code=404, detail=f"head '{req.head}' is not served")
    with _lock:
        agent = _agent
    if agent is None:
        raise HTTPException(status_code=503, detail=_reason)
    results = agent.predict_batch([{"text": t[:4000]} for t in req.texts], HEADS[req.head])
    return {"head": req.head, "answers": [r.get("answers", {}) for r in results]}
