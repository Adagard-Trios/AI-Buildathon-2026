const assert = require("assert");
const crypto = require("crypto");
const http = require("http");
process.env.DEMO_MODE = "true";
process.env.JWT_SECRET = "unit-test-secret-long-enough-0123456789abcdef";

const app = require("./src/index");
const audit = require("./src/services/auditService");
const controller = require("./src/controllers/auditController");
const applyQueryForTest = (rows, q) => require("./src/routes/odata").applyQuery(rows, q, "http://x/odata/v1/audit");

const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function token(claims = {}, secret = process.env.JWT_SECRET, alg = "HS256") {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg, typ: "JWT" }), body = b64({ sub: "1", iat: now, exp: now + 600, iss: "firststep-platform", ...claims });
  return `${head}.${body}.${crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}
const call = (port, method, path, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const r = http.request({ port, method, path, headers: { "content-type": "application/json", ...headers } }, res => {
    let d = ""; res.on("data", c => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
  });
  r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
});
const auth = (claims, secret) => ({ authorization: `Bearer ${token(claims, secret)}` });

(async () => {
  const server = app.listen(0); const port = server.address().port;
  process.env.AUTH_REQUIRED = "false";
  audit.clearAllRecords();
  for (const [id, risk] of [["a", 90], ["b", 20], ["c", 95]]) {
    await controller.evaluateDecision({ body: { transactionId: id, riskScore: risk, confidence: 90, amount: 1000, transactionType: "T", modelVersion: "m1" } },
      { status() { return this; }, json() { return this; } });
  }

  // OData behaviour
  let r = await call(port, "GET", "/odata/v1/audit/AuditRecords?$filter=Decision eq 'REJECT' and RiskScore ge 90&$select=Id&$orderby=Id desc&$count=true".replace(/ /g, "%20"));
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.value, [{ Id: "c" }, { Id: "a" }]); assert.strictEqual(r.body["@odata.count"], 2);
  r = await call(port, "GET", "/odata/v1/audit/AuditRecords?$top=1&$orderby=Id");
  assert.strictEqual(r.body.value.length, 1); assert.strictEqual(r.body["@odata.nextLink"], undefined); // $top satisfied
  for (const q of ["$filter=Nope%20eq%201", "$select=Nope", "$top=-1", "$expand=x", "$filter=tolower(Id)%20eq%20'a'"]) {
    r = await call(port, "GET", `/odata/v1/audit/AuditRecords?${q}`); assert.strictEqual(r.status, 400, q); assert.ok(r.body.error.code);
  }
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/AuditRecords('a')")).body.Id, "a");
  // Protocol conformance for generic clients (Power Query, SAP, a bank's integration layer)
  const raw = (path) => new Promise((resolve, reject) => http.get({ port, path }, res => {
    let d = ""; res.on("data", c => (d += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: d }));
  }).on("error", reject));
  let h = await raw("/odata/v1/audit/AuditRecords");
  assert.strictEqual(h.headers["odata-version"], "4.0"); assert.ok(/^application\/json;.*odata\.metadata=minimal/.test(h.headers["content-type"]));
  assert.strictEqual((await raw("/odata/v1/audit/Nope")).headers["odata-version"], "4.0", "errors carry the header too");
  h = await raw("/odata/v1/audit/AuditRecords/$count?$filter=Decision%20eq%20'REJECT'");
  assert.strictEqual(h.status, 200); assert.strictEqual(h.text, "2");
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/AuditRecords?$search=x")).status, 501);
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/AuditRecords?$bogus=x")).status, 400);
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/AuditRecords?$format=xml")).status, 406);
  const paged = applyQueryForTest(Array.from({ length: 205 }, (_, i) => ({ Id: `r${i}`, Decision: "REJECT" })), { $filter: "Decision eq 'REJECT'" });
  assert.ok(paged["@odata.nextLink"] && !paged["@odata.nextLink"].includes(" "), "nextLink is URL-encoded");
  const mdRes = await raw("/odata/v1/audit/$metadata");
  assert.strictEqual(mdRes.status, 200, "$metadata is reachable"); assert.ok(mdRes.headers["content-type"].startsWith("application/xml"));
  const md = mdRes.text;
  assert.ok(/<Action Name="Review"><Parameter Name="RecordId"[^>]*\/><Parameter Name="Decision"[^>]*\/><ReturnType/.test(md), "Review declares params and return type");
  assert.ok(/<Function Name="Verify"><Parameter Name="RecordId"[^>]*\/><ReturnType/.test(md), "Verify declares params and return type");
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/AuditRecords('zz')")).status, 404);
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/Verify(RecordId='a')")).body.status, "VERIFIED");
  await call(port, "POST", "/odata/v1/audit/Tamper", { body: { RecordId: "a", Field: "riskScore", Value: 1 } });
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/Verify(RecordId='a')")).body.status, "INTEGRITY_FAILED");

  // Zero trust negative suite
  process.env.AUTH_REQUIRED = "true";
  const paths = ["/odata/v1/audit/AuditRecords", "/api/audit/records"];
  for (const p of paths) {
    assert.strictEqual((await call(port, "GET", p)).status, 401, "no token");
    assert.strictEqual((await call(port, "GET", p, { headers: auth({}, "x".repeat(40)) })).status, 401, "wrong secret");
    assert.strictEqual((await call(port, "GET", p, { headers: auth({ exp: 1 }) })).status, 401, "expired");
    const none = `${b64({ alg: "none" })}.${b64({ sub: "1", exp: 9999999999, iss: "firststep-platform" })}.`;
    assert.strictEqual((await call(port, "GET", p, { headers: { authorization: `Bearer ${none}` } })).status, 401, "alg none");
    assert.strictEqual((await call(port, "GET", p, { headers: auth({ typ: "service", aud: ["fraud"], scope: "audit.read" }) })).status, 403, "wrong audience");
    assert.strictEqual((await call(port, "GET", p, { headers: auth({ typ: "service", aud: ["audit"], scope: "other" }) })).status, 403, "scope");
  }
  assert.strictEqual((await call(port, "GET", "/odata/v1/audit/AuditRecords", { headers: auth({}) })).status, 200, "user ok");
  const ev = { event_id: "z1", event_type: "fraud.transaction", component: "c2", occurred_at: "2026-10-11T00:00:00Z" };
  assert.strictEqual((await call(port, "POST", "/api/audit/events", { headers: auth({}), body: ev })).status, 403, "user token cannot ingest");
  assert.strictEqual((await call(port, "POST", "/api/audit/events", { headers: auth({ typ: "service", aud: ["audit"], scope: "audit.write" }), body: ev })).status, 201);
  // Authorization, not just authentication: a plain user token must not change the record.
  assert.strictEqual((await call(port, "DELETE", "/api/audit/records", { headers: auth({}) })).status, 403, "user cannot wipe");
  assert.strictEqual((await call(port, "POST", "/api/audit/reset", { headers: auth({}) })).status, 403, "user cannot reset");
  assert.strictEqual((await call(port, "POST", "/api/audit/review", { headers: auth({}), body: { transactionId: "a", reviewerDecision: "APPROVE" } })).status, 403, "user cannot review");
  assert.strictEqual((await call(port, "POST", "/odata/v1/audit/Review", { headers: auth({}), body: { RecordId: "a", Decision: "APPROVE" } })).status, 403, "odata review needs role");
  assert.notStrictEqual((await call(port, "POST", "/api/audit/review", { headers: auth({ roles: ["auditor"] }), body: { transactionId: "a", reviewerDecision: "APPROVE" } })).status, 403, "auditor may review");
  const evalBody = { transactionId: "e1", riskScore: 10, confidence: 90, amount: 1, transactionType: "T", modelVersion: "m1" };
  assert.strictEqual((await call(port, "POST", "/api/audit/evaluate", { headers: auth({}), body: evalBody })).status, 200, "demo: user may anchor");
  process.env.DEMO_MODE = "false";
  assert.strictEqual((await call(port, "POST", "/api/audit/evaluate", { headers: auth({}), body: evalBody })).status, 403, "prod: user cannot anchor");
  assert.strictEqual((await call(port, "DELETE", "/api/audit/records", { headers: auth({ roles: ["admin"] }) })).status, 403, "prod: nobody wipes");
  assert.strictEqual((await call(port, "POST", "/api/audit/a/tamper", { headers: auth({ roles: ["admin"] }), body: {} })).status, 403, "prod: no tamper");
  process.env.DEMO_MODE = "true";

  await new Promise(res => setTimeout(res, 200));
  process.env.AUTH_REQUIRED = "false";
  const denials = audit.getAllRecords().filter(x => x.finalDecision === "security.denial");
  assert.ok(denials.length >= 6, `denials anchored (${denials.length})`);
  process.env.AUTH_REQUIRED = "true";
  assert.strictEqual((await call(port, "DELETE", "/api/audit/records", { headers: auth({ roles: ["admin"] }) })).status, 200, "demo: admin wipes");
  process.env.AUTH_REQUIRED = "false";

  audit.clearAllRecords(); server.close();
  console.log("odata + zero-trust: all passed"); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
