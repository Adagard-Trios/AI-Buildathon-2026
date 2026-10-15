const express = require("express");
const cors = require("cors");
const auditRoutes = require("./routes/auditRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim()) }));
app.use(express.json());

// Routes
app.use("/api/audit", auditRoutes);
app.use("/odata/v1/audit", require("./routes/odata"));

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    component: "Component 03: Privacy-Preserving AI-to-Smart-Contract Audit Bridge",
    timestamp: new Date().toISOString()
  });
});

// Start Server
module.exports = app;
if (require.main === module) app.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(` Privacy-Preserving AI-to-Smart-Contract Audit Bridge Backend`);
  console.log(` Server listening on http://localhost:${PORT}`);
  console.log(` API Endpoint: http://localhost:${PORT}/api/audit`);
  console.log(`=============================================================`);
});
