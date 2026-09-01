import type {
  AdminApplicationDecisionInput,
  EducatorApplicationDraftInput,
  EducatorApplicationStatus,
  EducatorSuspensionReasonInput,
  Language,
  OnboardingInput,
} from "@learning-platform/shared";
import { assertAdminAal2, assertRole, type AuthPrincipal } from "../core/authorization.js";
import { AppError } from "../core/errors.js";
import {
  deriveDocumentAccessSecret,
  keyedHash,
  signDocumentAccessToken,
  verifyDocumentAccessToken,
} from "../core/security.js";
import { sniffContentType } from "../core/file-signatures.js";
import type { AppConfig } from "../config/env.js";
import { inTransaction, type Repositories } from "../repositories/index.js";
import type { DocumentStorage } from "./document-storage.service.js";
import type { EmailServiceContract } from "./email.service.js";
import type {
  AdminServiceContract,
  EducatorServiceContract,
  ProfileServiceContract,
  RequestMetadata,
  SubjectServiceContract,
} from "./types.js";

export class ProfileService implements ProfileServiceContract {
  constructor(private readonly repositories: Repositories) {}

  async getOwn(principal: AuthPrincipal) {
    const profile = await this.repositories.profiles.findByOwner(principal.userId);
    if (!profile) throw new AppError(404, "profile_not_found", "Profile not found");
    return profile;
  }

  async completeOnboarding(principal: AuthPrincipal, input: OnboardingInput) {
    if (!(await this.repositories.subjects.activeIdsExist(input.subjectIds))) {
      throw new AppError(400, "subject_invalid", "One or more selected subjects are unavailable");
    }
    return this.repositories.profiles.completeOnboarding({
      userId: principal.userId,
      displayName: input.displayName,
      preferredLanguage: input.preferredLanguage,
      timezone: input.timezone,
      learningGoals: input.learningGoals,
      subjectIds: input.subjectIds,
      at: new Date(),
    });
  }
}

export class SubjectService implements SubjectServiceContract {
  constructor(private readonly repositories: Repositories) {}
  listActive() {
    return this.repositories.subjects.listActive();
  }
}

export class EducatorService implements EducatorServiceContract {
  constructor(
    private readonly repositories: Repositories,
    private readonly config: AppConfig,
    private readonly email: EmailServiceContract,
    private readonly storage: DocumentStorage,
  ) {}

  getOwnApplication(principal: AuthPrincipal) {
    assertRole(principal, ["educator"]);
    return this.repositories.applications.getByOwner(principal.userId);
  }

  async saveDraft(principal: AuthPrincipal, input: EducatorApplicationDraftInput) {
    assertRole(principal, ["educator"]);
    const existing = await this.repositories.applications.getByOwner(principal.userId);
    if (existing && !["draft", "changes_requested"].includes(existing.status)) {
      throw new AppError(409, "application_locked", "This application can no longer be edited");
    }
    const subjectIds = input.subjectClaims.map(({ subjectId }) => subjectId);
    if (!(await this.repositories.subjects.activeIdsExist(subjectIds))) {
      throw new AppError(400, "subject_invalid", "One or more selected subjects are unavailable");
    }
    const saved = await this.repositories.applications.saveDraft(principal.userId, input);
    if (!saved) {
      throw new AppError(409, "application_changed", "The application changed; reload it");
    }
    return saved;
  }

