const crypto = require("crypto");

/**
 * Google Cloud glue for Component 3 without extra dependencies (Node 20 global fetch).
 *  - mirrorToBigQuery: streaming insert of every anchored record (README 9.4). Enabled when
 *    PROJECT_ID and BQ_DATASET are set; token comes from the Cloud Run metadata server.
 *  - verifyGoogleOidc: verifies the Google-signed token Pub/Sub attaches to push requests,
 *    so the push subscription can call /api/audit/events (README 13.2).
 * UNTESTED against a live project; the OIDC verifier is unit-tested with a local RSA key.
 */
const b64 = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function metadataToken() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`metadata token ${r.status}`);
  return (await r.json()).access_token;
}

function enabled() {
  return Boolean(process.env.PROJECT_ID && process.env.BQ_DATASET);
}

/** Fire-and-forget: a mirror failure must never fail or delay the anchoring itself. */
function mirrorToBigQuery(record) {
  if (!enabled()) return Promise.resolve(false);
  const row = {
    record_id: record.transactionId, kind: record.kind === "event" ? "event" : "decision",
    decision: record.finalDecision, policy_version: record.policyVersion, model_version: record.modelVersion,
    record_hash: record.hash, blockchain_tx_id: record.blockchainTransactionId,
    anchored_at: new Date().toISOString()
  };
  return (async () => {
    const token = await metadataToken();
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${process.env.PROJECT_ID}/datasets/${process.env.BQ_DATASET}/tables/audit_mirror/insertAll`;
    const r = await fetch(url, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ insertId: row.record_id, json: row }] }), signal: AbortSignal.timeout(5000)
    });
    const body = await r.json();
    return r.ok && !body.insertErrors;
  })().catch(() => false);
}

let certCache = { at: 0, certs: null };
async function googleCerts() {
  if (certCache.certs && Date.now() - certCache.at < 3600e3) return certCache.certs;
  const r = await fetch("https://www.googleapis.com/oauth2/v1/certs", { signal: AbortSignal.timeout(3000) });
  certCache = { at: Date.now(), certs: await r.json() };
  return certCache.certs;
}

/**
 * Verify a Google OIDC JWT (RS256). `certs` ({kid: PEM}) is injectable for tests.
 * Checks signature, expiry, issuer, audience (PUBSUB_AUDIENCE) and the push service account
 * (PUBSUB_PUSH_SA). Returns the claims or throws.
 */
async function verifyGoogleOidc(token, certs) {
  const [h, p, sig] = (token || "").split(".");
  if (!h || !p || !sig) throw new Error("malformed");
  const head = JSON.parse(b64(h).toString());
  if (head.alg !== "RS256") throw new Error("alg");
  const pem = (certs || await googleCerts())[head.kid];
  if (!pem) throw new Error("unknown key");
  if (!crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), pem, b64(sig))) throw new Error("signature");
  const c = JSON.parse(b64(p).toString());
  if (!c.exp || c.exp < Date.now() / 1000) throw new Error("expired");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(c.iss)) throw new Error("issuer");
  if (!process.env.PUBSUB_AUDIENCE || c.aud !== process.env.PUBSUB_AUDIENCE) throw new Error("audience");
  if (!process.env.PUBSUB_PUSH_SA || c.email !== process.env.PUBSUB_PUSH_SA || c.email_verified !== true) throw new Error("service account");
  return c;
}

module.exports = { mirrorToBigQuery, verifyGoogleOidc, enabled };
