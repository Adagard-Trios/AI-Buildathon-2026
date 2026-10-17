from langchain_core.tools import tool

from .services import SAMPLE_NOTICE, ServiceError, base_url, get_json, load_sample


@tool
def get_portfolio_analysis() -> str:
    """
    Summarise the signed-in user's own portfolios: value, holdings, weights and how
    many days of normal trading each position would take to sell.

    Use this tool when the user asks about: their portfolio, holdings, value,
    concentration, diversification, allocation or liquidity.
    """
    root = base_url("PLATFORM_URL")
    if root is None:
        return _sample()

    try:
        # The platform returns only the caller's portfolios (the token decides whose).
        summaries = get_json(f"{root}/portfolios") or []
        portfolios = [get_json(f"{root}/portfolios/{p['id']}") for p in summaries]
    except ServiceError as exc:
        return f"The portfolio service is unavailable ({exc}). Do not state any portfolio figures."

    portfolios = [p for p in portfolios if p]
    if not portfolios:
        return "The user has no saved portfolios yet."

    blocks = []
    for p in portfolios:
        holdings = p.get("holdings") or []
        values = {h["symbol"]: h["quantity"] * h["current_price"] for h in holdings}
        total = sum(values.values())
        lines = []
        for h in sorted(holdings, key=lambda h: -values[h["symbol"]]):
            weight = 100 * values[h["symbol"]] / total if total else 0.0
            # avg_daily_volume is average daily traded VALUE (same unit as the position value)
            days = values[h["symbol"]] / h["avg_daily_volume"] if h.get("avg_daily_volume") else None
            liq = f"{days:.1f} days of average trading" if days is not None else "liquidity unknown"
            lines.append(f"- {h['symbol']}: {p['base_currency']} {values[h['symbol']]:,.2f} ({weight:.1f}%), {liq}")
        top = max(values.values()) / total * 100 if total else 0.0
        blocks.append(
            f"Portfolio: {p['name']}\n"
            f"Total Value: {p['base_currency']} {total:,.2f}\n"
            f"Holdings: {len(holdings)}\n"
            f"Largest Position Weight: {top:.1f}%\n"
            + "\n".join(lines)
        )

    return "PORTFOLIO SUMMARY\n\n" + "\n\n".join(blocks)


def _sample() -> str:
    portfolio = load_sample()["portfolio"]
    allocation = portfolio["allocation"]
    return f"""
{SAMPLE_NOTICE}

PORTFOLIO ANALYSIS (SAMPLE)

Total Portfolio Value:
LKR {portfolio["total_value_lkr"]:,}

Risk Level:
{portfolio["risk_level"]}

Liquidity:
{portfolio["liquidity"]}

CURRENT ALLOCATION

Technology: {allocation["Technology"]}%
Banking: {allocation["Banking"]}%
Healthcare: {allocation["Healthcare"]}%
Government Bonds: {allocation["Government Bonds"]}%
Cash: {allocation["Cash"]}%
"""