  async submit(principal: AuthPrincipal) {
    assertRole(principal, ["educator"]);
    const profile = await this.repositories.profiles.findByOwner(principal.userId);
    if (!profile?.onboardingCompletedAt || !profile.displayName) {
      throw new AppError(409, "onboarding_required", "Complete your profile before applying");
    }
    const submitted = await inTransaction(async (session) => {
      const current = await this.repositories.applications.getByOwner(principal.userId, session);
      if (!current) {
        throw new AppError(409, "application_missing", "Create an application draft first");
      }
      if (current.status !== "draft" && current.status !== "changes_requested") {
        throw new AppError(
          409,
          "invalid_application_state",
          "Only a draft or requested revision can be submitted",
        );
      }
      const submittedAt = new Date();
      const result = await this.repositories.applications.submit(
        principal.userId,
        current.status,
        submittedAt,
        session,
      );
      if (!result) {
        throw new AppError(409, "application_changed", "The application changed; reload it");
      }
      await this.repositories.applicationHistory.record({
        applicationId: current.id,
        educatorId: current.educatorId,
        actorId: principal.userId,
        fromStatus: current.status,
        toStatus: "submitted",
        occurredAt: submittedAt,
        session,
      });
      return result;
    });
    // Best-effort: a notification failure must never undo or block a successful submission.
    this.notifyAdminsOfSubmission(principal.email).catch((error) => {
      console.error("educator_submission_notification_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    });
    return submitted;
  }

  private async notifyAdminsOfSubmission(educatorEmail: string): Promise<void> {
    const adminEmails = await this.repositories.users.listEmailsByRole("admin");
    const subject = "New educator application awaiting review";
    const text = `${educatorEmail} submitted an educator application on IlmSaathi.\n\nReview it: ${this.config.webUrl}/admin`;
    await Promise.all(adminEmails.map((to) => this.email.send({ to, subject, text })));
  }

  listPublic(input: {
    subjectId?: string;
    language?: Language;
    cursor?: string;
    limit: number;
  }) {
    return this.repositories.publicEducators.list(input, this.repositories.subjects);
  }

  async uploadDocument(
    principal: AuthPrincipal,
    input: { buffer: Buffer; filename: string; declaredContentType: string },
  ) {
    assertRole(principal, ["educator"]);
    const application = await this.repositories.applications.getByOwner(principal.userId);
    if (!application || !["draft", "changes_requested"].includes(application.status)) {
      throw new AppError(
        409,
        "application_not_editable",
        "Save a draft application before adding evidence",
      );
    }
    if (input.buffer.byteLength === 0 || input.buffer.byteLength > this.config.uploads.maxBytes) {
      throw new AppError(
        400,
        "file_size_invalid",
        `File must be no larger than ${Math.floor(this.config.uploads.maxBytes / (1024 * 1024))} MB`,
      );
    }
    const sniffed = sniffContentType(input.buffer);
    if (!sniffed || sniffed !== input.declaredContentType) {
      throw new AppError(
        400,
        "file_type_invalid",
        "File type could not be verified as PDF, JPEG or PNG",
      );
    }
    const existingCount = await this.repositories.verificationDocuments.countForApplication(
      application.id,
    );
    if (existingCount >= 5) {
      throw new AppError(
        409,
        "document_limit_reached",
        "Up to 5 evidence documents are allowed per application",
      );
    }
    const filename = input.filename.trim().slice(0, 200) || "document";
    const { objectKey } = await this.storage.save(input.buffer);
    return this.repositories.verificationDocuments.create({
      applicationId: application.id,
      educatorId: principal.userId,
      objectKey,
      originalFilename: filename,
      contentType: sniffed,
      sizeBytes: input.buffer.byteLength,
    });
  }

  async listMyDocuments(principal: AuthPrincipal) {
    assertRole(principal, ["educator"]);
    const application = await this.repositories.applications.getByOwner(principal.userId);
    if (!application) return [];
    return this.repositories.verificationDocuments.listForApplication(application.id);
  }

  async deleteMyDocument(principal: AuthPrincipal, documentId: string) {
    assertRole(principal, ["educator"]);
    const application = await this.repositories.applications.getByOwner(principal.userId);
    if (!application || !["draft", "changes_requested"].includes(application.status)) {
      throw new AppError(409, "application_not_editable", "This application can no longer be edited");
    }
    const deleted = await this.repositories.verificationDocuments.deleteById({
      id: documentId,
      applicationId: application.id,
    });
    if (!deleted) throw new AppError(404, "document_not_found", "Document not found");
    await this.storage.delete(deleted.objectKey);
  }
}

export class AdminService implements AdminServiceContract {
  constructor(
    private readonly repositories: Repositories,
    private readonly config: AppConfig,
    private readonly email: EmailServiceContract,
    private readonly storage: DocumentStorage,
  ) {}

  listApplications(
    principal: AuthPrincipal,
    input: { status?: EducatorApplicationStatus; cursor?: string; limit: number },
  ) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    return this.repositories.applications.list(input);
  }

  async getApplication(principal: AuthPrincipal, id: string) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const application = await this.repositories.applications.getById(id);
    if (!application) throw new AppError(404, "application_not_found", "Application not found");
    return application;
  }

  async startReview(principal: AuthPrincipal, id: string, metadata: RequestMetadata) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const now = new Date();
    return inTransaction(async (session) => {
      const current = await this.repositories.applications.getById(id, session);
      if (!current) throw new AppError(404, "application_not_found", "Application not found");
      if (current.status !== "submitted") {
        throw new AppError(409, "invalid_application_state", "Only submitted applications can enter review");
      }
      const updated = await this.repositories.applications.startReview({
        id,
        reviewerId: principal.userId,
        at: now,
        session,
      });
      if (!updated) throw new AppError(409, "application_changed", "The application changed; reload it");
      await this.repositories.applicationHistory.record({
        applicationId: id,
        educatorId: current.educatorId,
        actorId: principal.userId,
        fromStatus: "submitted",
        toStatus: "under_review",
        occurredAt: now,
        session,
      });
      await this.repositories.audit.append({
        actorId: principal.userId,
        action: "educator_application.review_started",
        targetType: "educator_application",
        targetId: id,
        securityContext: this.auditContext(principal, metadata),
        occurredAt: now,
        session,
      });
      return updated;
    });
  }

