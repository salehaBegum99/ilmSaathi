import { Router } from "express";
import { blockCreateSchema, objectIdSchema, reportCreateSchema } from "@learning-platform/shared";
import { asyncRoute, requireAuthentication } from "../middleware/security.js";
import type { ApiServices } from "../services/types.js";

export function createReportRouter(services: ApiServices) {
  const router = Router();
  router.use(requireAuthentication(services.auth));
  router.post(
    "/",
    asyncRoute(async (request, response) => {
      const input = reportCreateSchema.parse(request.body);
      const report = await services.moderation.fileReport(request.principal!, input);
      response.status(201).json({ report });
    }),
  );
  return router;
}

export function createBlockRouter(services: ApiServices) {
  const router = Router();
  router.use(requireAuthentication(services.auth));
  router.get(
    "/mine",
    asyncRoute(async (request, response) => {
      const blocks = await services.moderation.listMyBlocks(request.principal!);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ blocks });
    }),
  );
  router.post(
    "/",
    asyncRoute(async (request, response) => {
      const input = blockCreateSchema.parse(request.body);
      const block = await services.moderation.blockUser(request.principal!, input);
      response.status(201).json({ block });
    }),
  );
  router.delete(
    "/:id",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      await services.moderation.unblockUser(request.principal!, id);
      response.status(204).send();
    }),
  );
  return router;
}
