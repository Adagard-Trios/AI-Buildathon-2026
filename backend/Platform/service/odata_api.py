"""OData v4 surface for the platform: /odata/v1/platform/ (README 12.3).

Rows are scoped to the authenticated user BEFORE the OData layer sees them, so no $filter or
$expand can return another user's data.
"""

from __future__ import annotations

import sys
from pathlib import Path

for _p in (Path(__file__).resolve().parents[3] / "shared" / "odata", Path("/app/shared_odata")):
    if _p.is_dir():
        sys.path.insert(0, str(_p))

from fastapi import Depends, Request  # noqa: E402
from odata import EntitySet, ODataError, check_if_match, etag_for, make_router  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from auth.deps import get_current_user  # noqa: E402
from store.database import get_session  # noqa: E402
from store.models import Portfolio, User  # noqa: E402


def _scope(request: Request, user: User = Depends(get_current_user),
           session: Session = Depends(get_session)) -> None:
    portfolios = session.scalars(select(Portfolio).where(Portfolio.user_id == user.id)).all()
    holdings = [
        {"Id": h.id, "PortfolioId": p.id, "Symbol": h.symbol, "Quantity": h.quantity,
         "CurrentPrice": h.current_price, "AvgDailyVolume": h.avg_daily_volume,
         "CostBasis": h.cost_basis}
        for p in portfolios for h in p.holdings
    ]
    request.state.odata = {
        "Users": [{"Id": user.id, "Email": user.email, "DisplayName": user.display_name,
                   "CreatedAt": user.created_at.isoformat()}],
        "Holdings": holdings,
        "Portfolios": [
            {"Id": p.id, "Name": p.name, "BaseCurrency": p.base_currency, "TotalValue": p.total_value,
             "CreatedAt": p.created_at.isoformat(), "UpdatedAt": p.updated_at.isoformat(),
             "_Holdings": [h for h in holdings if h["PortfolioId"] == p.id]}
            for p in portfolios
        ],
    }


def _rows(name: str):
    return lambda request: request.state.odata[name]


class PortfolioPatch(BaseModel):
    Name: str | None = Field(default=None, min_length=1, max_length=120)
    BaseCurrency: str | None = Field(default=None, min_length=3, max_length=3)


def _portfolio_row(p: Portfolio) -> dict:
    return {"Id": p.id, "Name": p.name, "BaseCurrency": p.base_currency, "TotalValue": p.total_value,
            "CreatedAt": p.created_at.isoformat(), "UpdatedAt": p.updated_at.isoformat()}


def build_router():
    sets = [
        EntitySet("Users", "Id", {"Id": "Edm.Int32", "Email": "Edm.String", "DisplayName": "Edm.String",
                                  "CreatedAt": "Edm.DateTimeOffset"}, _rows("Users")),
        EntitySet("Portfolios", "Id", {"Id": "Edm.Int32", "Name": "Edm.String", "BaseCurrency": "Edm.String",
                                       "TotalValue": "Edm.Double", "CreatedAt": "Edm.DateTimeOffset",
                                       "UpdatedAt": "Edm.DateTimeOffset"}, _rows("Portfolios"),
                  expand={"Holdings": lambda r: r["_Holdings"]}),
        EntitySet("Holdings", "Id", {"Id": "Edm.Int32", "PortfolioId": "Edm.Int32", "Symbol": "Edm.String",
                                     "Quantity": "Edm.Double", "CurrentPrice": "Edm.Double",
                                     "AvgDailyVolume": "Edm.Double", "CostBasis": "Edm.Double"},
                  _rows("Holdings")),
    ]
    router = make_router("/odata/v1/platform", "FirstStep.Platform", sets, dependencies=[Depends(_scope)],
                         operations=[])

    @router.patch("/Portfolios({portfolio_id})")
    def patch_portfolio(portfolio_id: int, body: PortfolioPatch, request: Request,
                        user: User = Depends(get_current_user), session: Session = Depends(get_session)):
        """Update with optimistic concurrency: send the ETag from the last read as If-Match."""
        from fastapi.responses import JSONResponse

        p = session.scalar(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
        if p is None:
            raise ODataError("Entity not found.", 404, "NotFound")
        check_if_match(request.headers.get("if-match"), _portfolio_row(p))
        if body.Name is not None:
            p.name = body.Name.strip()
        if body.BaseCurrency is not None:
            p.base_currency = body.BaseCurrency.upper()
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            raise ODataError("That name is already used by another of your portfolios.", 409, "Conflict") from None
        session.refresh(p)
        row = _portfolio_row(p)
        return JSONResponse(row, headers={"ETag": etag_for(row)})

    return router
