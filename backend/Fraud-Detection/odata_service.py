"""OData v4 surface for the fraud component: /odata/v1/fraud/ (README 12.3)."""

from __future__ import annotations

import sys
from pathlib import Path

# Shared library: repo checkout path, or the compose bind-mount.
for _p in (Path(__file__).resolve().parents[2] / "shared" / "odata", Path("/app/shared_odata"),
           Path(__file__).resolve().parents[2] / "shared" / "auth", Path("/app/shared_auth")):
    if _p.is_dir():
        sys.path.insert(0, str(_p))

from odata import EntitySet, ODataError, make_router  # noqa: E402
from shield.radar import campaigns  # noqa: E402
from zt_auth import auth_required  # noqa: E402

from shield.service import VERDICTS  # noqa: E402

ROOT = "/odata/v1/fraud"


def _campaigns(request):
    # Institution role only: a service token carrying campaigns.read. End users never see them.
    if auth_required():
        p = getattr(request.state, "principal", None)
        if p is None or p.kind != "service" or "campaigns.read" not in p.scopes:
            raise ODataError("Campaigns require the institution role.", 403, "Forbidden")
    return campaigns(list(VERDICTS))


def build_router(audit):
    def decisions(_request):
        return [
            {"Id": e["transaction_id"], "UserId": e["user_id"], "Action": e["decision"],
             "RiskScore": e["risk_score"], "BehaviouralScore": e["behavioral_score"],
             "RelationalScore": e["graph_score"], "Reason": e["reason"],
             "AttackType": e["attack_type"], "CreatedAt": e["timestamp"]}
            for e in audit.recent(10_000)
        ]

    sets = [
        EntitySet("Verdicts", "Id", {
            "Id": "Edm.String", "Level": "Edm.String", "Verified": "Edm.Boolean",
            "ReasonCodes": "Edm.String", "PolicyVersion": "Edm.String",
            "FlagSource": "Edm.String", "CreatedAt": "Edm.DateTimeOffset"},
            lambda _r: list(reversed(VERDICTS))),
        EntitySet("TransactionDecisions", "Id", {
            "Id": "Edm.String", "UserId": "Edm.String", "Action": "Edm.String",
            "RiskScore": "Edm.Double", "BehaviouralScore": "Edm.Double",
            "RelationalScore": "Edm.Double", "Reason": "Edm.String",
            "AttackType": "Edm.String", "CreatedAt": "Edm.DateTimeOffset"}, decisions),
        EntitySet("Campaigns", "Id", {
            "Id": "Edm.String", "Size": "Edm.Int32", "HighRiskCount": "Edm.Int32",
            "ReasonCodes": "Edm.String", "FirstSeen": "Edm.DateTimeOffset",
            "LastSeen": "Edm.DateTimeOffset"}, _campaigns),
    ]
    from odata import edm_params
    from schemas import AttackRequest, ScoreRequest

    ops = [{"name": "CheckMessage", "kind": "Action", "params": {"text": "Edm.String"}},
           {"name": "ScoreTransaction", "kind": "Action", "params": edm_params(ScoreRequest)},
           {"name": "SimulateAttack", "kind": "Action", "params": edm_params(AttackRequest)}]
    return make_router(ROOT, "FirstStep.Fraud", sets, operations=ops)  # gated by the app-level dependency
