const express = require("express");
const auditService = require("../services/auditService");
const controller = require("../controllers/auditController");
const { guard } = require("../middleware/auth");

/**
 * OData v4 surface for Component 3: /odata/v1/audit/ (README 12.3). Same conventions as the
 * Python services: $filter $select $orderby $top $skip $count, server paging (max 200),
 * OData JSON errors. There are no navigation properties, so $expand is rejected;
 * $search and $apply are unsupported.
 */
const MAX_PAGE = 200;
const PROPS = {
  Id: "Edm.String", Decision: "Edm.String", AiDecision: "Edm.String", RiskScore: "Edm.Double",
  Confidence: "Edm.Double", Amount: "Edm.Double", ModelVersion: "Edm.String", PolicyVersion: "Edm.String",
  Hash: "Edm.String", AnchorStatus: "Edm.String", BlockchainTxId: "Edm.String",
  Kind: "Edm.String", CreatedAt: "Edm.DateTimeOffset"
};

class ODataError extends Error {
  constructor(message, status = 400, code = "BadRequest") { super(message); this.status = status; this.code = code; }
}

const toRow = r => ({
  Id: r.transactionId, Decision: r.finalDecision, AiDecision: r.aiDecision ?? null,
  RiskScore: r.riskScore ?? null, Confidence: r.confidence ?? null, Amount: r.amount ?? null,
  ModelVersion: r.modelVersion, PolicyVersion: r.policyVersion, Hash: r.hash,
  AnchorStatus: r.verificationStatus, BlockchainTxId: r.blockchainTransactionId,
  Kind: r.kind === "event" ? "event" : "decision", CreatedAt: r.timestamp
});

// --- $filter: tokenizer + recursive descent -> predicate -----------------------------------
const TOKEN = /\s*(?:('(?:[^']|'')*')|(-?\d+(?:\.\d+)?(?![\w:-]))|(\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?)|([A-Za-z_][\w/]*)|([(),]))/y;
function tokenize(s) {
  const out = []; TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const start = TOKEN.lastIndex, m = TOKEN.exec(s);
    if (!m || TOKEN.lastIndex === start) throw new ODataError(`Invalid $filter near '${s.slice(start, start + 12)}'`);
    out.push(m[1] !== undefined ? ["lit", m[1].slice(1, -1).replace(/''/g, "'")]
      : m[2] !== undefined ? ["lit", Number(m[2])] : m[3] !== undefined ? ["lit", m[3]]
      : m[4] !== undefined ? ["id", m[4]] : ["op", m[5]]);
  }
  return out;
}
function parseFilter(expr) {
  const t = tokenize(expr); let i = 0;
  const peek = () => t[i] || [], take = () => t[i++] || [];
  const isWord = w => peek()[0] === "id" && peek()[1] === w;
  const atom = () => {
    const [k, v] = take();
    if (k === "lit") return () => v;
    if (k === "op" && v === "(") { const n = or(); if (take()[1] !== ")") throw new ODataError("Invalid $filter: expected ')'"); return n; }
    if (k === "id") {
      if (v === "true" || v === "false") return () => v === "true";
      if (v === "null") return () => null;
      if (peek()[1] === "(") {
        take(); const args = [or()];
        while (peek()[1] === ",") { take(); args.push(or()); }
        if (take()[1] !== ")") throw new ODataError("Invalid $filter: expected ')'");
        if (!["contains", "startswith", "endswith"].includes(v) || args.length !== 2) throw new ODataError(`Unsupported function '${v}' in $filter`);
        return row => { const a = String(args[0](row) ?? "").toLowerCase(), b = String(args[1](row) ?? "").toLowerCase();
          return v === "contains" ? a.includes(b) : v === "startswith" ? a.startsWith(b) : a.endsWith(b); };
      }
      if (!(v in PROPS)) throw new ODataError(`Property '${v}' does not exist.`);
      return row => row[v];
    }
    throw new ODataError("Invalid $filter expression");
  };
  const cmp = () => {
    const l = atom();
    if (peek()[0] === "id" && ["eq", "ne", "gt", "ge", "lt", "le"].includes(peek()[1])) {
      const op = take()[1], r = atom();
      return row => { const a = l(row), b = r(row);
        if (op === "eq") return a === b;
        if (op === "ne") return a !== b;
        if (a == null || b == null) return false;
        return { gt: a > b, ge: a >= b, lt: a < b, le: a <= b }[op]; };
    }
    return l;
  };
  const not = () => { if (isWord("not")) { take(); const n = not(); return row => !n(row); } return cmp(); };
  const and = () => { let l = not(); while (isWord("and")) { take(); const a = l, r = not(); l = row => a(row) && r(row); } return l; };
  const or = () => { let l = and(); while (isWord("or")) { take(); const a = l, r = and(); l = row => a(row) || r(row); } return l; };
  const pred = or();
  if (i !== t.length) throw new ODataError("Invalid $filter: unexpected trailing tokens");
  return pred;
}

function intOpt(q, name) {
  if (q[name] === undefined) return undefined;
  if (!/^\d+$/.test(q[name])) throw new ODataError(`${name} must be a non-negative integer.`);
  return Number(q[name]);
}