  async decide(
    principal: AuthPrincipal,
    id: string,
    input: AdminApplicationDecisionInput,
    metadata: RequestMetadata,
  ) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const now = new Date();
    const toStatus = input.decision === "approve"
      ? "approved"
      : input.decision === "reject"
        ? "rejected"
        : "changes_requested";
    const decided = await inTransaction(async (session) => {
      const current = await this.repositories.applications.getById(id, session);
      if (!current) throw new AppError(404, "application_not_found", "Application not found");
      if (current.status !== "under_review") {
        throw new AppError(409, "invalid_application_state", "Only applications under review can be decided");
      }
      const updated = await this.repositories.applications.decide({
        id,
        reviewerId: principal.userId,
        toStatus,
        reason: input.reason,
        at: now,
        session,
      });
      if (!updated) {
        throw new AppError(409, "reviewer_mismatch", "Only the assigned reviewer can decide this application");
      }
      if (toStatus === "approved") {
        const displayName = await this.repositories.profiles.getDisplayName(current.educatorId, session);
        if (!displayName) {
          throw new AppError(409, "educator_profile_incomplete", "The educator profile is incomplete");
        }
        await this.repositories.publicEducators.publish({
          application: updated,
          displayName,
          approvedAt: now,
          session,
        });
      } else {
        await this.repositories.publicEducators.unpublish(current.educatorId, session);
      }
      await this.repositories.applicationHistory.record({
        applicationId: id,
        educatorId: current.educatorId,
        actorId: principal.userId,
        fromStatus: "under_review",
        toStatus,
        reason: input.reason,
        occurredAt: now,
        session,
      });
      await this.repositories.audit.append({
        actorId: principal.userId,
        action: `educator_application.${toStatus}`,
        targetType: "educator_application",
        targetId: id,
        reason: input.reason,
        securityContext: this.auditContext(principal, metadata),
        occurredAt: now,
        session,
      });
      return updated;
    });
    // Best-effort: a notification failure must never undo or block a recorded decision.
    this.notifyEducatorOfDecision(decided.educatorId, toStatus, input.reason).catch((error) => {
      console.error("application_decision_notification_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    });
    return decided;
  }

  private async notifyEducatorOfDecision(
    educatorId: string,
    decision: EducatorApplicationStatus,
    reason: string,
  ): Promise<void> {
    const educator = await this.repositories.users.findPrincipalById(educatorId);
    if (!educator) return;
    const subject =
      decision === "approved"
        ? "Your IlmSaathi educator application was approved"
        : decision === "rejected"
          ? "An update on your IlmSaathi educator application"
          : "Changes requested on your IlmSaathi educator application";
    const text = `Your educator application status is now: ${decision.replace(/_/g, " ")}.\n\nReviewer note: ${reason}\n\nView details: ${this.config.webUrl}/dashboard`;
    await this.email.send({ to: educator.email, subject, text });
  }

  async listApplicationDocuments(principal: AuthPrincipal, applicationId: string) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    return this.repositories.verificationDocuments.listForApplication(applicationId);
  }

  async issueDocumentAccessToken(
    principal: AuthPrincipal,
    applicationId: string,
    documentId: string,
    metadata: RequestMetadata,
  ) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const document = await this.repositories.verificationDocuments.getById(documentId);
    if (!document || document.applicationId !== applicationId) {
      throw new AppError(404, "document_not_found", "Document not found");
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1_000);
    const secret = deriveDocumentAccessSecret(this.config.auth.auditHmacSecret);
    const token = signDocumentAccessToken(documentId, secret, expiresAt);
    // "Opening a document creates an access audit event" (docs/threat-model.md's document-access
    // audit requirement) — logged at issuance, before any bytes are streamed.
    await this.repositories.audit.append({
      actorId: principal.userId,
      action: "verification_document.access_granted",
      targetType: "verification_document",
      targetId: documentId,
      securityContext: this.auditContext(principal, metadata),
      occurredAt: now,
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async readDocumentForDownload(applicationId: string, documentId: string, token: string) {
    const document = await this.repositories.verificationDocuments.getById(documentId);
    if (!document || document.applicationId !== applicationId) {
      throw new AppError(404, "document_not_found", "Document not found");
    }
    const secret = deriveDocumentAccessSecret(this.config.auth.auditHmacSecret);
    if (!verifyDocumentAccessToken(token, documentId, secret)) {
      throw new AppError(403, "document_access_denied", "This access link is invalid or has expired");
    }
    return {
      stream: this.storage.createReadStream(document.objectKey),
      contentType: document.contentType,
      filename: document.filename,
      sizeBytes: document.sizeBytes,
    };
  }

  async listEducators(principal: AuthPrincipal, input: { cursor?: string; limit: number }) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    return this.repositories.publicEducators.listAll(input, this.repositories.subjects);
  }

  private async setEducatorPublication(
    principal: AuthPrincipal,
    educatorId: string,
    from: "published" | "suspended",
    to: "published" | "suspended",
    auditAction: string,
    input: EducatorSuspensionReasonInput,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    const now = new Date();
    const changed = await this.repositories.publicEducators.setPublicationStatus({
      educatorId,
      from,
      to,
    });
    if (!changed) {
      throw new AppError(409, "educator_state_changed", "This educator's listing already changed");
    }
    await this.repositories.audit.append({
      actorId: principal.userId,
      action: auditAction,
      targetType: "public_educator",
      targetId: educatorId,
      reason: input.reason,
      securityContext: this.auditContext(principal, metadata),
      occurredAt: now,
    });
  }

  suspendEducator(
    principal: AuthPrincipal,
    educatorId: string,
    input: EducatorSuspensionReasonInput,
    metadata: RequestMetadata,
  ) {
    return this.setEducatorPublication(
      principal,
      educatorId,
      "published",
      "suspended",
      "educator.suspended",
      input,
      metadata,
    );
  }

  reinstateEducator(
    principal: AuthPrincipal,
    educatorId: string,
    input: EducatorSuspensionReasonInput,
    metadata: RequestMetadata,
  ) {
    return this.setEducatorPublication(
      principal,
      educatorId,
      "suspended",
      "published",
      "educator.reinstated",
      input,
      metadata,
    );
  }

  async listAuditLog(principal: AuthPrincipal, input: { cursor?: string; limit: number }) {
    assertAdminAal2(principal, this.config.mfa.maxAgeSeconds);
    return this.repositories.audit.list(input);
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
