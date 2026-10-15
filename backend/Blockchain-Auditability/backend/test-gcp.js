const assert = require("assert");
const crypto = require("crypto");
const gcp = require("./src/services/gcp");

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = publicKey.export({ type: "spki", format: "pem" });
const b = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function tok(claims = {}, key = privateKey, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const h = b({ alg: "RS256", kid }), p = b({ iss: "https://accounts.google.com", aud: "https://audit.example", exp: now + 300,
    email: "push@proj.iam.gserviceaccount.com", email_verified: true, ...claims });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url")}`;
}
(async () => {
  process.env.PUBSUB_AUDIENCE = "https://audit.example";
  process.env.PUBSUB_PUSH_SA = "push@proj.iam.gserviceaccount.com";
  const certs = { k1: pem };
  assert.ok(await gcp.verifyGoogleOidc(tok(), certs));
  const bad = [["wrong audience", tok({ aud: "x" })], ["expired", tok({ exp: 1 })], ["wrong sa", tok({ email: "evil@x" })],
    ["unverified email", tok({ email_verified: false })], ["wrong issuer", tok({ iss: "evil" })],
    ["unknown kid", tok({}, privateKey, "k2")], ["forged signature", tok({}, crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey)]];
  for (const [name, t] of bad) await assert.rejects(gcp.verifyGoogleOidc(t, certs), `${name} must fail`);
  assert.strictEqual(await gcp.mirrorToBigQuery({ transactionId: "x" }), false); // disabled without PROJECT_ID/BQ_DATASET
  console.log("gcp: all passed");
})().catch(e => { console.error(e); process.exit(1); });
