"""SHIELD-P001: deterministic scam policy. Models supply evidence; only this decides."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

POLICY_VERSION = "SHIELD-P001 v1.0"
_ORDER = {"LOW_RISK": 0, "CAUTION": 1, "HIGH_RISK": 2}


@dataclass(frozen=True)
class Evidence:
    guaranteed_return: bool = False
    entity_licensed: Optional[bool] = None  # None = could not check
    personal_account_payment: bool = False
    script_similarity: float = 0.0
    domain_age_days: Optional[int] = None
    impersonates_authority: bool = False
    risk_score: float = 0.0


@dataclass
class Verdict:
    level: str
    fired_rules: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    policy_version: str = POLICY_VERSION
    verified: bool = True  # False when evidence was too thin to say anything


def evaluate(e: Evidence) -> Verdict:
    level, rules, reasons = "LOW_RISK", [], []

    def raise_to(new: str, rule: str, why: str) -> None:
        nonlocal level
        rules.append(rule)
        reasons.append(why)
        if _ORDER[new] > _ORDER[level]:
            level = new

    if e.guaranteed_return and e.entity_licensed is False:
        raise_to("HIGH_RISK", "S1", "Promises a guaranteed return and the entity is not licensed.")
    if e.personal_account_payment:
        raise_to("CAUTION", "S2", "Asks for payment to a personal account or crypto wallet.")
    if e.script_similarity >= 0.85:
        raise_to("HIGH_RISK", "S3", "Closely matches a known scam script.")
    if e.domain_age_days is not None and e.domain_age_days < 30:
        raise_to("CAUTION", "S4", "The linked domain was registered less than 30 days ago.")
    if e.impersonates_authority:
        raise_to("HIGH_RISK", "S5", "Pretends to be a bank or regulator.")
    if e.risk_score >= 0.70:
        raise_to("HIGH_RISK", "S6", "Combined risk score is high.")
    elif e.risk_score >= 0.35:
        raise_to("CAUTION", "S7", "Combined risk score is moderate.")

    # Honesty rule: nothing fired and nothing checkable means "unverified", never "safe".
    verified = bool(rules) or e.entity_licensed is not None
    return Verdict(level, rules, reasons, verified=verified)
