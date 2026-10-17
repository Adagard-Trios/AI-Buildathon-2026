// RS256 mode: Component 3 verifies platform tokens with the PUBLIC key from the JWKS and
// accepts nothing it could have minted itself (no HS256, even with the right secret).
const assert = require("assert");
const crypto = require("crypto");
const http = require("http");

process.env.DEMO_MODE = "true";
process.env.JWT_SECRET = "unit-test-secret-long-enough-0123456789abcdef";
process.env.AUTH_REQUIRED = "true";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const KID = "kid-1";
const b64u = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

function rs(claims = {}, { key = privateKey, kid = KID } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "RS256", typ: "JWT", kid });
  const body = b64u({ sub: "1", iat: now, exp: now + 600, iss: "firststep-platform", aud: ["firststep-app"], ...claims });
  return `${head}.${body}.${crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url")}`;
}
function hs(claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "HS256", typ: "JWT" });
  const body = b64u({ sub: "1", iat: now, exp: now + 600, iss: "firststep-platform", aud: ["firststep-app"], ...claims });
  return `${head}.${body}.${crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

const call = (port, method, path, token, body) => new Promise((resolve, reject) => {
  const r = http.request({ port, method, path, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res => {
    let d = ""; res.on("data", c => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
  });
  r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
});

(async () => {
  let fetches = 0;
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
  const jwksServer = http.createServer((req, res) => { fetches++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ keys: [jwk] })); }).listen(0);
  process.env.PLATFORM_JWKS_URL = `http://127.0.0.1:${jwksServer.address().port}/.well-known/jwks.json`;

  const app = require("./src/index");
  const server = app.listen(0); const port = server.address().port;
  const P = "/odata/v1/audit/AuditRecords";

  assert.strictEqual((await call(port, "GET", P, rs())).status, 200, "platform-signed user token");
  assert.strictEqual((await call(port, "GET", P, rs())).status, 200, "second call");
  assert.strictEqual(fetches, 1, "JWKS is cached, not fetched per request");

  const ev = { event_id: "rs-1", event_type: "scam.verdict", component: "c2", occurred_at: "2026-10-17T00:00:00Z", owner: "1" };
  assert.strictEqual((await call(port, "POST", "/api/audit/events", rs({ typ: "service", aud: ["audit"], scope: "audit.write" }), ev)).status, 201, "service token");

  for (const [tok, why] of [
    [hs(), "HS256 with the right shared secret"],
    [rs({}, { key: other }), "signed by a key the platform does not publish"],
    [rs({}, { kid: "nope" }), "unknown kid"],
    [rs({ aud: ["audit"] }), "user token not for the app"],
    [rs({ aud: undefined }), "user token without audience"],
    [rs({ exp: 1 }), "expired"],
    [rs({ iss: "someone-else" }), "wrong issuer"],
  ]) {
    const s = (await call(port, "GET", P, tok)).status;
    assert.ok(s === 401 || s === 403, `${why}: got ${s}`);
  }
  assert.strictEqual((await call(port, "DELETE", "/api/audit/records", rs())).status, 403, "roles still enforced");
  // Tamper demo: your own record only. Reading everything (auditor) is not licence to alter it.
  const anchor = await call(port, "POST", "/api/audit/evaluate", rs({ sub: "1" }),
    { transactionId: "tx-own-1", riskScore: 90, confidence: 0.95, amount: 100, transactionType: "transfer", modelVersion: "m1" });
  assert.ok(anchor.status < 300, `anchor as user 1: ${anchor.status}`);
  const T = "/api/audit/tx-own-1/tamper";
  assert.strictEqual((await call(port, "POST", T, rs({ sub: "2" }), {})).status, 404, "someone else's record");
  assert.strictEqual((await call(port, "POST", T, rs({ sub: "2", roles: ["auditor"] }), {})).status, 404, "auditor reads, does not alter");
  assert.strictEqual((await call(port, "POST", T, rs({ sub: "1" }), {})).status, 200, "own record");
  assert.strictEqual((await call(port, "POST", T, rs({ sub: "3", roles: ["admin"] }), {})).status, 200, "admin");

  assert.strictEqual((await call(port, "DELETE", "/api/audit/records", rs({ roles: ["admin"] }))).status, 200, "admin in demo");

  server.close(); jwksServer.close();
  console.log("rs256: all passed"); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
