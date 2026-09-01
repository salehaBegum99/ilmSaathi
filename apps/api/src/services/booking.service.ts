import type {
  BookingAcceptInput,
  BookingActorRole,
  BookingCancelInput,
  BookingCreateInput,
  BookingDeclineInput,
  BookingStatus,
} from "@learning-platform/shared";
import { assertRole, type AuthPrincipal } from "../core/authorization.js";
import { AppError } from "../core/errors.js";
import { inTransaction, type Repositories } from "../repositories/index.js";
import type { BookingServiceContract } from "./types.js";

export class BookingService implements BookingServiceContract {
  constructor(private readonly repositories: Repositories) {}

  async requestClass(principal: AuthPrincipal, input: BookingCreateInput) {
    assertRole(principal, ["learner"]);
    if (input.educatorId === principal.userId) {
      throw new AppError(
        400,
        "self_booking_not_allowed",
        "You cannot request a class from yourself",
      );
    }
    const educator = await this.repositories.publicEducators.getPublishedByEducatorId(
      input.educatorId,
    );
    if (!educator) {
      throw new AppError(404, "educator_not_found", "This educator is not available for booking");
    }
    if (!educator.subjectIds.includes(input.subjectId)) {
      throw new AppError(
        400,
        "subject_not_offered",
        "This educator is not approved to teach that subject",
      );
    }
    if (await this.repositories.blocks.isBlockedEitherDirection(principal.userId, input.educatorId)) {
      throw new AppError(403, "blocked", "You cannot request a class with this educator");
    }
    return inTransaction(async (session) => {
      const created = await this.repositories.bookings.create({
        learnerId: principal.userId,
        educatorId: input.educatorId,
        subjectId: input.subjectId,
        startAt: new Date(input.startAt),
        timezone: input.timezone,
        message: input.message,
        session,
      });
      return this.repositories.bookings.toDto(created, this.repositories.subjects);
    });
  }

  listMine(
    principal: AuthPrincipal,
    input: { status?: BookingStatus; cursor?: string; limit: number },
  ) {
    assertRole(principal, ["learner"]);
    return this.repositories.bookings.listForLearner(
      { learnerId: principal.userId, ...input },
      this.repositories.subjects,
    );
  }

  listReceived(
    principal: AuthPrincipal,
    input: { status?: BookingStatus; cursor?: string; limit: number },
  ) {
    assertRole(principal, ["educator"]);
    return this.repositories.bookings.listForEducator(
      { educatorId: principal.userId, ...input },
      this.repositories.subjects,
    );
  }

  async accept(principal: AuthPrincipal, id: string, input: BookingAcceptInput) {
    assertRole(principal, ["educator"]);
    const now = new Date();
    return inTransaction(async (session) => {
      const updated = await this.repositories.bookings.accept({
        id,
        educatorId: principal.userId,
        meetingLink: input.meetingLink,
        at: now,
        session,
      });
      if (!updated) {
        throw new AppError(409, "booking_changed", "This request can no longer be accepted");
      }
      await this.repositories.bookingHistory.record({
        bookingId: id,
        actorId: principal.userId,
        actorRole: "educator",
        fromStatus: "requested",
        toStatus: "accepted",
        occurredAt: now,
        session,
      });
      return this.repositories.bookings.toDto(updated, this.repositories.subjects);
    });
  }

  async decline(principal: AuthPrincipal, id: string, input: BookingDeclineInput) {
    assertRole(principal, ["educator"]);
    const now = new Date();
    return inTransaction(async (session) => {
      const updated = await this.repositories.bookings.decline({
        id,
        educatorId: principal.userId,
        reason: input.reason,
        at: now,
        session,
      });
      if (!updated) {
        throw new AppError(409, "booking_changed", "This request can no longer be declined");
      }
      await this.repositories.bookingHistory.record({
        bookingId: id,
        actorId: principal.userId,
        actorRole: "educator",
        fromStatus: "requested",
        toStatus: "declined",
        reason: input.reason,
        occurredAt: now,
        session,
      });
      return this.repositories.bookings.toDto(updated, this.repositories.subjects);
    });
  }

  async cancel(principal: AuthPrincipal, id: string, input: BookingCancelInput) {
    assertRole(principal, ["learner", "educator"]);
    const now = new Date();
    return inTransaction(async (session) => {
      const current = await this.repositories.bookings.getById(id, session);
      if (!current) throw new AppError(404, "booking_not_found", "Booking request not found");
      const actorRole: BookingActorRole | null =
        String(current.learnerId) === principal.userId
          ? "learner"
          : String(current.educatorId) === principal.userId
            ? "educator"
            : null;
      // Cross-account denial: a principal who is neither the learner nor the educator on
      // this booking may never cancel it, regardless of their role elsewhere on the platform.
      if (!actorRole) {
        throw new AppError(403, "forbidden", "You are not part of this booking");
      }
      const fromStatus = current.status as BookingStatus;
      const updated = await this.repositories.bookings.cancel({
        id,
        actorId: principal.userId,
        actorRole,
        reason: input.reason,
        at: now,
        session,
      });
      if (!updated) {
        throw new AppError(409, "booking_changed", "This booking can no longer be cancelled");
      }
      await this.repositories.bookingHistory.record({
        bookingId: id,
        actorId: principal.userId,
        actorRole,
        fromStatus,
        toStatus: "cancelled",
        reason: input.reason,
        occurredAt: now,
        session,
      });
      return this.repositories.bookings.toDto(updated, this.repositories.subjects);
    });
  }

  async complete(principal: AuthPrincipal, id: string) {
    assertRole(principal, ["educator"]);
    const now = new Date();
    return inTransaction(async (session) => {
      const updated = await this.repositories.bookings.complete({
        id,
        educatorId: principal.userId,
        at: now,
        session,
      });
      if (!updated) {
        throw new AppError(
          409,
          "booking_changed",
          "This booking cannot be marked complete yet",
        );
      }
      await this.repositories.bookingHistory.record({
        bookingId: id,
        actorId: principal.userId,
        actorRole: "educator",
        fromStatus: "accepted",
        toStatus: "completed",
        occurredAt: now,
        session,
      });
      return this.repositories.bookings.toDto(updated, this.repositories.subjects);
    });
  }
}
