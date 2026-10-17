const crypto = require("crypto");
const gcp = require("../services/gcp");

/**
 * Zero-trust token check for Component 3 (README 13). Issuer pinned, one algorithm per mode:
 *
 *  - RS256 (PLATFORM_JWKS_URL or PLATFORM_PUBLIC_KEY set): verified against the platform's
 *    PUBLIC key, so this service holds nothing that could mint a token. User tokens must be
 *    addressed to the app (aud "firststep-app").
 *  - legacy HS256 with the shared JWT_SECRET when neither is set (unit tests).
 *
 * Service tokens (typ=service) must name audience "audit" and carry the route's scope.
 * Enforced unless AUTH_REQUIRED is explicitly false. Denials are anchored on the tamper-evident log.
 */
const b64 = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const ISSUER = "firststep-platform";
const USER_AUDIENCE = "firststep-app";

function decodePart(part) {
  return JSON.parse(b64(part).toString());
}

function checkClaims(c) {
  if (c.iss !== ISSUER) throw new Error("issuer");
  if (!c.exp || c.exp < Date.now() / 1000) throw new Error("expired");
  if (!c.sub) throw new Error("subject");
  return c;
}

/** Legacy HS256 verification with the shared secret. */
function verify(token, secret) {
  const [h, p, sig] = (token || "").split(".");
  if (!h || !p || !sig) throw new Error("malformed");
  if (decodePart(h).alg !== "HS256") throw new Error("alg");
  const good = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = b64(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) throw new Error("signature");
  return checkClaims(decodePart(p));
}

/** RS256 verification with a public KeyObject. */
function verifyRs256(token, publicKey) {
  const [h, p, sig] = (token || "").split(".");
  if (!h || !p || !sig) throw new Error("malformed");
  if (decodePart(h).alg !== "RS256") throw new Error("alg");
  if (!crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, b64(sig))) throw new Error("signature");
  return checkClaims(decodePart(p));
}

// --- platform public keys ---------------------------------------------------------------
let jwksCache = { url: null, keys: new Map(), fetchedAt: 0 };
const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 30 * 1000;

async function fetchJwks(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const keys = new Map();
  for (const jwk of (await r.json()).keys || []) {
    if (jwk.kty === "RSA" && jwk.kid) keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
  }
  jwksCache = { url, keys, fetchedAt: Date.now() };
}

/** The platform key for this token's kid; refetches on an unknown kid (key rotation). */
async function platformKey(token) {
  const pem = (process.env.PLATFORM_PUBLIC_KEY || "").trim();
  if (pem) return crypto.createPublicKey(pem);
  const url = process.env.PLATFORM_JWKS_URL.trim();
  const { kid } = decodePart(token.split(".")[0]);
  const stale = jwksCache.url !== url || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS;
  const unknown = !jwksCache.keys.has(kid) && Date.now() - jwksCache.fetchedAt > JWKS_MIN_REFETCH_MS;
  if (stale || unknown) await fetchJwks(url);
  const key = jwksCache.keys.get(kid);
  if (!key) throw new Error("unknown kid");
  return key;
}

const asymmetric = () => Boolean((process.env.PLATFORM_PUBLIC_KEY || "").trim() || (process.env.PLATFORM_JWKS_URL || "").trim());

/** Verify a platform token in whichever mode is configured. Resolves to the claims. */
async function verifyPlatformToken(token) {
  if (asymmetric()) return verifyRs256(token, await platformKey(token));
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) {
    const e = new Error("misconfigured");
    e.misconfigured = true;
    throw e;
  }
  return verify(token, secret);
}

const demoMode = () => process.env.DEMO_MODE === "true";
const authOff = () => ["0", "false", "no", "off"].includes(String(process.env.AUTH_REQUIRED ?? "true").trim().toLowerCase());

function isGoogleToken(token) {
  try {
    const iss = decodePart(token.split(".")[1]).iss;
    return iss === "https://accounts.google.com" || iss === "accounts.google.com";
  } catch {
    return false;
  }
}

/**
 * scope:       required scope for SERVICE tokens.
 * serviceOnly: reject user tokens. A function is evaluated per request (e.g. "only outside DEMO_MODE").
 * role:        required role for USER tokens (the platform's `roles` claim). Without it a user
 *              token passes on authentication alone, which is fine for reads and wrong for
 *              anything that changes the record.
 * demoOnly:    the route exists only in DEMO_MODE; otherwise 403 before any token check.
 */
function guard({ scope, serviceOnly = false, role, demoOnly = false } = {}) {
  return (req, res, next) => {
    if (demoOnly && !demoMode()) {
      return res.status(403).json({ success: false, message: "Disabled outside DEMO_MODE" });
    }
    // Fail closed: only an explicit "off" disables enforcement (same rule as shared/auth/zt_auth.py).
    if (authOff()) return next();
    const userBlocked = typeof serviceOnly === "function" ? serviceOnly(req) : serviceOnly;
    const deny = (reason, code = 401) => {
      require("../controllers/auditController").recordDenial(req, reason);
      return res.status(code).json({ success: false, message: code === 401 ? "Not authenticated" : "Forbidden" });
    };
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) return deny("missing token");
    // Pub/Sub push carries a Google-signed token instead of a platform token. Accepted only on
    // service-only (ingest) routes, only when PUBSUB_AUDIENCE is configured, and only when the
    // token says Google issued it (platform RS256 tokens take the normal path).
    if (userBlocked && process.env.PUBSUB_AUDIENCE && isGoogleToken(m[1])) {
      return gcp.verifyGoogleOidc(m[1]).then(c => { req.principal = { subject: c.email, kind: "service" }; next(); })
        .catch(e => deny(`invalid google token: ${e.message}`));
    }
    verifyPlatformToken(m[1]).then(c => {
      if (c.typ === "service") {
        const aud = [].concat(c.aud || []);
        if (!aud.includes("audit")) return deny("wrong audience", 403);
        if (scope && !String(c.scope || "").split(" ").includes(scope)) return deny("insufficient scope", 403);
      } else {
        const aud = [].concat(c.aud || []);
        // A user token must be meant for the app. Legacy HS256 test tokens carry no aud.
        if ((asymmetric() || aud.length) && !aud.includes(USER_AUDIENCE)) return deny("user token without the app audience", 403);
        if (userBlocked) return deny("user token on service-only route", 403);
        if (role && ![].concat(c.roles || []).includes(role)) return deny(`missing role ${role}`, 403);
      }
      req.principal = { subject: c.sub, kind: c.typ === "service" ? "service" : "user", roles: [].concat(c.roles || []) };
      next();
    }).catch(e => {
      if (e.misconfigured) return res.status(500).json({ success: false, message: "Server auth is misconfigured" });
      return deny(`invalid token: ${e.message}`);
    });
  };
}

module.exports = { guard, verify, verifyRs256, demoMode };
