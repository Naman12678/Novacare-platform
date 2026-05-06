// ============================================================
// NovaCare v2.0 — Express Server Entry Point
// ============================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { config } from "./config/index.js";
import webhookRoutes from "./routes/webhook.routes.js";
import hospitalRoutes from "./routes/hospital.routes.js";
import patientRoutes from "./routes/patient.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { setupCronJobs } from "./cron/scheduler.js";
import pino from "pino";

const logger = pino({ name: "server" });
const app = express();

// ---- Global Middleware ----
app.use(helmet());
app.use(compression());
app.use(cors({ origin: config.CORS_ORIGINS.split(","), credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("short"));

// ---- Health Check ----
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "novacare-backend",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ---- Routes ----
app.use("/webhook", webhookRoutes);
app.use("/api/v1", hospitalRoutes);
app.use("/api/v1/patients", patientRoutes);

// ---- Error Handler (must be last) ----
app.use(errorHandler);

// ---- Start Server ----
const PORT = config.PORT;
app.listen(PORT, () => {
  logger.info(`🚀 NovaCare Backend running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.NODE_ENV}`);
  logger.info(`🤖 Agent Service: ${config.AGENT_SERVICE_URL}`);

  // Start cron jobs
  setupCronJobs();
});

export default app;
