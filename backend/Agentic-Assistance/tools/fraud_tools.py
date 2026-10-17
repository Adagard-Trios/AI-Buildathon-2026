import urllib.parse

from langchain_core.tools import tool

from .services import SAMPLE_NOTICE, ServiceError, base_url, get_json, load_sample, odata_key


@tool
def get_fraud_analysis(transaction_id: str = "") -> str:
    """
    Retrieve the fraud gateway's decision for one of the user's transfers.

    IMPORTANT:
    If the user asks why a transaction was blocked, needed an extra check,
    looked suspicious, or was flagged as fraudulent, ALWAYS call this tool.

    If the user does not give a transaction ID, call it with an empty
    transaction_id: the tool returns the user's most recent transfer.

    Do not simply tell the user that the tool exists.
    Actually call the tool and use its returned information.
    """
    root = base_url("FRAUD_URL")
    if root is None:
        return _sample(transaction_id or "TX1001")

    base = f"{root}/odata/v1/fraud/TransactionDecisions"
    try:
        if transaction_id:
            row = get_json(f"{base}({odata_key(transaction_id)})")
        else:
            q = urllib.parse.urlencode({"$orderby": "CreatedAt desc", "$top": "1"}, quote_via=urllib.parse.quote)
            rows = (get_json(f"{base}?{q}") or {}).get("value") or []
            row = rows[0] if rows else None
    except ServiceError as exc:
        return f"The fraud service is unavailable ({exc}). Do not state a decision or a score."

    # Component 2 only returns the caller's own transfers, so "not found" also covers
    # "belongs to someone else": the answer must not distinguish the two.
    if not row:
        return f"No transfer was found for {transaction_id or 'this user'}."

    return f"""
FRAUD GATEWAY DECISION

Transaction ID:
{row["Id"]}

Decision:
{row["Action"]}

Fused Risk Score (0 to 1):
{row["RiskScore"]}

Behavioural Score (0 to 1):
{row["BehaviouralScore"]}

Relational Score (0 to 1):
{row["RelationalScore"]}

Reason:
{row["Reason"]}

Decided At:
{row["CreatedAt"]}

The decision was made by deterministic gateway rules over these scores,
not by a model on its own.
"""


def _sample(transaction_id: str) -> str:
    transaction = load_sample()["transactions"].get(transaction_id)
    if transaction is None:
        return f"{SAMPLE_NOTICE}\nNo sample transaction exists for ID {transaction_id}."
    reasons = "\n".join(f"- {reason}" for reason in transaction["reasons"])
    return f"""
{SAMPLE_NOTICE}

FRAUD ANALYSIS (SAMPLE)

Transaction ID:
{transaction_id}

Transaction Amount:
LKR {transaction["amount_lkr"]:,}

Fraud Score:
{transaction["fraud_score"]}

Risk Level:
{transaction["risk_level"]}

Status:
{transaction["status"]}

CONTRIBUTING FACTORS:

{reasons}
"""
