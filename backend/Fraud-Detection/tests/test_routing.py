import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shield import routing  # noqa: E402

ALL_OFF = {"guaranteed_return": False, "personal_account_payment": False,
           "impersonates_authority": False, "urgency": False}


def test_language_detection():
    assert routing.detect_language("hello") == "en"
    assert routing.detect_language("මෙය වංචාවකි") == "si"
    assert routing.detect_language("இது மோசடி") == "ta"


def test_unvalidated_language_never_uses_laya(monkeypatch):
    monkeypatch.setenv("LAYA_LANGS_VALIDATED", "en")
    monkeypatch.setattr(routing, "laya_flags", lambda t: (_ for _ in ()).throw(AssertionError("laya used")))
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert routing.extract("මෙය වංචාවකි")[1] == "rules"


def test_validated_language_uses_laya(monkeypatch):
    monkeypatch.setenv("LAYA_LANGS_VALIDATED", "en")
    monkeypatch.setenv("SHADOW_RATE", "0")
    monkeypatch.setattr(routing, "laya_flags", lambda t: dict(ALL_OFF))
    assert routing.extract("lunch?") == (ALL_OFF, "laya")


def test_long_text_and_caution_escalate_to_gemini(monkeypatch):
    monkeypatch.setenv("LAYA_LANGS_VALIDATED", "en")
    g = dict(ALL_OFF, guaranteed_return=True)
    monkeypatch.setattr(routing.fl, "gemini_flags", lambda t: g)
    monkeypatch.setattr(routing, "laya_flags", lambda t: dict(ALL_OFF, urgency=True, personal_account_payment=True))
    assert routing.extract("x")[1] == "gemini(escalated)"
    assert routing.extract("x" * 2000)[1] == "gemini"


def test_shadow_logs_disagreement_without_text(monkeypatch, tmp_path):
    log = tmp_path / "s.jsonl"
    monkeypatch.setattr(routing, "SHADOW_LOG", log)
    monkeypatch.setattr(routing.fl, "gemini_flags", lambda t: dict(ALL_OFF, urgency=True))
    routing._shadow("secret text", dict(ALL_OFF), "en")
    line = json.loads(log.read_text())
    assert "secret" not in log.read_text() and line["gemini"]["urgency"] is True


def test_link_checks_feed_policy(monkeypatch):
    from shield import evidence as ev
    from shield.service import check_message

    monkeypatch.setattr(ev, "domain_age_days", lambda host: 5)
    assert "S4" in check_message("see https://example.org/offer")["fired_rules"]
    monkeypatch.setattr(ev, "domain_age_days", lambda host: 900)
    monkeypatch.setattr(ev, "web_risk_hit", lambda url: True)
    r = check_message("see https://example.org/offer")
    assert r["level"] == "HIGH_RISK" and "S6" in r["fired_rules"]


def test_link_checks_default_to_unknown(monkeypatch):
    from shield import evidence as ev

    monkeypatch.delenv("RDAP_ENABLED", raising=False)
    monkeypatch.delenv("WEBRISK_API_KEY", raising=False)
    assert ev.domain_age_days("example.org") is None and ev.web_risk_hit("https://example.org") is False
