"""Minimal OData v4.01 server helpers over in-memory rows.

Supports $filter, $select, $orderby, $top, $skip, $count, $expand (via caller callbacks),
server-driven paging, OData JSON errors and a CSDL $metadata document.
Not supported (README 12.2): $search, $apply.

Authorisation is the caller's job and happens BEFORE this module sees rows: pass only rows
the caller may see, so no $filter or $expand can widen access.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from xml.sax.saxutils import escape

MAX_PAGE_SIZE = 200

try:  # module-level so FastAPI can resolve string annotations on the route handlers
    from fastapi import Request
except ImportError:  # library usable without FastAPI
    Request = Any


class ODataError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "BadRequest"):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code

    def body(self) -> dict:
        return {"error": {"code": self.code, "message": self.message}}


# --------------------------------------------------------------------------- $filter
_TOKEN = re.compile(
    r"\s*(?:(?P<str>'(?:[^']|'')*')|(?P<num>-?\d+(?:\.\d+)?(?![\w:-]))"
    r"|(?P<dt>\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?)"
    r"|(?P<id>[A-Za-z_][\w/]*)|(?P<op>[(),]))"
)
_CMP = {"eq", "ne", "gt", "ge", "lt", "le"}


def _tokenize(s: str) -> List[tuple]:
    out, pos = [], 0
    while pos < len(s):
        m = _TOKEN.match(s, pos)
        if not m or m.end() == pos:
            raise ODataError(f"Invalid $filter near '{s[pos:pos + 12]}'")
        kind = m.lastgroup
        out.append((kind, m.group(kind)))
        pos = m.end()
    return out


class _Parser:
    def __init__(self, toks: List[tuple]):
        self.t, self.i = toks, 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def take(self):
        tok = self.peek()
        self.i += 1
        return tok

    def expect(self, val: str):
        if self.take()[1] != val:
            raise ODataError(f"Invalid $filter: expected '{val}'")

    def parse(self):
        node = self.or_()
        if self.i != len(self.t):
            raise ODataError("Invalid $filter: unexpected trailing tokens")
        return node

    def or_(self):
        left = self.and_()
        while self.peek()[1] == "or":
            self.take()
            left = ("or", left, self.and_())
        return left

    def and_(self):
        left = self.not_()
        while self.peek()[1] == "and":
            self.take()
            left = ("and", left, self.not_())
        return left

    def not_(self):
        if self.peek()[1] == "not":
            self.take()
            return ("not", self.not_())
        return self.cmp()

    def cmp(self):
        left = self.atom()
        if self.peek()[1] in _CMP:
            op = self.take()[1]
            return ("cmp", op, left, self.atom())
        return left

    def atom(self):
        kind, val = self.take()
        if kind == "str":
            return ("lit", val[1:-1].replace("''", "'"))
        if kind == "num":
            return ("lit", float(val) if "." in val else int(val))
        if kind == "dt":
            return ("lit", val)
        if kind == "op" and val == "(":
            node = self.or_()
            self.expect(")")
            return node
        if kind == "id":
            if val in ("true", "false"):
                return ("lit", val == "true")
            if val == "null":
                return ("lit", None)
            if self.peek()[1] == "(":
                self.take()
                args = [self.or_()]
                while self.peek()[1] == ",":
                    self.take()
                    args.append(self.or_())
                self.expect(")")
                if val not in ("contains", "startswith", "endswith") or len(args) != 2:
                    raise ODataError(f"Unsupported function '{val}' in $filter")
                return ("fn", val, args)
            return ("prop", val)
        raise ODataError("Invalid $filter expression")


def _eval(node, row: dict, props: Optional[set]):
    k = node[0]
    if k == "lit":
        return node[1]
    if k == "prop":
        if props is not None and node[1] not in props:
            raise ODataError(f"Property '{node[1]}' does not exist.")
        return row.get(node[1])
    if k == "and":
        return bool(_eval(node[1], row, props)) and bool(_eval(node[2], row, props))
    if k == "or":
        return bool(_eval(node[1], row, props)) or bool(_eval(node[2], row, props))
    if k == "not":
        return not _eval(node[1], row, props)
    if k == "fn":
        a, b = (str(_eval(x, row, props) or "").lower() for x in node[2])
        return {"contains": b in a, "startswith": a.startswith(b), "endswith": a.endswith(b)}[node[1]]
    op, a, b = node[1], _eval(node[2], row, props), _eval(node[3], row, props)
    if op == "eq":
        return a == b
    if op == "ne":
        return a != b
    if a is None or b is None:
        return False
    try:
        return {"gt": a > b, "ge": a >= b, "lt": a < b, "le": a <= b}[op]
    except TypeError:
        raise ODataError("Cannot compare values of different types in $filter.")


def _check_props(node, props: set) -> None:
    """Reject unknown properties at parse time, not only when a row happens to be evaluated."""
    if node[0] == "prop" and node[1] not in props:
        raise ODataError(f"Property '{node[1]}' does not exist.")
    for child in node[1:]:
        if isinstance(child, tuple):
            _check_props(child, props)
        elif isinstance(child, list):
            for c in child:
                _check_props(c, props)


def parse_filter(expr: str, props: Optional[set] = None) -> Callable[[dict], bool]:
    tree = _Parser(_tokenize(expr)).parse()
    if props is not None:
        _check_props(tree, props)
    return lambda row: bool(_eval(tree, row, props))


# --------------------------------------------------------------------------- query
def _int_opt(params: dict, name: str, default: Optional[int]) -> Optional[int]:
    if name not in params:
        return default
    try:
        v = int(params[name])
    except ValueError:
        raise ODataError(f"${name} must be a non-negative integer.")
    if v < 0:
        raise ODataError(f"${name} must be a non-negative integer.")
    return v


@dataclass
class EntitySet:
    name: str
    key: str
    props: Dict[str, str]  # property -> Edm type
    rows: Callable[[Any], List[dict]]  # request -> already-authorised rows
    expand: Dict[str, Callable[[dict], Any]] = field(default_factory=dict)


def apply_query(es: EntitySet, rows: List[dict], params: dict, base_url: str,
                max_page: int = MAX_PAGE_SIZE) -> dict:
    props = set(es.props)
    if "$filter" in params:
        pred = parse_filter(params["$filter"], props)
        rows = [r for r in rows if pred(r)]

    if "$orderby" in params:
        for part in reversed([p.strip() for p in params["$orderby"].split(",") if p.strip()]):
            bits = part.split()
            if bits[0] not in props or len(bits) > 2 or (len(bits) == 2 and bits[1] not in ("asc", "desc")):
                raise ODataError(f"Invalid $orderby '{part}'.")
            rows = sorted(rows, key=lambda r, p=bits[0]: (r.get(p) is None, r.get(p)),
                          reverse=len(bits) == 2 and bits[1] == "desc")

    total = len(rows)
    skip = _int_opt(params, "$skip", 0)
    top = _int_opt(params, "$top", None)
    page = min(max_page, top) if top is not None else max_page
    window = rows[skip:skip + page]

    select = None
    if "$select" in params:
        select = [s.strip() for s in params["$select"].split(",") if s.strip()]
        bad = [s for s in select if s not in props]
        if bad:
            raise ODataError(f"Property '{bad[0]}' does not exist.")
    expand = [e.strip() for e in params.get("$expand", "").split(",") if e.strip()]
    for e in expand:
        if e not in es.expand:
            raise ODataError(f"Navigation property '{e}' does not exist.")

    value = []
    for r in window:
        # Keys starting with '_' are private carriers for $expand callbacks and never serialised.
        out = {k: r.get(k) for k in select} if select else {k: v for k, v in r.items() if not k.startswith('_')}
        for e in expand:
            out[e] = es.expand[e](r)
        value.append(out)

    body: dict = {"@odata.context": f"{base_url}/$metadata#{es.name}", "value": value}
    if params.get("$count", "").lower() == "true":
        body["@odata.count"] = total
    # Next link only when more rows exist AND the client's $top was not already satisfied.
    consumed = skip + len(window)
    remaining_wanted = (top - len(window)) if top is not None else None
    if consumed < total and (remaining_wanted is None or remaining_wanted > 0):
        q = {k: v for k, v in params.items() if k not in ("$skip", "$top")}
        q["$skip"] = str(consumed)
        if remaining_wanted is not None:
            q["$top"] = str(remaining_wanted)
        body["@odata.nextLink"] = f"{base_url}/{es.name}?" + "&".join(f"{k}={v}" for k, v in q.items())
    return body


# --------------------------------------------------------------------------- ETags
def etag_for(row: dict) -> str:
    """Weak ETag over the public (non-underscore) fields of a row."""
    import hashlib
    import json

    body = json.dumps({k: v for k, v in row.items() if not k.startswith("_")}, sort_keys=True, default=str)
    return 'W/"' + hashlib.sha256(body.encode()).hexdigest()[:16] + '"'


def check_if_match(header: Optional[str], row: dict) -> None:
    """Optimistic concurrency for updates: If-Match is required and must equal the current ETag."""
    if not header:
        raise ODataError("If-Match header is required for updates.", 428, "PreconditionRequired")
    if header.strip() != "*" and header.strip() != etag_for(row):
        raise ODataError("The entity changed since it was read.", 412, "PreconditionFailed")


# --------------------------------------------------------------------------- $metadata
def metadata_xml(namespace: str, sets: List[EntitySet], operations: Optional[List[dict]] = None) -> str:
    """CSDL XML. operations: [{"name","kind":"Action"|"Function"}]."""
    types, container = [], []
    for s in sets:
        props = "".join(f'<Property Name="{escape(p)}" Type="{t}"/>' for p, t in s.props.items())
        types.append(f'<EntityType Name="{s.name}Item"><Key><PropertyRef Name="{s.key}"/></Key>{props}</EntityType>')
        container.append(f'<EntitySet Name="{s.name}" EntityType="{namespace}.{s.name}Item"/>')
    ops = ""
    for o in operations or []:
        tag = "Action" if o["kind"] == "Action" else "Function"
        ops += f'<{tag} Name="{o["name"]}"/>'
        container.append(f'<{tag}Import Name="{o["name"]}" {tag}="{namespace}.{o["name"]}"/>')
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">'
        '<edmx:DataServices><Schema Namespace="' + namespace + '" xmlns="http://docs.oasis-open.org/odata/ns/edm">'
        + "".join(types) + ops
        + '<EntityContainer Name="Container">' + "".join(container) + "</EntityContainer>"
        "</Schema></edmx:DataServices></edmx:Edmx>"
    )


# --------------------------------------------------------------------------- FastAPI router
def make_router(root: str, namespace: str, sets: List[EntitySet], dependencies=None,
                operations: Optional[List[dict]] = None, max_page: int = MAX_PAGE_SIZE):
    """Mount at app level: app.include_router(make_router('/odata/v1/fraud', ...))."""
    from fastapi import APIRouter
    from fastapi.responses import JSONResponse, Response

    router = APIRouter(prefix=root, dependencies=dependencies or [])
    by_name = {s.name: s for s in sets}

    def base(request: Request) -> str:
        return str(request.base_url).rstrip("/") + root

    @router.get("/")
    async def service_document(request: Request):
        return {"@odata.context": base(request) + "/$metadata",
                "value": [{"name": s.name, "kind": "EntitySet", "url": s.name} for s in sets]}

    @router.get("/$metadata")
    async def metadata():
        return Response(metadata_xml(namespace, sets, operations), media_type="application/xml")

    @router.get("/{segment}")
    async def entity_set(segment: str, request: Request):
        m = re.fullmatch(r"(\w+)\('((?:[^']|'')*)'\)|(\w+)\((\d+)\)|(\w+)", segment)
        if not m:
            raise ODataError("Malformed resource path.", 404, "NotFound")
        name = m.group(1) or m.group(3) or m.group(5)
        es = by_name.get(name)
        if es is None:
            raise ODataError(f"Resource '{name}' not found.", 404, "NotFound")
        rows = es.rows(request)  # authorised BEFORE any query option is evaluated
        params = dict(request.query_params)
        key = m.group(2) if m.group(1) else m.group(4)
        if key is not None:
            hit = next((r for r in rows if str(r.get(es.key)) == key.replace("''", "'")), None)
            if hit is None:
                raise ODataError("Entity not found.", 404, "NotFound")
            res = apply_query(es, [hit], params, base(request), max_page)
            return JSONResponse({"@odata.context": res["@odata.context"], **res["value"][0]},
                                headers={"ETag": etag_for(hit)})
        return apply_query(es, rows, params, base(request), max_page)

    return router


def install_error_handler(app) -> None:
    """OData JSON error format for ODataError on OData routes."""
    from fastapi.responses import JSONResponse

    @app.exception_handler(ODataError)
    async def _handler(_request, exc: ODataError):
        return JSONResponse(status_code=exc.status, content=exc.body())
