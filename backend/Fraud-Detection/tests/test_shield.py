import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.pop("GEMINI_API_KEY", None)  # tests use the offline rule path

from shield import Evidence, check_message, evaluate  # noqa: E402

KAMALA = ("Guaranteed 30% monthly returns. Only 10 slots left. Your friend Nalini already joined. "
          "Send payment to this personal account. Quick Invest Capital")


def test_s1_guaranteed_unlicensed_is_high():
    v = evaluate(Evidence(guaranteed_return=True, entity_licensed=False))
    assert v.level == "HIGH_RISK" and "S1" in v.fired_rules


def test_s1_needs_both_conditions():
    assert "S1" not in evaluate(Evidence(guaranteed_return=True, entity_licensed=True)).fired_rules


def test_s2_personal_account_is_at_least_caution():
    assert evaluate(Evidence(personal_account_payment=True)).level == "CAUTION"


def test_s3_s5_s6_high():
    assert evaluate(Evidence(script_similarity=0.85)).level == "HIGH_RISK"
    assert evaluate(Evidence(impersonates_authority=True)).level == "HIGH_RISK"
    assert evaluate(Evidence(risk_score=0.70)).level == "HIGH_RISK"


def test_s4_young_domain_caution_and_s7_band():
    assert evaluate(Evidence(domain_age_days=5)).level == "CAUTION"
    assert evaluate(Evidence(risk_score=0.35)).fired_rules == ["S7"]
    assert evaluate(Evidence(risk_score=0.34)).fired_rules == []


def test_escalation_only():
    v = evaluate(Evidence(personal_account_payment=True, impersonates_authority=True))
    assert v.level == "HIGH_RISK"


def test_no_signal_is_unverified_not_safe():
    v = evaluate(Evidence())
    assert v.level == "LOW_RISK" and v.verified is False


def test_kamala_message_is_high_risk():
    r = check_message(KAMALA)
    assert r["level"] == "HIGH_RISK" and "S1" in r["fired_rules"]


def test_benign_message_not_flagged():
    r = check_message("Lunch at 1pm tomorrow?")
    assert r["level"] == "LOW_RISK" and r["verified"] is False


def test_lookalike_link_is_high_risk():
    r = check_message("Click https://combank-secure-login.xyz to continue")
    assert r["level"] == "HIGH_RISK"


def test_verdict_is_anchored_under_its_own_id(monkeypatch):
    """The customer holds the verdict id, so Component 3 must anchor it under that id."""
    import events
    from shield.service import check_message

    sent = []
    monkeypatch.setattr(events, "publish", sent.append)
    v = check_message("Guaranteed 30% monthly returns! Only 10 slots left, pay now.")
    assert sent and sent[-1]["event_id"] == v["id"] and sent[-1]["event_type"] == "scam.verdict"
