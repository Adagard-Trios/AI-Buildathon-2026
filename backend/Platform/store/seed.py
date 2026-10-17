"""Starting data every account gets: a demo portfolio, and the staff accounts roles attach to."""

from __future__ import annotations

import logging
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from store.models import Holding, Portfolio, User

logger = logging.getLogger(__name__)

# The same book the web app's "Create a demo portfolio" button uses. It spans the liquidity
# spectrum (SPY ~USD 30bn a day, JKH/COMB LKR 100-200m) so the Withdraw screen has something
# to optimise; "Refresh quotes" replaces the prices with live ones.
STARTER_HOLDINGS = (
    ("JKH.N0000", 200_000, 18.4, 9.5e7, 21.0),
    ("COMB.N0000", 20_000, 150.0, 2.0e8, 120.0),
    ("AAPL", 100, 336.6, 1.5e10, 250.0),
    ("SPY", 50, 660.0, 3.0e10, 560.0),
    ("BTCUSDT", 0.1, 82_570.0, 2.3e10, 60_000.0),
)


def starter_portfolio_enabled() -> bool:
    return os.getenv("PLATFORM_STARTER_PORTFOLIO", "").strip().lower() in {"1", "true", "yes", "on"}


def add_starter_portfolio(session: Session, user: User) -> None:
    """Give a new account the demo book, so every feature has holdings to work on at once."""
    session.add(Portfolio(
        user_id=user.id, name="My portfolio", base_currency="LKR",
        holdings=[Holding(symbol=s, quantity=q, current_price=p, avg_daily_volume=v, cost_basis=c)
                  for s, q, p, v, c in STARTER_HOLDINGS],
    ))


def seed_staff_accounts(session: Session, staff: dict[str, list[str]], password: str | None) -> int:
    """Create the accounts PLATFORM_ROLES names, so nobody can register them first.

    Roles attach to an email, and registration does not verify email ownership; an account
    holding a role must therefore be provisioned by the deployment, never self-registered.
    Returns how many accounts were created. Existing accounts are left untouched.
    """
    from auth.security import hash_password

    if not staff:
        return 0
    if not password or len(password) < 12:
        logger.warning("PLATFORM_ROLES names %d staff account(s) but PLATFORM_STAFF_PASSWORD is "
                       "unset or under 12 characters; they cannot sign in", len(staff))
        return 0
    created = 0
    for email, roles in staff.items():
        if session.scalar(select(User).where(User.email == email)) is not None:
            continue
        user = User(email=email, display_name=f"{' / '.join(roles).title()} ({email.split('@')[0]})",
                    password_hash=hash_password(password))
        session.add(user)
        session.flush()
        if starter_portfolio_enabled():
            add_starter_portfolio(session, user)
        created += 1
    session.commit()
    if created:
        logger.info("provisioned %d staff account(s)", created)
    return created
