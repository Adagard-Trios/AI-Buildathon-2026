const assert = require("assert");
process.env.DEMO_MODE = "true";
const c = require("./src/controllers/auditController");
const audit = require("./src/services/auditService");
const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

(async () => {
  audit.clearAllRecords();
  const ev = { event_id: "e1", event_type: "fraud.transaction", schema_version: "1.0", component: "c2",
    occurred_at: "2026-10-11T00:00:00Z", model_version: "m1", policy_version: "G-1",
    principal: "u1", request: { b: 1, a: 2 }, response: { action: "BLOCK" } };

  let r = res(); await c.ingestEvent({ body: ev }, r);
  assert.strictEqual(r.code, 201);
  r = res(); await c.ingestEvent({ body: ev }, r);
  assert.strictEqual(r.body.duplicate, true);

  r = res(); await c.ingestEvent({ body: { message: { data: Buffer.from(JSON.stringify({ ...ev, event_id: "e2" })).toString("base64") } } }, r);
  assert.strictEqual(r.code, 201);

  r = res(); await c.ingestEvent({ body: { event_id: "x" } }, r);
  assert.strictEqual(r.code, 400);

  r = res(); await c.verifyAudit({ params: { transactionId: "e1" } }, r);
  assert.strictEqual(r.body.status, "VERIFIED");

  r = res(); await c.simulateTampering({ params: { transactionId: "e1" }, body: { field: "response", tamperedValue: { action: "ALLOW" } } }, r);
  assert.strictEqual(r.code, 200);
  r = res(); await c.verifyAudit({ params: { transactionId: "e1" } }, r);
  assert.strictEqual(r.body.status, "INTEGRITY_FAILED");

  r = res(); await c.ingestSecurityEvent({ body: { principal: "evil", reason: "expired token" } }, r);
  assert.strictEqual(r.code, 201);

  process.env.DEMO_MODE = "false";
  r = res(); await c.simulateTampering({ params: { transactionId: "e2" }, body: {} }, r);
  assert.strictEqual(r.code, 403);

  audit.clearAllRecords();
  console.log("events: all passed");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
