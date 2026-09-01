import express, { Router } from "express";
import {
  adminApplicationDecisionSchema,
  adminApplicationListQuerySchema,
  adminEducatorListQuerySchema,
  auditLogQuerySchema,
  educatorApplicationDraftSchema,
  educatorSuspensionReasonSchema,
  objectIdSchema,
  onboardingSchema,
  publicEducatorListQuerySchema,
  reportDismissSchema,
  reportListQuerySchema,
  reportResolveSchema,
} from "@learning-platform/shared";
import { AppError } from "../core/errors.js";
import type { AppConfig } from "../config/env.js";
import {
  asyncRoute,
  requestMetadata,
  requireAuthentication,
  requireMfa,
  requireRoles,
} from "../middleware/security.js";
import type { ApiServices } from "../services/types.js";

const VERIFICATION_DOCUMENT_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function createProfileRouter(services: ApiServices) {
  const router = Router();
  router.use(requireAuthentication(services.auth));
  router.get(
    "/me",
    asyncRoute(async (request, response) => {
      const profile = await services.profiles.getOwn(request.principal!);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ profile });
    }),
  );
  router.put(
    "/me/onboarding",
    asyncRoute(async (request, response) => {
      const input = onboardingSchema.parse(request.body);
      const profile = await services.profiles.completeOnboarding(request.principal!, input);
      response.status(200).json({ profile });
    }),
  );
  return router;
}

export function createSubjectRouter(services: ApiServices) {
  const router = Router();
  router.get(
    "/",
    asyncRoute(async (_request, response) => {
      const subjects = await services.subjects.listActive();
      response.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      response.status(200).json({ subjects });
    }),
  );
  return router;
}

export function createEducatorRouter(services: ApiServices, config: AppConfig) {
  const router = Router();
  const authenticated = requireAuthentication(services.auth);
  const educatorOnly = requireRoles("educator");
  router.get(
    "/me/application",
    authenticated,
    educatorOnly,
    asyncRoute(async (request, response) => {
      const application = await services.educators.getOwnApplication(request.principal!);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ application });
    }),
  );
  router.put(
    "/me/application",
    authenticated,
    educatorOnly,
    asyncRoute(async (request, response) => {
      const input = educatorApplicationDraftSchema.parse(request.body);
      const application = await services.educators.saveDraft(request.principal!, input);
      response.status(200).json({ application });
    }),
  );
  router.post(
    "/me/application/submit",
    authenticated,
    educatorOnly,
    asyncRoute(async (request, response) => {
      const application = await services.educators.submit(request.principal!);
      response.status(200).json({ application });
    }),
  );
  router.get(
    "/me/application/documents",
    authenticated,
    educatorOnly,
    asyncRoute(async (request, response) => {
      const documents = await services.educators.listMyDocuments(request.principal!);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ documents });
    }),
  );
  router.post(
    "/me/application/documents",
    authenticated,
    educatorOnly,
    express.raw({ type: () => true, limit: config.uploads.maxBytes + 1_024 }),
    asyncRoute(async (request, response) => {
      const declaredContentType = (request.header("content-type") || "").split(";")[0]!.trim();
      if (!VERIFICATION_DOCUMENT_CONTENT_TYPES.has(declaredContentType)) {
        throw new AppError(400, "file_type_invalid", "Only PDF, JPEG or PNG files are accepted");
      }
      const filenameHeader = request.header("x-filename") || "document";
      let filename: string;
      try {
        filename = decodeURIComponent(filenameHeader).slice(0, 200);
      } catch {
        filename = "document";
      }
      const buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const document = await services.educators.uploadDocument(request.principal!, {
        buffer,
        filename,
        declaredContentType,
      });
      response.status(201).json({ document });
    }),
  );
  router.delete(
    "/me/application/documents/:id",
    authenticated,
    educatorOnly,
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      await services.educators.deleteMyDocument(request.principal!, id);
      response.status(204).send();
    }),
  );
  return router;
}

export function createPublicEducatorRouter(services: ApiServices) {
  const router = Router();
  router.get(
    "/",
    asyncRoute(async (request, response) => {
      const query = publicEducatorListQuerySchema.parse(request.query);
      const input = {
        limit: query.limit,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.language ? { language: query.language } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      };
      const result = await services.educators.listPublic(input);
      response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      response.status(200).json(result);
    }),
  );
  return router;
}

