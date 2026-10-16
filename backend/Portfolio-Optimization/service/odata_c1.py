"""OData v4 surface for Component 1: /odata/v1/portfolio/ (README 12.3).

Actions Plan / Optimize / ImportStatement / AskReport are aliases of the existing endpoints
(see api.py, documents.py). This module adds the CashPlans / PlanSteps entity sets, scoped to
the caller BEFORE the OData layer sees any row, and the Forecast function.
"""

from __future__ import annotations

import re
import sys
import threading
import uuid
from collections import deque
from pathlib import Path

for _p in (Path(__file__).resolve().parents[3] / "shared" / "odata", Path("/app/shared_odata")):
    if _p.is_dir():
        sys.path.insert(0, str(_p))

from fastapi import Depends, HTTPException, Request  # noqa: E402
from odata import EntitySet, ODataError, make_router  # noqa: E402

from service.auth import CallerIdentity, require_user  # noqa: E402

_lock = threading.Lock()
_PLANS: deque = deque(maxlen=500)   # ponytail: process memory; Firestore/BigQuery when deployed
_STEPS: deque = deque(maxlen=5000)


def record_plan(owner: int | None, request: dict, response: dict) -> str:
    plan_id = str(uuid.uuid4())
    with _lock:
        _PLANS.append({
            "Id": plan_id, "Owner": owner or 0, "TargetAmount": response["target_amount"],
            "RaisedAmount": response["raised_amount"], "Shortfall": response["shortfall"],
            "Feasible": response["feasible"], "DaysRequired": response["days_required"],
            "ExpectedRealizedLoss": response["expected_realized_loss"],
            "ExpectedSlippagePct": response["expected_slippage_pct"],
            "ModelVersion": response["model_version"], "CreatedAt": response["generated_at"],
            "_Steps": [], "_Baselines": response.get("baseline_comparison") or [],
        })
        steps = [{"Id": f"{plan_id}:{i}", "PlanId": plan_id, "Owner": owner or 0, "Symbol": s["symbol"],
                  "SellFraction": s["sell_fraction"], "Quantity": s["quantity"],
                  "ExpectedPrice": s["expected_price"], "ExpectedSlippagePct": s["expected_slippage_pct"],
                  "ExecutionDay": s["execution_day"]} for i, s in enumerate(response["assets_to_sell"])]
        _PLANS[-1]["_Steps"] = steps
        _STEPS.extend(steps)
    return plan_id


def _scope(request: Request, caller: CallerIdentity | None = Depends(require_user)) -> None:
    request.state.owner = caller.user_id if caller else 0


def _mine(table):
    def rows(request: Request):
        with _lock:
            return [r for r in table() if r["Owner"] == request.state.owner]
    return rows


PLAN_PROPS = {"Id": "Edm.String", "TargetAmount": "Edm.Double", "RaisedAmount": "Edm.Double",
              "Shortfall": "Edm.Double", "Feasible": "Edm.Boolean", "DaysRequired": "Edm.Int32",
              "ExpectedRealizedLoss": "Edm.Double", "ExpectedSlippagePct": "Edm.Double",
              "ModelVersion": "Edm.String", "CreatedAt": "Edm.DateTimeOffset"}
STEP_PROPS = {"Id": "Edm.String", "PlanId": "Edm.String", "Symbol": "Edm.String", "SellFraction": "Edm.Double",
              "Quantity": "Edm.Double", "ExpectedPrice": "Edm.Double", "ExpectedSlippagePct": "Edm.Double",
              "ExecutionDay": "Edm.Int32"}


def build_router():
    sets = [
        EntitySet("CashPlans", "Id", PLAN_PROPS, _mine(lambda: list(_PLANS)),
                  expand={"PlanSteps": lambda r: r["_Steps"], "Baselines": lambda r: r["_Baselines"]}),
        EntitySet("PlanSteps", "Id", STEP_PROPS, _mine(lambda: list(_STEPS))),
    ]
    from odata import edm_params
    from service.contracts import PortfolioRequest, WithdrawalRequest
    from service.documents import AskReportRequest, ImportStatementRequest

    # Parameters come from the request models, so $metadata cannot drift from what the
    # endpoints actually accept.
    ops = [{"name": n, "kind": "Action", "params": edm_params(m)}
           for n, m in (("ImportStatement", ImportStatementRequest), ("Plan", WithdrawalRequest),
                        ("Optimize", PortfolioRequest), ("AskReport", AskReportRequest))]
    ops.append({"name": "Forecast", "kind": "Function", "params": {"Symbol": "Edm.String", "Horizon": "Edm.Int32"}})
    router = make_router("/odata/v1/portfolio", "FirstStep.Portfolio", sets, dependencies=[Depends(_scope)],
                         operations=ops)

    # Function Forecast(Symbol='...',Horizon=21): same model and 503 behaviour as POST /forecast.
    @router.get(r"/Forecast(Symbol='{symbol}',Horizon={horizon})")
    def forecast_function(symbol: str, horizon: int, request: Request):
        from service.api import forecast
        from service.contracts import ForecastRequest

        if not re.fullmatch(r"[A-Za-z0-9._-]{1,32}", symbol) or not 1 <= horizon <= 21:
            raise ODataError("Invalid Symbol or Horizon.")
        try:
            return forecast(ForecastRequest(symbols=[symbol], horizon=horizon), None)
        except HTTPException as exc:
            raise ODataError(str(exc.detail), exc.status_code, "ServiceUnavailable" if exc.status_code == 503 else "BadRequest")

    router.routes.insert(0, router.routes.pop())   # must precede the generic /{segment} route
    return router
