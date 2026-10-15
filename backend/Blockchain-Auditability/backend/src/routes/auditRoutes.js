const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { guard } = require("../middleware/auth");

// API Routes
router.use((req, res, next) => (["/events", "/security-events"].includes(req.path) ? next() : guard({ scope: req.method === "GET" ? "audit.read" : "audit.write" })(req, res, next)));
router.post("/evaluate", auditController.evaluateDecision);
router.post("/review", auditController.submitHumanReview);
router.post("/events", guard({ scope: "audit.write", serviceOnly: true }), auditController.ingestEvent);
router.post("/security-events", guard({ scope: "audit.write", serviceOnly: true }), auditController.ingestSecurityEvent);
router.get("/records", auditController.getRecords);
router.delete("/records", auditController.clearRecords);
router.post("/reset", auditController.clearRecords);
router.get("/stats", auditController.getStats);
router.get("/:transactionId/verify", auditController.verifyAudit);
router.post("/:transactionId/tamper", auditController.simulateTampering);

module.exports = router;
