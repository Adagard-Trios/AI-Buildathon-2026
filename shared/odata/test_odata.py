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


# --------------------------------------------------------------------------- protocol conformance
def _app():
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    from odata import install_error_handler, make_router

    class Body(BaseModel):
        n: int

    app = FastAPI()
    install_error_handler(app)
    ops = [{"name": "Act", "kind": "Action", "params": {"n": "Edm.Int64"}},
           {"name": "Latest", "kind": "Function", "returns": "Edm.String"}]
    app.include_router(make_router("/odata/v1/fraud", "FirstStep.Fraud", [ES], operations=ops))

    @app.post("/odata/v1/fraud/Act")
    def act(body: Body):
        if body.n < 0:
            raise HTTPException(status_code=409, detail="negative")
        return {"n": body.n}

    @app.get("/plain")
    def plain():
        raise HTTPException(status_code=404, detail="nope")

    return app


def test_odata_headers_and_error_shapes():
    from fastapi.testclient import TestClient

    c = TestClient(_app())
    r = c.get("/odata/v1/fraud/Verdicts")
    assert r.headers["OData-Version"] == "4.0"
    assert r.headers["content-type"].startswith("application/json;odata.metadata=minimal")
    # validation and HTTP errors on OData routes use the OData error body
    v = c.post("/odata/v1/fraud/Act", json={"n": "x"})
    assert v.status_code == 400 and v.json()["error"]["code"] == "BadRequest" and v.json()["error"]["details"]
    h = c.post("/odata/v1/fraud/Act", json={"n": -1})
    assert h.status_code == 409 and h.json() == {"error": {"code": "Conflict", "message": "negative"}}
    # non-OData routes are untouched
    p = c.get("/plain")
    assert p.json() == {"detail": "nope"} and "OData-Version" not in p.headers


def test_count_segment_and_unsupported_options():
    from fastapi.testclient import TestClient

    c = TestClient(_app())
    r = c.get("/odata/v1/fraud/Verdicts/$count", params={"$filter": "Level eq 'HIGH_RISK'"})
    assert r.status_code == 200 and r.text == "2" and r.headers["content-type"].startswith("text/plain")
    assert c.get("/odata/v1/fraud/Verdicts", params={"$search": "x"}).status_code == 501
    assert c.get("/odata/v1/fraud/Verdicts", params={"$bogus": "x"}).status_code == 400
    assert c.get("/odata/v1/fraud/Verdicts", params={"$format": "xml"}).status_code == 406
    assert c.get("/odata/v1/fraud/Verdicts", params={"$format": "json", "custom": "1"}).status_code == 200


def test_next_link_is_url_encoded_and_followable():
    from urllib.parse import urlsplit

    from fastapi.testclient import TestClient

    c = TestClient(_app())
    first = c.get("/odata/v1/fraud/Verdicts", params={"$filter": "Level eq 'HIGH_RISK'", "$top": "1", "$orderby": "Id"})
    # $top=1 is satisfied, so no next link; use server paging instead
    assert "@odata.nextLink" not in first.json()
    import odata
    body = odata.apply_query(ES, ROWS, {"$filter": "Level eq 'HIGH_RISK'"}, B, max_page=1)
    link = body["@odata.nextLink"]
    assert " " not in link
    nxt = c.get(urlsplit(link).path + "?" + urlsplit(link).query)
    assert nxt.status_code == 200 and [r["Id"] for r in nxt.json()["value"]] == ["c"]


def test_metadata_declares_operation_parameters_and_return_types():
    import xml.etree.ElementTree as ET

    xml = metadata_xml("FirstStep.Fraud", [ES], [{"name": "Act", "kind": "Action", "params": {"n": "Edm.Int64"}},
                                                  {"name": "Latest", "kind": "Function", "returns": "Edm.String"}])
    ns = {"e": "http://docs.oasis-open.org/odata/ns/edm"}
    root = ET.fromstring(xml)
    act = root.find(".//e:Action[@Name='Act']", ns)
    assert act.find("e:Parameter", ns).attrib == {"Name": "n", "Type": "Edm.Int64"}
    assert act.find("e:ReturnType", ns).attrib["Type"] == "FirstStep.Fraud.ActResult"
    assert root.find(".//e:ComplexType[@Name='ActResult']", ns).attrib["OpenType"] == "true"
    assert root.find(".//e:Function[@Name='Latest']/e:ReturnType", ns).attrib["Type"] == "Edm.String"
    assert root.find(".//e:FunctionImport[@Name='Latest']", ns).attrib["IncludeInServiceDocument"] == "true"


def test_edm_params_from_pydantic():
    from typing import Optional

    from pydantic import BaseModel, Field

    from odata import edm_params

    class M(BaseModel):
        text: str
        amount: float
        days: int = 3
        tags: list[str] = []
        note: Optional[str] = None
        nested: dict = Field(default_factory=dict)

    assert edm_params(M) == {"text": "Edm.String", "amount": "Edm.Double", "days": "Edm.Int64",
                             "tags": "Collection(Edm.String)", "note": "Edm.String", "nested": "Edm.String"}
