const assert = require("assert");
const crypto = require("crypto");
const http = require("http");
process.env.DEMO_MODE = "true";
process.env.JWT_SECRET = "unit-test-secret-long-enough-0123456789abcdef";

const app = require("./src/index");
const audit = require("./src/services/auditService");
const controller = require("./src/controllers/auditController");

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
  await new Promise(res => setTimeout(res, 200));
  process.env.AUTH_REQUIRED = "false";
  const denials = audit.getAllRecords().filter(x => x.finalDecision === "security.denial");
  assert.ok(denials.length >= 6, `denials anchored (${denials.length})`);

  audit.clearAllRecords(); server.close();
  console.log("odata + zero-trust: all passed"); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
