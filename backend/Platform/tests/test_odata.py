"""OData surface: isolation first. A $filter or $expand must never widen access."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_portfolios import _create

R = "/odata/v1/platform"


def test_requires_authentication(client: TestClient) -> None:
    assert client.get(f"{R}/Portfolios").status_code == 401
    assert client.get(f"{R}/$metadata").status_code == 401


def test_cross_user_filter_and_expand_return_nothing(client: TestClient, registered) -> None:
    alice, _ = registered("alice@example.com")
    bob, _ = registered("bob@example.com")
    pid = _create(client, alice, "Alice").json()["id"]

    assert client.get(f"{R}/Portfolios", headers=bob).json()["value"] == []
    assert client.get(f"{R}/Portfolios", headers=bob, params={"$filter": f"Id eq {pid}"}).json()["value"] == []
    assert client.get(f"{R}/Holdings", headers=bob, params={"$expand": "x"}).status_code == 400
    assert client.get(f"{R}/Holdings", headers=bob).json()["value"] == []
    assert client.get(f"{R}/Portfolios({pid})", headers=bob).status_code == 404
    assert len(client.get(f"{R}/Users", headers=bob).json()["value"]) == 1


def test_owner_expand_select_count(client: TestClient, registered) -> None:
    alice, _ = registered("alice@example.com")
    _create(client, alice, "Alice")
    r = client.get(f"{R}/Portfolios", headers=alice, params={"$expand": "Holdings", "$count": "true"}).json()
    assert r["@odata.count"] == 1 and len(r["value"][0]["Holdings"]) == 2
    assert not any(k.startswith("_") for k in r["value"][0])
    h = client.get(f"{R}/Holdings", headers=alice,
                   params={"$filter": "Quantity gt 1000", "$select": "Symbol"}).json()["value"]
    assert h == [{"Symbol": "THIN"}]


def test_etag_and_if_match_concurrency(client: TestClient, registered) -> None:
    alice, _ = registered("alice@example.com")
    bob, _ = registered("bob@example.com")
    pid = _create(client, alice, "Alice").json()["id"]
    read = client.get(f"{R}/Portfolios({pid})", headers=alice)
    etag = read.headers["ETag"]

    assert client.patch(f"{R}/Portfolios({pid})", headers=alice, json={"Name": "X"}).status_code == 428
    assert client.patch(f"{R}/Portfolios({pid})", headers={**alice, "If-Match": 'W/"stale"'},
                        json={"Name": "X"}).status_code == 412
    assert client.patch(f"{R}/Portfolios({pid})", headers={**bob, "If-Match": etag}, json={"Name": "X"}).status_code == 404
    ok = client.patch(f"{R}/Portfolios({pid})", headers={**alice, "If-Match": etag}, json={"Name": "Renamed"})
    assert ok.status_code == 200 and ok.json()["Name"] == "Renamed" and ok.headers["ETag"] != etag
    # the old ETag is now stale
    assert client.patch(f"{R}/Portfolios({pid})", headers={**alice, "If-Match": etag}, json={"Name": "Y"}).status_code == 412
