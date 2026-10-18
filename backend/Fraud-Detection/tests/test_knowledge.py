"""The OKF scam-pattern bundle: it parses, it maps to SHIELD-P001, and verdicts cite it."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shield import knowledge  # noqa: E402
from shield.service import check_message  # noqa: E402


def test_every_concept_parses_and_patterns_map_to_real_rules():
    concepts = knowledge.concepts()
    assert {c["id"] for c in concepts} >= {"guaranteed-returns", "personal-account-payment", "policy-shield-p001"}
    known_rules = {f"S{i}" for i in range(1, 8)}
    for c in concepts:
        assert c["title"] and c["description"]
        assert set(c["rules"]) <= known_rules, c["id"]


def test_trust_tiers_follow_okf():
    assert knowledge.trust_tier(None) == "unverified"
    assert knowledge.trust_tier({"by": "process:nightly", "at": "2026-10-18T00:00:00Z"}) == "machine-confirmed"
    assert knowledge.trust_tier([{"by": "process:x"}, {"by": "human:niva"}]) == "human-reviewed"


def test_verdict_cites_the_patterns_it_rests_on():
    v = check_message("Guaranteed 30% monthly returns. Deposit to my personal account today, only 5 slots left.")
    ids = {p["id"] for p in v["patterns"]}
    assert "guaranteed-returns" in ids and "personal-account-payment" in ids
    assert all(p["trust"] in {"unverified", "machine-confirmed", "human-reviewed"} for p in v["patterns"])


def test_a_clean_message_cites_nothing():
    assert check_message("Lunch at 1pm tomorrow?")["patterns"] == []
