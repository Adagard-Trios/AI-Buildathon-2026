const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { guard, demoMode } = require("../middleware/auth");

// Every route names its own guard, so nothing is reachable by falling through a default.
//   read   : any signed-in user, or a service holding audit.read
//   ingest : services only (the components that produce decisions)
//   review : users with the "auditor" role, or a service holding audit.review
//   admin  : DEMO_MODE only, and then only the "admin" role or audit.admin
const read = guard({ scope: "audit.read" });
const ingest = guard({ scope: "audit.write", serviceOnly: true });
// /evaluate anchors a decision. Outside DEMO_MODE only the components that made the decision
// may submit it; in DEMO_MODE the Tamper demo screen submits one as the signed-in user.
const evaluate = guard({ scope: "audit.write", serviceOnly: () => !demoMode() });
const review = guard({ scope: "audit.review", role: "auditor" });
const admin = guard({ scope: "audit.admin", role: "admin", demoOnly: true });
const tamper = guard({ scope: "audit.write", demoOnly: true });

router.post("/evaluate", evaluate, auditController.evaluateDecision);
router.post("/review", review, auditController.submitHumanReview);
router.post("/events", ingest, auditController.ingestEvent);
router.post("/security-events", ingest, auditController.ingestSecurityEvent);
router.get("/records", read, auditController.getRecords);
router.delete("/records", admin, auditController.clearRecords);
router.post("/reset", admin, auditController.clearRecords);
router.get("/stats", read, auditController.getStats);
router.get("/:transactionId/verify", read, auditController.verifyAudit);
router.post("/:transactionId/tamper", tamper, auditController.simulateTampering);

module.exports = router;
module.exports.guards = { read, ingest, evaluate, review, admin, tamper };
