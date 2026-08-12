const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const divisionRoutes = require("./routes/divisions");
const employeeRoutes = require("./routes/employees");
const taskRoutes = require("./routes/tasks");
const crossAssignmentRoutes = require("./routes/crossAssignments");
const dailyLogRoutes = require("./routes/dailyLogs");
const auditLogRoutes = require("./routes/auditLogs");
const reportRoutes = require("./routes/reports");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "pussalla-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/divisions", divisionRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/cross-assignments", crossAssignmentRoutes);
app.use("/api/daily-logs", dailyLogRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/reports", reportRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
