import type {
  AdminApplicationDecisionInput,
  AdminEducatorDto,
  AuditLogEntryDto,
  BlockCreateInput,
  BlockDto,
  BookingAcceptInput,
  BookingCancelInput,
  BookingCreateInput,
  BookingDeclineInput,
  BookingRequestDto,
  BookingStatus,
  CurrentUserDto,
  DocumentAccessTokenDto,
  EducatorApplicationDto,
  EducatorApplicationDraftInput,
  EducatorApplicationStatus,
  EducatorSuspensionReasonInput,
  Language,
  LoginInput,
  OnboardingInput,
  ProfileDto,
  PublicEducatorDto,
  RegistrationInput,
  ReportCreateInput,
  ReportDismissInput,
  ReportDto,
  ReportResolveInput,
  ReportStatus,
  SubjectDto,
  VerificationDocumentDto,
} from "@learning-platform/shared";
import type { ReadStream } from "node:fs";
import type { AuthPrincipal } from "../core/authorization.js";

export interface RequestMetadata {
  ipAddress: string;
  userAgent: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshCookieValue: string;
  csrfToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

export interface AccessTokenRenewal {
  accessToken: string;
  accessMaxAgeMs: number;
}

export interface AuthResponse {
  user: CurrentUserDto;
  mfaRequired: boolean;
  tokens: SessionTokens;
}

export interface AuthServiceContract {
  register(input: RegistrationInput, metadata: RequestMetadata): Promise<AuthResponse>;
  login(input: LoginInput, metadata: RequestMetadata): Promise<AuthResponse>;
  refresh(
    refreshCookieValue: string | undefined,
    csrfToken: string,
    metadata: RequestMetadata,
  ): Promise<AuthResponse>;
  logout(refreshCookieValue: string | undefined, csrfToken: string): Promise<void>;
  authenticateAccess(accessToken: string, csrfToken?: string): Promise<AuthPrincipal>;
  getMe(principal: AuthPrincipal): Promise<CurrentUserDto>;
  verifyAdminTotp(
    principal: AuthPrincipal,
    code: string,
    metadata: RequestMetadata,
  ): Promise<AccessTokenRenewal & { user: CurrentUserDto }>;
}

export interface ProfileServiceContract {
  getOwn(principal: AuthPrincipal): Promise<ProfileDto>;
  completeOnboarding(principal: AuthPrincipal, input: OnboardingInput): Promise<ProfileDto>;
}

export interface SubjectServiceContract {
  listActive(): Promise<SubjectDto[]>;
}

export interface EducatorServiceContract {
  getOwnApplication(principal: AuthPrincipal): Promise<EducatorApplicationDto | null>;
  saveDraft(
    principal: AuthPrincipal,
    input: EducatorApplicationDraftInput,
  ): Promise<EducatorApplicationDto>;
  submit(principal: AuthPrincipal): Promise<EducatorApplicationDto>;
  listPublic(input: {
    subjectId?: string;
    language?: Language;
    cursor?: string;
    limit: number;
  }): Promise<{ items: PublicEducatorDto[]; nextCursor: string | null }>;
  uploadDocument(
    principal: AuthPrincipal,
    input: { buffer: Buffer; filename: string; declaredContentType: string },
  ): Promise<VerificationDocumentDto>;
  listMyDocuments(principal: AuthPrincipal): Promise<VerificationDocumentDto[]>;
  deleteMyDocument(principal: AuthPrincipal, documentId: string): Promise<void>;
}

export interface AdminServiceContract {
  listApplications(
    principal: AuthPrincipal,
    input: { status?: EducatorApplicationStatus; cursor?: string; limit: number },
  ): Promise<{ items: EducatorApplicationDto[]; nextCursor: string | null }>;
  getApplication(principal: AuthPrincipal, id: string): Promise<EducatorApplicationDto>;
  startReview(
    principal: AuthPrincipal,
    id: string,
    metadata: RequestMetadata,
  ): Promise<EducatorApplicationDto>;
  decide(
    principal: AuthPrincipal,
    id: string,
    input: AdminApplicationDecisionInput,
    metadata: RequestMetadata,
  ): Promise<EducatorApplicationDto>;
  listApplicationDocuments(
    principal: AuthPrincipal,
    applicationId: string,
  ): Promise<VerificationDocumentDto[]>;
  issueDocumentAccessToken(
    principal: AuthPrincipal,
    applicationId: string,
    documentId: string,
    metadata: RequestMetadata,
  ): Promise<DocumentAccessTokenDto>;
  readDocumentForDownload(
    applicationId: string,
    documentId: string,
    token: string,
  ): Promise<{ stream: ReadStream; contentType: string; filename: string; sizeBytes: number }>;
  listEducators(
    principal: AuthPrincipal,
    input: { cursor?: string; limit: number },
  ): Promise<{ items: AdminEducatorDto[]; nextCursor: string | null }>;
  suspendEducator(
    principal: AuthPrincipal,
    educatorId: string,
    input: EducatorSuspensionReasonInput,
    metadata: RequestMetadata,
  ): Promise<void>;
  reinstateEducator(
    principal: AuthPrincipal,
    educatorId: string,
    input: EducatorSuspensionReasonInput,
    metadata: RequestMetadata,
  ): Promise<void>;
  listAuditLog(
    principal: AuthPrincipal,
    input: { cursor?: string; limit: number },
  ): Promise<{ items: AuditLogEntryDto[]; nextCursor: string | null }>;
}

export interface ModerationServiceContract {
  fileReport(principal: AuthPrincipal, input: ReportCreateInput): Promise<ReportDto>;
  blockUser(principal: AuthPrincipal, input: BlockCreateInput): Promise<BlockDto>;
  unblockUser(principal: AuthPrincipal, blockId: string): Promise<void>;
  listMyBlocks(principal: AuthPrincipal): Promise<BlockDto[]>;
  listReports(
    principal: AuthPrincipal,
    input: { status?: ReportStatus; cursor?: string; limit: number },
  ): Promise<{ items: ReportDto[]; nextCursor: string | null }>;
  getReport(principal: AuthPrincipal, id: string): Promise<ReportDto>;
  assignReport(principal: AuthPrincipal, id: string, metadata: RequestMetadata): Promise<ReportDto>;
  resolveReport(
    principal: AuthPrincipal,
    id: string,
    input: ReportResolveInput,
    metadata: RequestMetadata,
  ): Promise<ReportDto>;
  dismissReport(
    principal: AuthPrincipal,
    id: string,
    input: ReportDismissInput,
    metadata: RequestMetadata,
  ): Promise<ReportDto>;
}

export interface BookingServiceContract {
  requestClass(principal: AuthPrincipal, input: BookingCreateInput): Promise<BookingRequestDto>;
  listMine(
    principal: AuthPrincipal,
    input: { status?: BookingStatus; cursor?: string; limit: number },
  ): Promise<{ items: BookingRequestDto[]; nextCursor: string | null }>;
  listReceived(
    principal: AuthPrincipal,
    input: { status?: BookingStatus; cursor?: string; limit: number },
  ): Promise<{ items: BookingRequestDto[]; nextCursor: string | null }>;
  accept(
    principal: AuthPrincipal,
    id: string,
    input: BookingAcceptInput,
  ): Promise<BookingRequestDto>;
  decline(
    principal: AuthPrincipal,
    id: string,
    input: BookingDeclineInput,
  ): Promise<BookingRequestDto>;
  cancel(
    principal: AuthPrincipal,
    id: string,
    input: BookingCancelInput,
  ): Promise<BookingRequestDto>;
  complete(principal: AuthPrincipal, id: string): Promise<BookingRequestDto>;
}

export interface ApiServices {
  auth: AuthServiceContract;
  profiles: ProfileServiceContract;
  subjects: SubjectServiceContract;
  educators: EducatorServiceContract;
  admin: AdminServiceContract;
  bookings: BookingServiceContract;
  moderation: ModerationServiceContract;
}
