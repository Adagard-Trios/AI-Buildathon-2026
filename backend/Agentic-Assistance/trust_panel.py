"""Trust Panel + C4 OData surface (README 10.3, 12.3).

Anything that saves data, moves money or contacts someone is queued here as a pending action
and happens only after the user confirms it. State is per-process memory (ponytail: Firestore
when deployed); every row is scoped to its owner BEFORE the OData layer sees it.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Inside a container the file sits at /app/..., with no repo checkout 2 levels up.
_up = Path(__file__).resolve().parents
_repo_root = _up[2] if len(_up) > 2 else Path("/nonexistent")
for _p in (_repo_root / "shared" / "odata", Path("/app/shared_odata"),
           _repo_root / "shared" / "auth", Path("/app/shared_auth")):
    if _p.is_dir():
        sys.path.insert(0, str(_p))

from fastapi import APIRouter, Depends, HTTPException, Request  # noqa: E402
from odata import EntitySet, make_router  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from zt_auth import require  # noqa: E402

ROOT = "/odata/v1/assistant"
_lock = threading.Lock()
PENDING: Dict[str, dict] = {}
CONVERSATIONS: List[dict] = []
GUARDIANS: Dict[str, dict] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def owner_of(principal: Any) -> str:
    return principal.subject if principal else "anonymous"


def add_pending(owner: str, action: dict, *, kind: str = "guardian_alert", reversible: bool = False) -> dict:
    row = {"Id": str(uuid.uuid4()), "Owner": owner, "Kind": kind, "Status": "pending",
           "Reversible": reversible, "Summary": action.get("text", ""), "To": action.get("to"),
           "CreatedAt": _now(), "UpdatedAt": _now()}
    with _lock:
        PENDING[row["Id"]] = row
    return row


def record_conversation(owner: str, tools: List[str], grounded: bool) -> None:
    # No message text is kept: only what ran, and whether the answer passed grounding.
    with _lock:
        CONVERSATIONS.append({"Id": str(uuid.uuid4()), "Owner": owner, "ToolsUsed": ",".join(tools),
                              "Grounded": grounded, "CreatedAt": _now()})
        del CONVERSATIONS[:-500]


def guardian_for(owner: str) -> Optional[str]:
    with _lock:
        g = next((g for g in GUARDIANS.values() if g["Owner"] == owner), None)
    return g["Contact"] if g else None


def _deliver(row: dict) -> str:
    """Webhook delivery if GUARDIAN_WEBHOOK is set; otherwise queued (SMS/push is out of scope)."""
    url = os.getenv("GUARDIAN_WEBHOOK")
    if not url:
        return "queued"
    try:
        urllib.request.urlopen(urllib.request.Request(
            url, json.dumps({"to": row["To"], "text": row["Summary"]}).encode(),
            {"Content-Type": "application/json"}), timeout=5).read()
        return "delivered"
    except Exception:  # noqa: BLE001
        return "failed"


class ActionRef(BaseModel):
    id: str


class GuardianIn(BaseModel):
    contact: str = Field(min_length=3, max_length=120)
    name: str = Field(default="", max_length=120)


_auth = require("assistant")


def _principal(request: Request, p=Depends(_auth)):
    request.state.owner = owner_of(p)
    return p


def _mine(table):
    def rows(request: Request):
        with _lock:
            return [dict(r) for r in table() if r["Owner"] == request.state.owner]
    return rows


def build_routers():
    sets = [
        EntitySet("Conversations", "Id", {"Id": "Edm.String", "ToolsUsed": "Edm.String",
                                          "Grounded": "Edm.Boolean", "CreatedAt": "Edm.DateTimeOffset"},
                  _mine(lambda: CONVERSATIONS)),
        EntitySet("PendingActions", "Id", {"Id": "Edm.String", "Kind": "Edm.String", "Status": "Edm.String",
                                           "Reversible": "Edm.Boolean", "Summary": "Edm.String", "To": "Edm.String",
                                           "CreatedAt": "Edm.DateTimeOffset", "UpdatedAt": "Edm.DateTimeOffset"},
                  _mine(lambda: PENDING.values())),
        EntitySet("Guardians", "Id", {"Id": "Edm.String", "Name": "Edm.String", "Contact": "Edm.String",
                                      "CreatedAt": "Edm.DateTimeOffset"}, _mine(lambda: GUARDIANS.values())),
    ]
    ops = [{"name": "Chat", "kind": "Action",
            "params": {"message": "Edm.String", "guardian_contact": "Edm.String"}},
           {"name": "Confirm", "kind": "Action", "params": {"id": "Edm.String"}},
           {"name": "Rollback", "kind": "Action", "params": {"id": "Edm.String"}}]
    odata = make_router(ROOT, "FirstStep.Assistant", sets, dependencies=[Depends(_principal)], operations=ops)

    act = APIRouter(prefix=ROOT, dependencies=[Depends(_principal)])

    def _own(request: Request, action_id: str) -> dict:
        with _lock:
            row = PENDING.get(action_id)
        if row is None or row["Owner"] != request.state.owner:
            raise HTTPException(status_code=404, detail="Pending action not found")  # 404, not 403
        return row

    @act.post("/Confirm")
    def confirm(ref: ActionRef, request: Request):
        row = _own(request, ref.id)
        if row["Status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Action is already {row['Status']}")
        with _lock:
            row["Status"], row["UpdatedAt"] = "confirmed", _now()
        row["Delivery"] = _deliver(row) if row["Kind"] == "guardian_alert" else None
        return row

    @act.post("/Rollback")
    def rollback(ref: ActionRef, request: Request):
        row = _own(request, ref.id)
        if row["Status"] == "pending":
            with _lock:
                row["Status"], row["UpdatedAt"] = "cancelled", _now()
            return row
        if row["Status"] != "confirmed" or not row["Reversible"]:
            raise HTTPException(status_code=409, detail="This action cannot be rolled back (e.g. an alert already sent)")
        with _lock:
            row["Status"], row["UpdatedAt"] = "rolled_back", _now()
        return row

    @act.post("/Guardians", status_code=201)
    def add_guardian(body: GuardianIn, request: Request):
        row = {"Id": str(uuid.uuid4()), "Owner": request.state.owner, "Name": body.name,
               "Contact": body.contact, "CreatedAt": _now()}
        with _lock:
            GUARDIANS[row["Id"]] = row
        return row

    return [odata, act]
