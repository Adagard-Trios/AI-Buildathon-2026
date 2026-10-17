"""Platform service: identity and portfolio storage shared by all four components.

Deliberately owns nothing domain-specific. Component 1 forecasts and optimizes; Components
2-4 detect fraud, anchor audits and explain. All of them need to know who the user is and
what they hold, and none of them should have to depend on another component's service to
find out.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.deps import get_current_user
from auth.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_jwt_secret,
    hash_password,
    roles_for,
    validate_service_clients,
    verify_password,
)
from service.contracts import (
    HealthResponse,
    HoldingModel,
    LoginRequest,
    PortfolioCreate,
    PortfolioResponse,
    PortfolioSummary,
    PortfolioUpdate,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from service.cors import install_cors
from store.database import get_session, init_db
from store.models import Holding, Portfolio, User

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Validate the secret at STARTUP, not on the first login. A service that boots happily
    # and only fails when a user tries to sign in is much harder to diagnose.
    from auth import signing

    # Fail at STARTUP on a bad key or secret, not on the first login. In RS256 mode the
    # shared secret is not needed at all: no other service should hold anything that mints.
    if signing.asymmetric():
        logger.info("issuing RS256 tokens, kid=%s", signing.key_id())
    else:
        get_jwt_secret()
    validate_service_clients()
    init_db()
    logger.info("platform service ready")
    yield


app = FastAPI(
    title="FirstStep Platform Service",
    version="0.1.0",
    description="Identity and portfolio storage shared by all four platform components.",
    lifespan=lifespan,
)
install_cors(app)

from service.odata_api import build_router  # noqa: E402  (puts the shared odata library on sys.path)
from odata import install_error_handler  # noqa: E402

install_error_handler(app)
app.include_router(build_router())


# --------------------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
def health(session: Session = Depends(get_session)) -> HealthResponse:
    try:
        session.execute(select(User).limit(1))
        database_ready = True
    except Exception as exc:  # noqa: BLE001
        logger.error("database health check failed: %s", exc)
        database_ready = False

    return HealthResponse(status="ok", service="platform", database_ready=database_ready)


# --------------------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------------------

@app.get("/.well-known/jwks.json")
def jwks() -> dict:
    """Public keys for verifying platform tokens (RFC 7517). Empty in legacy HS256 mode."""
    from auth import signing

    return signing.jwks()


@app.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, session: Session = Depends(get_session)) -> TokenResponse:
    """Create an account and return a token, so the client is not forced to log in again."""
    normalised = request.email.lower().strip()

    user = User(
        email=normalised,
        display_name=request.display_name.strip(),
        password_hash=hash_password(request.password),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        # Rely on the unique constraint rather than a pre-check SELECT: the check-then-insert
        # pattern races two concurrent registrations of the same address.
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        ) from None

    session.refresh(user)
    logger.info("registered user %s", user.id)
    return _token_for(user)


@app.post("/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    """Exchange credentials for an access token."""
    user = session.scalar(select(User).where(User.email == request.email.lower().strip()))

    # Same 401 whether the address is unknown or the password is wrong. Distinguishing them
    # turns the login form into an account-enumeration oracle.
    if user is None or not verify_password(request.password, user.password_hash):
        logger.info("failed login for %s", request.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _token_for(user)


class ClientCredentials(BaseModel):
    client_id: str
    client_secret: str
    audience: str
    scope: str = ""


@app.post("/auth/token")
def client_token(req: ClientCredentials) -> dict:
    """OAuth 2.0 client credentials for external systems and services (README 13.2).

    SERVICE_CLIENTS="id:secret:scope1 scope2;id2:secret2:scope" -- each client gets only its
    configured scopes, for the one audience requested, for 15 minutes.
    """
    import hmac
    import os

    granted: set[str] | None = None
    for entry in filter(None, os.getenv("SERVICE_CLIENTS", "").split(";")):
        cid, _, rest = entry.partition(":")
        secret, _, scopes = rest.partition(":")
        # compare against every entry in constant time; no early exit on id mismatch
        ok = hmac.compare_digest(cid, req.client_id) & hmac.compare_digest(secret, req.client_secret)
        if ok:
            granted = set(scopes.split())
    asked = set(req.scope.split())
    # The app audience is reserved for user sessions: a machine identity can never obtain one.
    if granted is None or not asked <= granted or not req.audience.split() or "firststep-app" in req.audience.split():
        raise HTTPException(status_code=401, detail="invalid_client",
                            headers={"WWW-Authenticate": "Bearer"})
    return {"access_token": create_access_token(
                subject=req.client_id, expires_minutes=15,
                # Space-separated audiences: an external system calling through the OData gateway
                # asks for "gateway fraud", because each hop re-verifies that it is addressed.
                extra_claims={"typ": "service", "aud": sorted(set(req.audience.split())),
                              "scope": " ".join(sorted(asked))}),
            "token_type": "bearer", "expires_in": 900}


@app.get("/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)


def _token_for(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(
            subject=str(user.id), extra_claims={"email": user.email, "roles": roles_for(user.email)}),
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


# --------------------------------------------------------------------------------------
# Portfolios
# --------------------------------------------------------------------------------------

@app.get("/portfolios", response_model=list[PortfolioSummary])
def list_portfolios(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[PortfolioSummary]:
    portfolios = session.scalars(
        select(Portfolio).where(Portfolio.user_id == user.id).order_by(Portfolio.updated_at.desc())
    ).all()

    return [
        PortfolioSummary(
            id=p.id, name=p.name, base_currency=p.base_currency,
            holding_count=len(p.holdings), total_value=p.total_value, updated_at=p.updated_at,
        )
        for p in portfolios
    ]


@app.post("/portfolios", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    request: PortfolioCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PortfolioResponse:
    portfolio = Portfolio(
        user_id=user.id, name=request.name.strip(), base_currency=request.base_currency.upper(),
        holdings=[_to_holding(h) for h in request.holdings],
    )
    session.add(portfolio)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a portfolio named {request.name!r}",
        ) from None

    session.refresh(portfolio)
    return _to_response(portfolio)


@app.get("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(
    portfolio_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PortfolioResponse:
    return _to_response(_owned_portfolio(portfolio_id, user, session))


@app.put("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    request: PortfolioUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PortfolioResponse:
    """Partial update. `holdings=None` leaves them untouched; `holdings=[]` clears them."""
    portfolio = _owned_portfolio(portfolio_id, user, session)

    if request.name is not None:
        portfolio.name = request.name.strip()
    if request.base_currency is not None:
        portfolio.base_currency = request.base_currency.upper()
    if request.holdings is not None:
        # Replace wholesale. cascade="all, delete-orphan" removes the detached rows, so this
        # does not leak orphaned holdings the way a plain reassignment would.
        portfolio.holdings.clear()
        session.flush()
        portfolio.holdings.extend(_to_holding(h) for h in request.holdings)

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That name is already used by another of your portfolios",
        ) from None

    session.refresh(portfolio)
    return _to_response(portfolio)


@app.delete("/portfolios/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(
    portfolio_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    session.delete(_owned_portfolio(portfolio_id, user, session))
    session.commit()


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------

def _owned_portfolio(portfolio_id: int, user: User, session: Session) -> Portfolio:
    """Fetch a portfolio the caller owns.

    Returns 404 -- not 403 -- when it exists but belongs to someone else. A 403 would confirm
    the id is real, letting anyone enumerate how many portfolios the platform holds.
    """
    portfolio = session.get(Portfolio, portfolio_id)
    if portfolio is None or portfolio.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")
    return portfolio


def _to_holding(model: HoldingModel) -> Holding:
    return Holding(
        symbol=model.symbol.upper().strip(), quantity=model.quantity,
        current_price=model.current_price, avg_daily_volume=model.avg_daily_volume,
        cost_basis=model.cost_basis,
    )


def _to_response(portfolio: Portfolio) -> PortfolioResponse:
    return PortfolioResponse(
        id=portfolio.id, name=portfolio.name, base_currency=portfolio.base_currency,
        holdings=[HoldingModel.model_validate(h) for h in portfolio.holdings],
        total_value=portfolio.total_value,
        created_at=portfolio.created_at, updated_at=portfolio.updated_at,
    )
