const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const divisionRoutes = require("./routes/divisions");
const employeeRoutes = require("./routes/employees");
const taskRoutes = require("./routes/tasks");
const crossAssignmentRoutes = require("./routes/crossAssignments");
const dailyLogRoutes = require("./routes/dailyLogs");
const auditLogRoutes = require("./routes/auditLogs");
const reportRoutes = require("./routes/reports");

const path = require("path");
const fs = require("fs");

const app = express();

app.use(helmet());

// CORS: in development allow any origin; in production require an explicit
// CORS_ORIGIN (remove the wildcard fallback so the public demo isn't wide open).
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : (process.env.NODE_ENV === "production" ? false : "*");
app.use(cors(corsOrigin === false ? undefined : { origin: corsOrigin }));

app.use(express.json());
// Allow large CSV uploads for the bulk-import endpoint without a body cap.
app.use(express.text({ type: "text/csv", limit: "5mb" }));
app.use(morgan("dev"));

// Rate-limit login attempts to slow brute-force on the public demo.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

app.get("/api/health", (req, res) => res.json({ ok: true, service: "pussalla-backend" }));

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/divisions", divisionRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/cross-assignments", crossAssignmentRoutes);
app.use("/api/daily-logs", dailyLogRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/reports", reportRoutes);

// Serve the built frontend from the same origin as the API (registered after
// the API routes so /api/* always wins). The React build is bundled inside
// pussalla-backend/public/ (committed) and rebuilt on install when the
// frontend source is present. Served whenever public/index.html exists, so the
// deploy "just works" with no SERVE_FRONTEND flag.
const distDir = path.join(__dirname, "..", "public");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  // SPA fallback: any non-/api GET returns index.html (client-side routing).
  app.get(/^\/(?!api).*/, (req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
