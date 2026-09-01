import { Router } from "express";
import {
  bookingAcceptSchema,
  bookingCancelSchema,
  bookingCreateSchema,
  bookingDeclineSchema,
  bookingListQuerySchema,
  objectIdSchema,
} from "@learning-platform/shared";
import { asyncRoute, requireAuthentication, requireRoles } from "../middleware/security.js";
import type { ApiServices } from "../services/types.js";

export function createBookingRouter(services: ApiServices) {
  const router = Router();
  router.use(requireAuthentication(services.auth));
  const learnerOnly = requireRoles("learner");
  const educatorOnly = requireRoles("educator");

  router.post(
    "/",
    learnerOnly,
    asyncRoute(async (request, response) => {
      const input = bookingCreateSchema.parse(request.body);
      const booking = await services.bookings.requestClass(request.principal!, input);
      response.status(201).json({ booking });
    }),
  );

  router.get(
    "/mine",
    learnerOnly,
    asyncRoute(async (request, response) => {
      const query = bookingListQuerySchema.parse(request.query);
      const input = {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      };
      const result = await services.bookings.listMine(request.principal!, input);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    }),
  );

  router.get(
    "/received",
    educatorOnly,
    asyncRoute(async (request, response) => {
      const query = bookingListQuerySchema.parse(request.query);
      const input = {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      };
      const result = await services.bookings.listReceived(request.principal!, input);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    }),
  );

  router.post(
    "/:id/accept",
    educatorOnly,
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = bookingAcceptSchema.parse(request.body);
      const booking = await services.bookings.accept(request.principal!, id, input);
      response.status(200).json({ booking });
    }),
  );

  router.post(
    "/:id/decline",
    educatorOnly,
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = bookingDeclineSchema.parse(request.body);
      const booking = await services.bookings.decline(request.principal!, id, input);
      response.status(200).json({ booking });
    }),
  );

  router.post(
    "/:id/cancel",
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const input = bookingCancelSchema.parse(request.body);
      const booking = await services.bookings.cancel(request.principal!, id, input);
      response.status(200).json({ booking });
    }),
  );

  router.post(
    "/:id/complete",
    educatorOnly,
    asyncRoute(async (request, response) => {
      const id = objectIdSchema.parse(request.params["id"]);
      const booking = await services.bookings.complete(request.principal!, id);
      response.status(200).json({ booking });
    }),
  );

  return router;
}
