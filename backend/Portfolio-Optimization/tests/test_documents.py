import pytest

from fundamentals.ask import ask_report, top_pages, valid_citations
from importer.statement import import_statement, validate_rows


def test_validate_rows_normalises_and_rejects():
    r = validate_rows({"holdings": [
        {"symbol": " jkh .n0000", "quantity": "100", "avg_cost": "180.5", "currency": "lkr"},
        {"symbol": "JKH.N0000", "quantity": 5},
        {"symbol": "X", "quantity": 0},
        {"quantity": 1},
    ]})
    d = r["draft_holdings"]
    assert len(d) == 1 and d[0]["symbol"] == "JKH.N0000" and d[0]["currency"] == "LKR"
    assert d[0]["needs_confirmation"] is True and len(r["rejected"]) == 3


def test_validate_rows_garbage():
    assert validate_rows("nonsense") == {"draft_holdings": [], "rejected": []}


def test_import_rejects_bad_input():
    with pytest.raises(ValueError):
        import_statement(b"x", "text/html")
    with pytest.raises(ValueError):
        import_statement(b"", "image/png")


PAGES = {1: "Chairman message about the year", 2: "Net interest income rose strongly", 3: "Risk management and capital"}


def test_retrieval_and_citation_filter():
    assert top_pages(PAGES, "what happened to net interest income") == [2]
    assert valid_citations([2, "3", 99, "x"], {2, 3}) == [2, 3]


def test_without_key_returns_pages_unverified(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = ask_report(PAGES, "net interest income")
    assert r["answer"] is None and r["verified"] is False and r["citations"] == [2]


def test_uncited_answer_discarded(monkeypatch):
    monkeypatch.setattr("fundamentals.ask.generate_json", lambda parts: {"answer": "It rose 5%", "pages": [99]})
    r = ask_report(PAGES, "net interest income")
    assert r["answer"] is None and r["verified"] is False


def test_cited_answer_kept(monkeypatch):
    monkeypatch.setattr("fundamentals.ask.generate_json", lambda parts: {"answer": "It rose.", "pages": [2]})
    assert ask_report(PAGES, "net interest income")["citations"] == [2]