export function createAdminRouter(services: ApiServices, config: AppConfig) {
  const router = Router();
  router.use(requireAuthentication(services.auth));
  router.use(requireRoles("admin"));
  router.use(requireMfa(config.mfa.maxAgeSeconds));

  router.get(
    "/educator-applications",
    asyncRoute(async (request, response) => {
      const query = adminApplicationListQuerySchema.parse(request.query);
      const input = {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      };
      const result = await services.admin.listApplications(request.principal!, input);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    }),
  );
  router.get(
    "/educator-applications/:id",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const application = await services.admin.getApplication(request.principal!, id);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ application });
    }),
  );
  router.post(
    "/educator-applications/:id/start-review",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const application = await services.admin.startReview(
        request.principal!,
        id,
        requestMetadata(request),
      );
      response.status(200).json({ application });
    }),
  );
  router.post(
    "/educator-applications/:id/decision",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = adminApplicationDecisionSchema.parse(request.body);
      const application = await services.admin.decide(
        request.principal!,
        id,
        input,
        requestMetadata(request),
      );
      response.status(200).json({ application });
    }),
  );
  router.get(
    "/educator-applications/:id/documents",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const documents = await services.admin.listApplicationDocuments(request.principal!, id);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ documents });
    }),
  );
  router.post(
    "/educator-applications/:id/documents/:documentId/access",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const documentId = objectIdSchema.parse(request.params["documentId"]);
      const access = await services.admin.issueDocumentAccessToken(
        request.principal!,
        id,
        documentId,
        requestMetadata(request),
      );
      response.status(200).json({ access });
    }),
  );
  router.get(
    "/educator-applications/:id/documents/:documentId/content",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const documentId = objectIdSchema.parse(request.params["documentId"]);
      const token = String(request.query["token"] || "");
      const file = await services.admin.readDocumentForDownload(id, documentId, token);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", file.contentType);
      response.setHeader("Content-Length", String(file.sizeBytes));
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${file.filename.replace(/["\r\n]/g, "_")}"`,
      );
      file.stream.on("error", (error) => response.destroy(error));
      file.stream.pipe(response);
    }),
  );
  router.get(
    "/educators",
    asyncRoute(async (request, response) => {
      const query = adminEducatorListQuerySchema.parse(request.query);
      const input = { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) };
      const result = await services.admin.listEducators(request.principal!, input);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    }),
  );
  router.post(
    "/educators/:id/suspend",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = educatorSuspensionReasonSchema.parse(request.body);
      await services.admin.suspendEducator(request.principal!, id, input, requestMetadata(request));
      response.status(204).send();
    }),
  );
  router.post(
    "/educators/:id/reinstate",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = educatorSuspensionReasonSchema.parse(request.body);
      await services.admin.reinstateEducator(request.principal!, id, input, requestMetadata(request));
      response.status(204).send();
    }),
  );
  router.get(
    "/audit-log",
    asyncRoute(async (request, response) => {
      const query = auditLogQuerySchema.parse(request.query);
      const input = { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) };
      const result = await services.admin.listAuditLog(request.principal!, input);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    }),
  );
  router.get(
    "/reports",
    asyncRoute(async (request, response) => {
      const query = reportListQuerySchema.parse(request.query);
      const input = {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      };
      const result = await services.moderation.listReports(request.principal!, input);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    }),
  );
  router.get(
    "/reports/:id",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const report = await services.moderation.getReport(request.principal!, id);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ report });
    }),
  );
  router.post(
    "/reports/:id/assign",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const report = await services.moderation.assignReport(
        request.principal!,
        id,
        requestMetadata(request),
      );
      response.status(200).json({ report });
    }),
  );
  router.post(
    "/reports/:id/resolve",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = reportResolveSchema.parse(request.body);
      const report = await services.moderation.resolveReport(
        request.principal!,
        id,
        input,
        requestMetadata(request),
      );
      response.status(200).json({ report });
    }),
  );
  router.post(
    "/reports/:id/dismiss",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = reportDismissSchema.parse(request.body);
      const report = await services.moderation.dismissReport(
        request.principal!,
        id,
        input,
        requestMetadata(request),
      );
      response.status(200).json({ report });
    }),
  );
  return router;
}
