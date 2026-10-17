from langchain_core.tools import tool

from .services import SAMPLE_NOTICE, ServiceError, base_url, get_json, load_sample, odata_key


@tool
def get_blockchain_audit(transaction_id: str) -> str:
    """
    Retrieve and VERIFY the tamper-evident audit record of a decision.

    Use this tool when the user asks about: blockchain records, audit history,
    whether a decision was changed, verification, or recorded financial decisions.
    The transaction_id can be a transfer id or a scam-check verdict id.
    """
    root = base_url("AUDIT_URL")
    if root is None:
        return _sample(transaction_id)

    try:
        record = get_json(f"{root}/odata/v1/audit/AuditRecords({odata_key(transaction_id)})")
        if not record:
            return f"No audit record was found for {transaction_id}."
        # Component 3 recomputes the hash now and compares it with the anchored one.
        check = get_json(f"{root}/odata/v1/audit/Verify(RecordId={odata_key(transaction_id)})") or {}
    except ServiceError as exc:
        return f"The audit service is unavailable ({exc}). Do not claim the record is verified."

    return f"""
TAMPER-EVIDENT AUDIT RECORD

Record ID:
{record.get("Id")}

Decision:
{record.get("Decision")}

Model Version:
{record.get("ModelVersion")}

Policy Version:
{record.get("PolicyVersion")}

Recorded At:
{record.get("CreatedAt")}

Anchor Status:
{record.get("AnchorStatus")}

Verification Now:
{check.get("status", "UNKNOWN")} (verified: {check.get("verified", False)})

{check.get("message", "")}
"""


def _sample(transaction_id: str) -> str:
    audit = load_sample()["audit"].get(transaction_id)
    if audit is None:
        return f"{SAMPLE_NOTICE}\nNo sample audit record exists for {transaction_id}."
    return f"""
{SAMPLE_NOTICE}

AUDIT RECORD (SAMPLE)

Transaction ID:
{transaction_id}

Audit ID:
{audit["audit_id"]}

Decision:
{audit["decision"]}

Recorded At:
{audit["timestamp"]}

Block Number:
{audit["block_number"]}

Record Status:
{audit["status"]}
"""
