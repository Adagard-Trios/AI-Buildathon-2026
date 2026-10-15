from grounding import check_grounding
from guardian import build_alert

T = ["Transaction Amount: LKR 250,000\nFraud Score: 0.87"]


def test_matching_numbers_pass():
    assert check_grounding("It was LKR 250,000 with score 0.87.", T)["grounded"]


def test_invented_number_fails():
    r = check_grounding("You lost LKR 300,000.", T)
    assert not r["grounded"] and r["ungrounded_numbers"] == [300000.0]


def test_no_numbers_passes():
    assert check_grounding("It was blocked for device change.", [])["grounded"]


def test_guardian_only_high_risk_and_no_content():
    v = {"level": "HIGH_RISK", "reasons": ["Unlicensed."]}
    a = build_alert(v, "+94770000000")
    assert a and a["includes_message_content"] is False and a["status"] == "pending_confirmation"
    assert build_alert({"level": "CAUTION", "reasons": []}, "x") is None
    assert build_alert(v, None) is None
