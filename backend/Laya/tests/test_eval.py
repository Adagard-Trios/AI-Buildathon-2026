import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval import ece, evaluate, validated_languages  # noqa: E402


def rows(lang, n, correct, conf=0.95):
    return [{"lang": lang, "gold": True, "gemini": True, "pred": i < correct, "conf": conf} for i in range(n)]


def test_validation_requires_enough_rows_and_accuracy():
    rep = evaluate(rows("en", 100, 96) + rows("si", 20, 20) + rows("ta", 100, 70))
    assert rep["en"]["validated"] is True
    assert rep["si"]["validated"] is False  # too few rows: unmeasured, not validated
    assert rep["ta"]["validated"] is False
    assert validated_languages(rep) == "en"


def test_overconfidence_fails_ece():
    r = rows("en", 100, 80, conf=0.99)
    assert ece(r) > 0.10 and evaluate(r)["en"]["validated"] is False


def test_heads_and_serve_import():
    from heads import HEADS
    assert {"scam_flags", "intent", "safety"} <= set(HEADS)
