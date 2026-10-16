const crypto = require("crypto");
const gcp = require("../services/gcp");

/**
 * Zero-trust token check for Component 3 (README 13). HS256 only, shared JWT_SECRET, issuer
 * pinned. Service tokens (typ=service) must name audience "audit" and carry the route's
 * scope. Enforced when AUTH_REQUIRED=true. Denials are anchored on the tamper-evident log.
 */
const b64 = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function verify(token, secret) {
  const [h, p, sig] = (token || "").split(".");
  if (!h || !p || !sig) throw new Error("malformed");
  if (JSON.parse(b64(h).toString()).alg !== "HS256") throw new Error("alg");
  const good = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = b64(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) throw new Error("signature");
  const c = JSON.parse(b64(p).toString());
  if (c.iss !== "firststep-platform") throw new Error("issuer");
  if (!c.exp || c.exp < Date.now() / 1000) throw new Error("expired");
  if (!c.sub) throw new Error("subject");
  return c;
}

const demoMode = () => process.env.DEMO_MODE === "true";

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
    if (process.env.AUTH_REQUIRED !== "true") return next();
    const userBlocked = typeof serviceOnly === "function" ? serviceOnly(req) : serviceOnly;
    const deny = (reason, code = 401) => {
      require("../controllers/auditController").recordDenial(req, reason);
      return res.status(code).json({ success: false, message: code === 401 ? "Not authenticated" : "Forbidden" });
    };
    const secret = (process.env.JWT_SECRET || "").trim();
    if (!secret) return res.status(500).json({ success: false, message: "Server auth is misconfigured" });
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) return deny("missing token");
    // Pub/Sub push carries a Google-signed token instead of a platform token. Accepted only on
    // service-only (ingest) routes and only when PUBSUB_AUDIENCE is configured.
    if (userBlocked && process.env.PUBSUB_AUDIENCE && m[1].split(".").length === 3
        && (() => { try { return JSON.parse(Buffer.from(m[1].split(".")[0], "base64url").toString()).alg === "RS256"; } catch { return false; } })()) {
      return gcp.verifyGoogleOidc(m[1]).then(c => { req.principal = { subject: c.email, kind: "service" }; next(); })
        .catch(e => deny(`invalid google token: ${e.message}`));
    }
    let c;
    try { c = verify(m[1], secret); } catch (e) { return deny(`invalid token: ${e.message}`); }
    if (c.typ === "service") {
      const aud = [].concat(c.aud || []);
      if (!aud.includes("audit")) return deny("wrong audience", 403);
      if (scope && !String(c.scope || "").split(" ").includes(scope)) return deny("insufficient scope", 403);
    } else if (userBlocked) {
      return deny("user token on service-only route", 403);
    } else if (role && ![].concat(c.roles || []).includes(role)) {
      return deny(`missing role ${role}`, 403);
    }
    req.principal = { subject: c.sub, kind: c.typ === "service" ? "service" : "user", roles: [].concat(c.roles || []) };
    next();
  };
}

module.exports = { guard, verify, demoMode };