function applyQuery(rows, q, base) {
  if (q.$filter) { const p = parseFilter(q.$filter); rows = rows.filter(r => p(r)); }
  if (q.$orderby) {
    for (const part of q.$orderby.split(",").map(s => s.trim()).filter(Boolean).reverse()) {
      const [f, dir] = part.split(/\s+/);
      if (!(f in PROPS) || (dir && !["asc", "desc"].includes(dir))) throw new ODataError(`Invalid $orderby '${part}'.`);
      const sign = dir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => ((a[f] == null) - (b[f] == null)) || (a[f] < b[f] ? -sign : a[f] > b[f] ? sign : 0));
    }
  }
  const total = rows.length, skip = intOpt(q, "$skip") ?? 0, top = intOpt(q, "$top");
  const page = top !== undefined ? Math.min(MAX_PAGE, top) : MAX_PAGE;
  const win = rows.slice(skip, skip + page);
  let select = null;
  if (q.$select) {
    select = q.$select.split(",").map(s => s.trim()).filter(Boolean);
    const bad = select.find(s => !(s in PROPS));
    if (bad) throw new ODataError(`Property '${bad}' does not exist.`);
  }
  if (q.$expand) throw new ODataError(`Navigation property '${q.$expand}' does not exist.`);
  const body = { "@odata.context": `${base}/$metadata#AuditRecords`,
    value: win.map(r => select ? Object.fromEntries(select.map(k => [k, r[k]])) : r) };
  if (String(q.$count).toLowerCase() === "true") body["@odata.count"] = total;
  const consumed = skip + win.length, wanted = top !== undefined ? top - win.length : undefined;
  if (consumed < total && (wanted === undefined || wanted > 0)) {
    const params = { ...q }; delete params.$skip; delete params.$top; params.$skip = consumed;
    if (wanted !== undefined) params.$top = wanted;
    body["@odata.nextLink"] = `${base}/AuditRecords?` + Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&");
  }
  return body;
}

const router = express.Router();
router.use(guard({ scope: "audit.read" }));
const base = req => `${req.protocol}://${req.get("host")}/odata/v1/audit`;

router.get("/", (req, res) => res.json({ "@odata.context": base(req) + "/$metadata",
  value: [{ name: "AuditRecords", kind: "EntitySet", url: "AuditRecords" }, { name: "Verify", kind: "FunctionImport", url: "Verify" }] }));

router.get("/$metadata", (req, res) => {
  const props = Object.entries(PROPS).map(([n, t]) => `<Property Name="${n}" Type="${t}"/>`).join("");
  res.type("application/xml").send('<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>'
    + '<Schema Namespace="FirstStep.Audit" xmlns="http://docs.oasis-open.org/odata/ns/edm">'
    + `<EntityType Name="AuditRecordItem"><Key><PropertyRef Name="Id"/></Key>${props}</EntityType>`
    + '<Function Name="Verify"/><Action Name="Review"/><Action Name="Tamper"/>'
    + '<EntityContainer Name="Container"><EntitySet Name="AuditRecords" EntityType="FirstStep.Audit.AuditRecordItem"/>'
    + '<FunctionImport Name="Verify" Function="FirstStep.Audit.Verify"/><ActionImport Name="Review" Action="FirstStep.Audit.Review"/>'
    + '<ActionImport Name="Tamper" Action="FirstStep.Audit.Tamper"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>');
});

const rows = () => auditService.getAllRecords().map(toRow);

router.get("/AuditRecords", (req, res) => res.json(applyQuery(rows(), req.query, base(req))));
router.get(/^\/AuditRecords\('((?:[^']|'')*)'\)$/, (req, res) => {
  const id = req.params[0].replace(/''/g, "'"), hit = rows().find(r => r.Id === id);
  if (!hit) throw new ODataError("Entity not found.", 404, "NotFound");
  res.json({ "@odata.context": `${base(req)}/$metadata#AuditRecords/$entity`, ...hit });
});
// Function: Verify(RecordId='...'). It recomputes the hash and compares with the chain.
router.get(/^\/Verify\(RecordId='((?:[^']|'')*)'\)$/, async (req, res, next) => {
  try { res.json(await auditService.verifyRecord(req.params[0].replace(/''/g, "'"))); } catch (e) { next(e); }
});
// Actions reuse the controller so policy, hashing and anchoring stay in one place.
router.post("/Review", express.json(), (req, res) => controller.submitHumanReview(
  { body: { transactionId: req.body.RecordId, reviewerDecision: req.body.Decision } }, res));
router.post("/Tamper", express.json(), (req, res) => controller.simulateTampering(
  { params: { transactionId: req.body.RecordId }, body: { field: req.body.Field, tamperedValue: req.body.Value } }, res));

router.use((req, res) => res.status(404).json({ error: { code: "NotFound", message: `Resource '${req.path}' not found.` } }));
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  res.status(err.status || 500).json({ error: { code: err.code || "InternalError", message: err.message } });
});

module.exports = router;
module.exports.applyQuery = applyQuery;
module.exports.parseFilter = parseFilter;
module.exports.ODataError = ODataError;
