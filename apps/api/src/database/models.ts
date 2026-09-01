import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  BOOKING_ACTOR_ROLES,
  BOOKING_STATUSES,
  EDUCATOR_APPLICATION_STATUSES,
  LANGUAGES,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  SUBJECT_CATEGORIES,
  USER_ROLES,
  VERIFICATION_DOCUMENT_CONTENT_TYPES,
} from "@learning-platform/shared";

const strictOptions = {
  strict: "throw" as const,
  minimize: false,
  versionKey: false as const,
};

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    roles: {
      type: [{ type: String, enum: USER_ROLES, required: true }],
      required: true,
      validate: {
        validator: (roles: string[]) => roles.length > 0 && new Set(roles).size === roles.length,
        message: "A user must have at least one unique role",
      },
    },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
      required: true,
    },
    mfaTotpEnabled: { type: Boolean, default: false, required: true },
    mfaTotpSecretEncrypted: { type: String, select: false },
    mfaLastUsedCounter: { type: Number, select: false },
    lastLoginAt: { type: Date },
  },
  { ...strictOptions, timestamps: true, collection: "users" },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ roles: 1, accountStatus: 1 });

const authSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refreshTokenHash: { type: String, required: true, select: false },
    csrfTokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokeReason: { type: String, maxlength: 100 },
    mfaVerifiedAt: { type: Date },
    ipHash: { type: String, required: true },
    userAgent: { type: String, maxlength: 500, required: true },
    lastUsedAt: { type: Date, required: true },
  },
  { ...strictOptions, timestamps: true, collection: "auth_sessions" },
);
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1 });

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    displayName: { type: String, maxlength: 80 },
    preferredLanguage: { type: String, enum: LANGUAGES },
    timezone: { type: String, maxlength: 100 },
    // Learners may register at any age. This attestation exists only for adult educators.
    age18AttestedAt: { type: Date },
    onboardingCompletedAt: { type: Date },
    learningGoals: [{ type: String, maxlength: 160 }],
    subjectIds: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
  },
  { ...strictOptions, timestamps: true, collection: "profiles" },
);
profileSchema.index({ userId: 1 }, { unique: true });

const consentEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    documentType: { type: String, enum: ["terms", "privacy"], required: true },
    version: { type: String, required: true, maxlength: 50 },
    purpose: { type: String, required: true, maxlength: 200 },
    action: { type: String, enum: ["accepted", "withdrawn"], required: true },
    occurredAt: { type: Date, required: true },
    ipHash: { type: String, required: true },
  },
  { ...strictOptions, timestamps: false, collection: "consent_events" },
);
consentEventSchema.index({ userId: 1, occurredAt: -1 });

const localizedNamesSchema = new Schema(
  {
    en: { type: String, required: true, maxlength: 100 },
    hi: { type: String, required: true, maxlength: 100 },
    ur: { type: String, required: true, maxlength: 100 },
  },
  { _id: false, strict: "throw" },
);

const subjectSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    category: { type: String, enum: SUBJECT_CATEGORIES, required: true },
    names: { type: localizedNamesSchema, required: true },
    parentSubjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
    active: { type: Boolean, required: true, default: true },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { ...strictOptions, timestamps: true, collection: "subjects" },
);
subjectSchema.index({ slug: 1 }, { unique: true });
subjectSchema.index({ active: 1, sortOrder: 1 });

const subjectClaimSchema = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    qualificationSummary: { type: String, maxlength: 500, default: "" },
    experienceSummary: { type: String, maxlength: 500, default: "" },
    qualificationStatus: {
      type: String,
      enum: ["not_reviewed", "verified", "not_verified"],
      default: "not_reviewed",
      required: true,
    },
    experienceStatus: {
      type: String,
      enum: ["self_declared", "verified", "not_verified"],
      default: "self_declared",
      required: true,
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
    },
  },
  { _id: false, strict: "throw" },
);

const educatorApplicationSchema = new Schema(
  {
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: EDUCATOR_APPLICATION_STATUSES,
      default: "draft",
      required: true,
    },
    biographyDraft: { type: String, required: true, maxlength: 2_000 },
    languages: {
      type: [{ type: String, enum: LANGUAGES, required: true }],
      required: true,
      validate: {
        validator: (languages: string[]) =>
          languages.length > 0 && new Set(languages).size === languages.length,
        message: "Application languages must be non-empty and unique",
      },
    },
    timezone: { type: String, required: true, maxlength: 100 },
    subjectClaims: {
      type: [subjectClaimSchema],
      required: true,
      validate: {
        validator: (claims: Array<{ subjectId: mongoose.Types.ObjectId }>) =>
          claims.length > 0 &&
          new Set(claims.map(({ subjectId }) => subjectId.toString())).size === claims.length,
        message: "Application subject claims must be non-empty and unique",
      },
    },
    submittedAt: { type: Date },
    reviewStartedAt: { type: Date },
    decidedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decisionReason: { type: String, maxlength: 1_000 },
    revision: { type: Number, min: 1, default: 1, required: true },
  },
  { ...strictOptions, timestamps: true, collection: "educator_applications" },
);
educatorApplicationSchema.index({ educatorId: 1 }, { unique: true });
educatorApplicationSchema.index({ status: 1, _id: 1 });

const educatorApplicationHistorySchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "EducatorApplication",
      required: true,
    },
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fromStatus: { type: String, enum: EDUCATOR_APPLICATION_STATUSES, required: true },
    toStatus: { type: String, enum: EDUCATOR_APPLICATION_STATUSES, required: true },
    reason: { type: String, maxlength: 1_000 },
    occurredAt: { type: Date, required: true },
  },
  { ...strictOptions, timestamps: false, collection: "educator_application_history" },
);
educatorApplicationHistorySchema.index({ applicationId: 1, occurredAt: 1 });

const publicEducatorSchema = new Schema(
  {
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "EducatorApplication",
      required: true,
    },
    displayName: { type: String, required: true, maxlength: 80 },
    biography: { type: String, required: true, maxlength: 2_000 },
    languages: {
      type: [{ type: String, enum: LANGUAGES, required: true }],
      required: true,
      validate: {
        validator: (languages: string[]) =>
          languages.length > 0 && new Set(languages).size === languages.length,
        message: "Published languages must be non-empty and unique",
      },
    },
    subjectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Subject", required: true }],
      required: true,
      validate: {
        validator: (ids: mongoose.Types.ObjectId[]) =>
          ids.length > 0 && new Set(ids.map(String)).size === ids.length,
        message: "Published subjects must be non-empty and unique",
      },
    },
    publicationStatus: {
      type: String,
      enum: ["published", "unpublished", "suspended"],
      required: true,
    },
    approvedAt: { type: Date, required: true },
  },
  { ...strictOptions, timestamps: true, collection: "public_educators" },
);
publicEducatorSchema.index({ educatorId: 1 }, { unique: true });
publicEducatorSchema.index({ applicationId: 1 }, { unique: true });
// MongoDB cannot build one compound index across two independent array fields. Keep the
// subject/language access paths separate so production index creation never fails with
// "cannot index parallel arrays".
publicEducatorSchema.index({ publicationStatus: 1, subjectIds: 1, _id: 1 });
publicEducatorSchema.index({ publicationStatus: 1, languages: 1, _id: 1 });

const adminAuditEventSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true, maxlength: 120 },
    targetType: { type: String, required: true, maxlength: 80 },
    targetId: { type: String, required: true, maxlength: 120 },
    reason: { type: String, maxlength: 1_000 },
    securityContext: {
      ipHash: { type: String, required: true },
      userAgent: { type: String, required: true, maxlength: 500 },
      sessionId: { type: String, maxlength: 120 },
      aal: { type: Number, enum: [1, 2], required: true },
    },
    occurredAt: { type: Date, required: true },
  },
  { ...strictOptions, timestamps: false, collection: "admin_audit_events" },
);
adminAuditEventSchema.index({ actorId: 1, occurredAt: -1 });
adminAuditEventSchema.index({ targetType: 1, targetId: 1, occurredAt: -1 });

const bookingRequestSchema = new Schema(
  {
    learnerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "requested",
      required: true,
    },
    startAt: { type: Date, required: true },
    // Fixed lesson length for the pilot; always server-set, never trusts client input.
    durationMinutes: { type: Number, required: true, default: 50, min: 1 },
    timezone: { type: String, required: true, maxlength: 100 },
    message: { type: String, maxlength: 500, default: "" },
    meetingLink: { type: String, maxlength: 500 },
    declineReason: { type: String, maxlength: 500 },
    cancelReason: { type: String, maxlength: 500 },
    cancelledBy: { type: String, enum: BOOKING_ACTOR_ROLES },
    decidedAt: { type: Date },
    completedAt: { type: Date },
  },
  { ...strictOptions, timestamps: true, collection: "booking_requests" },
);
bookingRequestSchema.index({ learnerId: 1, _id: 1 });
bookingRequestSchema.index({ educatorId: 1, status: 1, _id: 1 });

const bookingStatusHistorySchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "BookingRequest", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, enum: BOOKING_ACTOR_ROLES, required: true },
    fromStatus: { type: String, enum: BOOKING_STATUSES, required: true },
    toStatus: { type: String, enum: BOOKING_STATUSES, required: true },
    reason: { type: String, maxlength: 500 },
    occurredAt: { type: Date, required: true },
  },
  { ...strictOptions, timestamps: false, collection: "booking_status_history" },
);
bookingStatusHistorySchema.index({ bookingId: 1, occurredAt: 1 });

const verificationDocumentSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "EducatorApplication",
      required: true,
    },
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    objectKey: { type: String, required: true, maxlength: 100 },
    originalFilename: { type: String, required: true, maxlength: 200 },
    contentType: {
      type: String,
      enum: VERIFICATION_DOCUMENT_CONTENT_TYPES,
      required: true,
    },
    sizeBytes: { type: Number, required: true, min: 1 },
  },
  { ...strictOptions, timestamps: true, collection: "verification_documents" },
);
verificationDocumentSchema.index({ applicationId: 1, _id: 1 });
verificationDocumentSchema.index({ objectKey: 1 }, { unique: true });

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, enum: REPORT_CATEGORIES, required: true },
    description: { type: String, required: true, maxlength: 1_000 },
    relatedBookingId: { type: Schema.Types.ObjectId, ref: "BookingRequest" },
    status: { type: String, enum: REPORT_STATUSES, default: "open", required: true },
    assignedAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    resolutionReason: { type: String, maxlength: 1_000 },
    resolvedAt: { type: Date },
  },
  { ...strictOptions, timestamps: true, collection: "reports" },
);
reportSchema.index({ status: 1, _id: 1 });
reportSchema.index({ reportedUserId: 1, _id: 1 });

const blockSchema = new Schema(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { ...strictOptions, timestamps: true, collection: "blocks" },
);
blockSchema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });

function existingOrCreate<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export type UserRecord = InferSchemaType<typeof userSchema>;
export type AuthSessionRecord = InferSchemaType<typeof authSessionSchema>;
export type ProfileRecord = InferSchemaType<typeof profileSchema>;
export type ConsentEventRecord = InferSchemaType<typeof consentEventSchema>;
export type SubjectRecord = InferSchemaType<typeof subjectSchema>;
export type EducatorApplicationRecord = InferSchemaType<typeof educatorApplicationSchema>;
export type EducatorApplicationHistoryRecord = InferSchemaType<
  typeof educatorApplicationHistorySchema
>;
export type PublicEducatorRecord = InferSchemaType<typeof publicEducatorSchema>;
export type AdminAuditEventRecord = InferSchemaType<typeof adminAuditEventSchema>;
export type BookingRequestRecord = InferSchemaType<typeof bookingRequestSchema>;
export type BookingStatusHistoryRecord = InferSchemaType<typeof bookingStatusHistorySchema>;
export type VerificationDocumentRecord = InferSchemaType<typeof verificationDocumentSchema>;
export type ReportRecord = InferSchemaType<typeof reportSchema>;
export type BlockRecord = InferSchemaType<typeof blockSchema>;

export const UserModel = existingOrCreate<UserRecord>("User", userSchema);
export const AuthSessionModel = existingOrCreate<AuthSessionRecord>(
  "AuthSession",
  authSessionSchema,
);
export const ProfileModel = existingOrCreate<ProfileRecord>("Profile", profileSchema);
export const ConsentEventModel = existingOrCreate<ConsentEventRecord>(
  "ConsentEvent",
  consentEventSchema,
);
export const SubjectModel = existingOrCreate<SubjectRecord>("Subject", subjectSchema);
export const EducatorApplicationModel = existingOrCreate<EducatorApplicationRecord>(
  "EducatorApplication",
  educatorApplicationSchema,
);
export const EducatorApplicationHistoryModel =
  existingOrCreate<EducatorApplicationHistoryRecord>(
  "EducatorApplicationHistory",
  educatorApplicationHistorySchema,
  );
export const PublicEducatorModel = existingOrCreate<PublicEducatorRecord>(
  "PublicEducator",
  publicEducatorSchema,
);
export const AdminAuditEventModel = existingOrCreate<AdminAuditEventRecord>(
  "AdminAuditEvent",
  adminAuditEventSchema,
);
export const BookingRequestModel = existingOrCreate<BookingRequestRecord>(
  "BookingRequest",
  bookingRequestSchema,
);
export const BookingStatusHistoryModel = existingOrCreate<BookingStatusHistoryRecord>(
  "BookingStatusHistory",
  bookingStatusHistorySchema,
);
export const VerificationDocumentModel = existingOrCreate<VerificationDocumentRecord>(
  "VerificationDocument",
  verificationDocumentSchema,
);
export const ReportModel = existingOrCreate<ReportRecord>("Report", reportSchema);
export const BlockModel = existingOrCreate<BlockRecord>("Block", blockSchema);
