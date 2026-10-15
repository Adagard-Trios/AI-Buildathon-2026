import pytest
from odata import EntitySet, ODataError, apply_query, metadata_xml, parse_filter

ROWS = [
    {"Id": "a", "Level": "HIGH_RISK", "Score": 0.9, "At": "2026-10-02T00:00:00Z", "Note": "Quick Invest"},
    {"Id": "b", "Level": "CAUTION", "Score": 0.5, "At": "2026-09-01T00:00:00Z", "Note": None},
    {"Id": "c", "Level": "HIGH_RISK", "Score": 0.75, "At": "2026-10-05T00:00:00Z", "Note": "bank"},
]
ES = EntitySet("Verdicts", "Id", {"Id": "Edm.String", "Level": "Edm.String", "Score": "Edm.Double",
                                  "At": "Edm.DateTimeOffset", "Note": "Edm.String"},
               lambda r: ROWS, {"Items": lambda r: [r["Id"]]})
B = "http://x/odata/v1/fraud"


def q(**p):
    return apply_query(ES, ROWS, {("$" + k): str(v) for k, v in p.items()}, B)


def ids(res):
    return [r["Id"] for r in res["value"]]


def test_filter_readme_example():
    f = "Level eq 'HIGH_RISK' and At ge 2026-10-01T00:00:00Z"
    assert ids(q(filter=f)) == ["a", "c"]


def test_filter_or_not_paren_and_functions():
    assert ids(q(filter="not (Level eq 'HIGH_RISK')")) == ["b"]
    assert ids(q(filter="Score gt 0.8 or contains(Note,'bank')")) == ["a", "c"]
    assert ids(q(filter="startswith(Note,'quick')")) == ["a"]
    assert ids(q(filter="Note eq null")) == ["b"]


def test_orderby_select_count():
    r = q(orderby="Score desc", select="Id,Score", count="true")
    assert ids(r) == ["a", "c", "b"] and r["value"][0] == {"Id": "a", "Score": 0.9}
    assert r["@odata.count"] == 3


def test_paging_next_link():
    r = q(top=2, orderby="Score desc")
    assert ids(r) == ["a", "c"] and "@odata.nextLink" not in r  # $top satisfied
    r = apply_query(ES, ROWS, {}, B, max_page=2)
    assert len(r["value"]) == 2 and "$skip=2" in r["@odata.nextLink"]
    r2 = apply_query(ES, ROWS, {"$skip": "2"}, B, max_page=2)
    assert ids(r2) == ["c"] and "@odata.nextLink" not in r2


def test_expand():
    assert q(expand="Items")["value"][0]["Items"] == ["a"]


@pytest.mark.parametrize("p", [{"$filter": "Nope eq 1"}, {"$filter": "Level eq"},
                               {"$select": "Nope"}, {"$orderby": "Nope"}, {"$top": "-1"},
                               {"$expand": "Nope"}, {"$filter": "tolower(Id) eq 'a'"}])
def test_bad_queries_raise(p):
    with pytest.raises(ODataError):
        apply_query(ES, ROWS, p, B)


def test_parse_filter_quote_escape():
    assert parse_filter("Note eq 'it''s'")({"Note": "it's"})


def test_metadata_has_sets():
    x = metadata_xml("FirstStep.Fraud", [ES], [{"name": "CheckMessage", "kind": "Action"}])
    assert 'EntitySet Name="Verdicts"' in x and 'Action Name="CheckMessage"' in x


def test_unknown_property_rejected_even_with_no_rows():
    with pytest.raises(ODataError):
        apply_query(ES, [], {"$filter": "Nope eq 1"}, B)
