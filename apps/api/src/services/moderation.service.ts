import type {
  BlockCreateInput,
  ReportCreateInput,
  ReportDismissInput,
  ReportResolveInput,
  ReportStatus,
} from "@learning-platform/shared";
import { assertAdminAal2, type AuthPrincipal } from "../core/authorization.js";
import { AppError } from "../core/errors.js";
import { keyedHash } from "../core/security.js";
import type { AppConfig } from "../config/env.js";
import { inTransaction, type Repositories } from "../repositories/index.js";
import type { ModerationServiceContract, RequestMetadata } from "./types.js";

export class ModerationService implements ModerationServiceContract {
  constructor(
    private readonly repositories: Repositories,
    private readonly config: AppConfig,
  ) {}

  async fileReport(principal: AuthPrincipal, input: ReportCreateInput) {
    if (input.reportedUserId === principal.userId) {
      throw new AppError(400, "self_report_not_allowed", "You cannot report yourself");
    }
    const reportedUser = await this.repositories.users.findPrincipalById(input.reportedUserId);
    if (!reportedUser) throw new AppError(404, "user_not_found", "That user could not be found");
    const created = await this.repositories.reports.create({
      reporterId: principal.userId,
      reportedUserId: input.reportedUserId,
      category: input.category,
      description: input.description,
      ...(input.relatedBookingId ? { relatedBookingId: input.relatedBookingId } : {}),
    });
    return this.repositories.reports.toDto(created);
  }

  async blockUser(principal: AuthPrincipal, input: BlockCreateInput) {
    if (input.blockedUserId === principal.userId) {
      throw new AppError(400, "self_block_not_allowed", "You cannot block yourself");
    }
    const target = await this.repositories.users.findPrincipalById(input.blockedUserId);
    if (!target) throw new AppError(404, "user_not_found", "That user could not be found");
    return this.repositories.blocks.create({
      blockerId: principal.userId,
      blockedUserId: input.blockedUserId,
    });
  }

  async unblockUser(principal: AuthPrincipal, blockId: string) {
    const removed = await this.repositories.blocks.delete(blockId, principal.userId);
    if (!removed) throw new AppError(404, "block_not_found", "Block not found");
  }

  listMyBlocks(principal: AuthPrincipal) {
    return this.repositories.blocks.listForBlocker(principal.userId);
  }

  listReports(
    principal: AuthPrincipal,
    input: { status?: ReportStatus; cursor?: string; limit: number },
  ) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    return this.repositories.reports.list(input);
  }

  async getReport(principal: AuthPrincipal, id: string) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const record = await this.repositories.reports.getById(id);
    if (!record) throw new AppError(404, "report_not_found", "Report not found");
    return this.repositories.reports.toDto(record);
  }

  async assignReport(principal: AuthPrincipal, id: string, metadata: RequestMetadata) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const now = new Date();
    return inTransaction(async (session) => {
      const updated = await this.repositories.reports.assign({
        id,
        adminId: principal.userId,
        session,
      });
      if (!updated) throw new AppError(409, "report_changed", "This report can no longer be assigned");
      await this.repositories.audit.append({
        actorId: principal.userId,
        action: "report.assigned",
        targetType: "report",
        targetId: id,
        securityContext: this.auditContext(principal, metadata),
        occurredAt: now,
        session,
      });
      return this.repositories.reports.toDto(updated);
    });
  }

  async resolveReport(
    principal: AuthPrincipal,
    id: string,
    input: ReportResolveInput,
    metadata: RequestMetadata,
  ) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const now = new Date();
    return inTransaction(async (session) => {
      const updated = await this.repositories.reports.resolve({
        id,
        adminId: principal.userId,
        reason: input.reason,
        at: now,
        session,
      });
      if (!updated) throw new AppError(409, "report_changed", "This report can no longer be resolved");
      if (input.suspendUser) {
        // Reuses the account-status check auth.service.ts already enforces at login, refresh
        // and access-token validation — no new enforcement code needed for this to take effect.
        await this.repositories.users.setAccountStatus(
          String(updated.reportedUserId),
          "suspended",
          session,
        );
      }
      await this.repositories.audit.append({
        actorId: principal.userId,
        action: input.suspendUser ? "report.resolved_with_suspension" : "report.resolved",
        targetType: "report",
        targetId: id,
        reason: input.reason,
        securityContext: this.auditContext(principal, metadata),
        occurredAt: now,
        session,
      });
      return this.repositories.reports.toDto(updated);
    });
  }

  async dismissReport(
    principal: AuthPrincipal,
    id: string,
    input: ReportDismissInput,
    metadata: RequestMetadata,
  ) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const now = new Date();
    return inTransaction(async (session) => {
      const updated = await this.repositories.reports.dismiss({
        id,
        adminId: principal.userId,
        reason: input.reason,
        at: now,
        session,
      });
      if (!updated) throw new AppError(409, "report_changed", "This report can no longer be dismissed");
      await this.repositories.audit.append({
        actorId: principal.userId,
        action: "report.dismissed",
        targetType: "report",
        targetId: id,
        reason: input.reason,
        securityContext: this.auditContext(principal, metadata),
        occurredAt: now,
        session,
      });
      return this.repositories.reports.toDto(updated);
    });
  }

  private auditContext(principal: AuthPrincipal, metadata: RequestMetadata) {
    return {
      ipHash: keyedHash(metadata.ipAddress, this.config.auth.auditHmacSecret),
      userAgent: metadata.userAgent,
      sessionId: principal.sessionId,
      aal: 2 as const,
    };
  }
}
