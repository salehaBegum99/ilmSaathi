import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { AppConfig } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./core/errors.js";
import type { ReadinessProbe } from "./database/connection.js";
import { csrfProtection, requestContext } from "./middleware/security.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createBookingRouter } from "./routes/booking.routes.js";
import { createBlockRouter, createReportRouter } from "./routes/moderation.routes.js";
import {
  createAdminRouter,
  createEducatorRouter,
  createProfileRouter,
  createPublicEducatorRouter,
  createSubjectRouter,
} from "./routes/platform.routes.js";
import type { ApiServices } from "./services/types.js";

export interface AppDependencies {
  config: AppConfig;
  services: ApiServices;
  readiness: ReadinessProbe;
}

export function createApp({ config, services, readiness }: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.http.trustProxy);
  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || config.http.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      allowedHeaders: ["content-type", "x-csrf-token", "x-request-id"],
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.get(["/api/health/live", "/health/live"], (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.get(["/api/health/ready", "/health/ready"], async (_request, response, next) => {
    try {
      const ready = await readiness.isReady();
      response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
    } catch (error) {
      next(error);
    }
  });

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.http.apiRateLimitMax,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (request) => request.path.startsWith("/health/"),
    }),
  );
  app.use(express.json({ limit: "100kb", strict: true }));
  app.use(cookieParser());
  app.use(csrfProtection(config));

  const authLimiter = rateLimit({
    windowMs: config.http.authRateLimitWindowMs,
    limit: config.http.authRateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.use("/api/v1/auth", authLimiter, createAuthRouter(services.auth, config));
  app.use("/api/v1/profiles", createProfileRouter(services));
  app.use("/api/v1/subjects", createSubjectRouter(services));
  app.use("/api/v1/educators", createEducatorRouter(services, config));
  app.use("/api/v1/public/educators", createPublicEducatorRouter(services));
  app.use("/api/v1/admin", createAdminRouter(services, config));
  app.use("/api/v1/bookings", createBookingRouter(services));
  app.use("/api/v1/reports", createReportRouter(services));
  app.use("/api/v1/blocks", createBlockRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
