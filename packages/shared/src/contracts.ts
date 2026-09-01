import { z } from "zod";

export const USER_ROLES = ["learner", "educator", "moderator", "admin"] as const;
export const PUBLIC_REGISTRATION_ROLES = ["learner", "educator"] as const;
export const LANGUAGES = ["en", "hi", "ur"] as const;
export const EDUCATOR_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
] as const;
export const SUBJECT_CATEGORIES = ["islamic", "academic", "practical"] as const;
export const BOOKING_STATUSES = [
  "requested",
  "accepted",
  "declined",
  "cancelled",
  "completed",
] as const;
export const BOOKING_ACTOR_ROLES = ["learner", "educator"] as const;
export const VERIFICATION_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export const REPORT_CATEGORIES = [
  "safety_concern",
  "harassment",
  "inappropriate_content",
  "other",
] as const;
export const REPORT_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;
export const PUBLICATION_STATUSES = ["published", "unpublished", "suspended"] as const;

export const userRoleSchema = z.enum(USER_ROLES);
export const publicRegistrationRoleSchema = z.enum(PUBLIC_REGISTRATION_ROLES);
export const languageSchema = z.enum(LANGUAGES);
export const educatorApplicationStatusSchema = z.enum(EDUCATOR_APPLICATION_STATUSES);
export const subjectCategorySchema = z.enum(SUBJECT_CATEGORIES);
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export const verificationDocumentContentTypeSchema = z.enum(VERIFICATION_DOCUMENT_CONTENT_TYPES);
export const bookingActorRoleSchema = z.enum(BOOKING_ACTOR_ROLES);
export const reportCategorySchema = z.enum(REPORT_CATEGORIES);
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

export type UserRole = z.infer<typeof userRoleSchema>;
export type PublicRegistrationRole = z.infer<typeof publicRegistrationRoleSchema>;
export type Language = z.infer<typeof languageSchema>;
export type EducatorApplicationStatus = z.infer<typeof educatorApplicationStatusSchema>;
export type SubjectCategory = z.infer<typeof subjectCategorySchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingActorRole = z.infer<typeof bookingActorRoleSchema>;
export type VerificationDocumentContentType = z.infer<typeof verificationDocumentContentTypeSchema>;
export type ReportCategory = z.infer<typeof reportCategorySchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;

const cleanSingleLine = (value: string) => value.replace(/\s+/g, " ").trim();
const cleanMultiline = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .trim();

const cleanSingleLineSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .transform(cleanSingleLine)
    .pipe(z.string().min(minimum).max(maximum));

const cleanMultilineSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().min(minimum).max(maximum));

const bcryptInputSchema = z.string().refine(
  (value) => new TextEncoder().encode(value).byteLength <= 72,
  { message: "Password must be at most 72 UTF-8 bytes" },
);

export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128)
  .and(bcryptInputSchema)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "Password must contain a letter and a number",
  });

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: "Unknown IANA timezone" },
  );

export const versionSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid document version");

const registrationBaseShape = {
  email: emailSchema,
  password: passwordSchema,
  termsVersion: versionSchema,
  privacyVersion: versionSchema,
};

export const registrationSchema = z.discriminatedUnion("role", [
  z
    .object({
      ...registrationBaseShape,
      role: z.literal("learner"),
    })
    .strict(),
  z
    .object({
      ...registrationBaseShape,
      role: z.literal("educator"),
      age18Confirmed: z.literal(true, {
        errorMap: () => ({ message: "Educators must confirm that they are at least 18" }),
      }),
    })
    .strict(),
]);

export const loginSchema = z
  .object({
    email: emailSchema,
    // Enforce bcrypt's byte boundary during login too. Without this, a value with the
    // same first 72 bytes as a real password could authenticate after silent truncation.
    password: bcryptInputSchema.and(z.string().min(1).max(128)),
  })
  .strict();

export const totpChallengeSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Enter a six-digit authentication code"),
  })
  .strict();

export const onboardingSchema = z
  .object({
    displayName: cleanSingleLineSchema(2, 80),
    preferredLanguage: languageSchema,
    timezone: timezoneSchema,
    learningGoals: z
      .array(cleanSingleLineSchema(2, 160))
      .max(8)
      .default([]),
    subjectIds: z.array(objectIdSchema).max(12).default([]),
  })
  .strict()
  .superRefine(({ subjectIds }, context) => {
    if (new Set(subjectIds).size !== subjectIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectIds"],
        message: "Subject selections must be unique",
      });
    }
  });

export const educatorSubjectClaimSchema = z
  .object({
    subjectId: objectIdSchema,
    qualificationSummary: cleanMultilineSchema(0, 500).default(""),
    experienceSummary: cleanMultilineSchema(0, 500).default(""),
  })
  .strict();

export const educatorApplicationDraftSchema = z
  .object({
    biography: cleanMultilineSchema(100, 2_000),
    languages: z.array(languageSchema).min(1).max(3),
    timezone: timezoneSchema,
    subjectClaims: z.array(educatorSubjectClaimSchema).min(1).max(8),
  })
  .strict()
  .superRefine(({ languages, subjectClaims }, context) => {
    if (new Set(languages).size !== languages.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["languages"],
        message: "Languages must be unique",
      });
    }
    const subjectIds = subjectClaims.map(({ subjectId }) => subjectId);
    if (new Set(subjectIds).size !== subjectIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectClaims"],
        message: "Each subject may be selected only once",
      });
    }
  });

export const adminApplicationDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject", "request_changes"]),
    reason: cleanMultilineSchema(10, 1_000),
  })
  .strict();

export const adminApplicationListQuerySchema = z
  .object({
    status: educatorApplicationStatusSchema.optional(),
    cursor: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const publicEducatorListQuerySchema = z
  .object({
    subjectId: objectIdSchema.optional(),
    language: languageSchema.optional(),
    cursor: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(30).default(12),
  })
  .strict();

export const bookingCreateSchema = z
  .object({
    educatorId: objectIdSchema,
    subjectId: objectIdSchema,
    startAt: z.string().datetime(),
    timezone: timezoneSchema,
    message: cleanMultilineSchema(0, 500).default(""),
  })
  .strict()
  .superRefine(({ startAt }, context) => {
    const startMs = Date.parse(startAt);
    if (Number.isNaN(startMs)) return;
    if (startMs - Date.now() < 60 * 60 * 1_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: "Choose a time at least one hour from now",
      });
    }
  });

export const bookingAcceptSchema = z
  .object({
    meetingLink: z.string().trim().url().max(500),
  })
  .strict();

export const bookingDeclineSchema = z
  .object({
    reason: cleanMultilineSchema(10, 500),
  })
  .strict();

export const bookingCancelSchema = z
  .object({
    reason: cleanMultilineSchema(10, 500),
  })
  .strict();

export const bookingListQuerySchema = z
  .object({
    status: bookingStatusSchema.optional(),
    cursor: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const bookingRequestDtoSchema = z
  .object({
    id: objectIdSchema,
    status: bookingStatusSchema,
    educatorId: objectIdSchema,
    educatorName: z.string(),
    learnerId: objectIdSchema,
    learnerName: z.string(),
    subjectId: objectIdSchema,
    subjectName: z.string(),
    startAt: z.string().datetime(),
    durationMinutes: z.number().int().positive(),
    timezone: z.string(),
    message: z.string(),
    meetingLink: z.string().nullable(),
    declineReason: z.string().nullable(),
    cancelReason: z.string().nullable(),
    cancelledBy: bookingActorRoleSchema.nullable(),
    createdAt: z.string().datetime(),
    decidedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();

export const verificationDocumentDtoSchema = z
  .object({
    id: objectIdSchema,
    filename: z.string(),
    contentType: verificationDocumentContentTypeSchema,
    sizeBytes: z.number().int().positive(),
    uploadedAt: z.string().datetime(),
  })
  .strict();

export const documentAccessTokenDtoSchema = z
  .object({
    token: z.string(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const reportCreateSchema = z
  .object({
    reportedUserId: objectIdSchema,
    category: reportCategorySchema,
    description: cleanMultilineSchema(10, 1_000),
    relatedBookingId: objectIdSchema.optional(),
  })
  .strict();

export const reportResolveSchema = z
  .object({
    reason: cleanMultilineSchema(10, 1_000),
    suspendUser: z.boolean().default(false),
  })
  .strict();

export const reportDismissSchema = z
  .object({
    reason: cleanMultilineSchema(10, 1_000),
  })
  .strict();

export const reportListQuerySchema = z
  .object({
    status: reportStatusSchema.optional(),
    cursor: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const reportDtoSchema = z
  .object({
    id: objectIdSchema,
    status: reportStatusSchema,
    category: reportCategorySchema,
    description: z.string(),
    reporterId: objectIdSchema,
    reporterEmail: z.string(),
    reportedUserId: objectIdSchema,
    reportedUserEmail: z.string(),
    relatedBookingId: objectIdSchema.nullable(),
    assignedAdminId: objectIdSchema.nullable(),
    resolutionReason: z.string().nullable(),
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
  })
  .strict();

export const blockCreateSchema = z
  .object({
    blockedUserId: objectIdSchema,
  })
  .strict();

export const blockDtoSchema = z
  .object({
    id: objectIdSchema,
    blockedUserId: objectIdSchema,
    blockedUserEmail: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const educatorSuspensionReasonSchema = z
  .object({
    reason: cleanMultilineSchema(10, 1_000),
  })
  .strict();

export const auditLogQuerySchema = z
  .object({
    cursor: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const auditLogEntryDtoSchema = z
  .object({
    id: objectIdSchema,
    actorEmail: z.string(),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    reason: z.string().nullable(),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const subjectDtoSchema = z
  .object({
    id: objectIdSchema,
    slug: z.string().min(1).max(80),
    category: subjectCategorySchema,
    names: z
      .object({
        en: z.string().min(1).max(100),
        hi: z.string().min(1).max(100),
        ur: z.string().min(1).max(100),
      })
      .strict(),
  })
  .strict();

export const profileDtoSchema = z
  .object({
    displayName: z.string().nullable(),
    preferredLanguage: languageSchema.nullable(),
    timezone: z.string().nullable(),
    age18AttestedAt: z.string().datetime().nullable(),
    onboardingCompletedAt: z.string().datetime().nullable(),
    learningGoals: z.array(z.string()),
    subjectIds: z.array(objectIdSchema),
  })
  .strict();

export const currentUserDtoSchema = z
  .object({
    id: objectIdSchema,
    email: emailSchema,
    displayName: z.string(),
    roles: z.array(userRoleSchema).min(1),
    preferredLanguage: languageSchema.optional(),
    onboardingComplete: z.boolean(),
    mfaVerified: z.boolean(),
  })
  .strict();

export const educatorApplicationDtoSchema = z
  .object({
    id: objectIdSchema,
    educatorId: objectIdSchema,
    status: educatorApplicationStatusSchema,
    biography: z.string(),
    languages: z.array(languageSchema),
    timezone: z.string(),
    subjectClaims: z.array(
      z
        .object({
          subjectId: objectIdSchema,
          qualificationSummary: z.string(),
          experienceSummary: z.string(),
          qualificationStatus: z.enum(["not_reviewed", "verified", "not_verified"]),
          experienceStatus: z.enum(["self_declared", "verified", "not_verified"]),
          approvalStatus: z.enum(["pending", "approved", "rejected"]),
        })
        .strict(),
    ),
    submittedAt: z.string().datetime().nullable(),
    reviewStartedAt: z.string().datetime().nullable(),
    decidedAt: z.string().datetime().nullable(),
    decisionReason: z.string().nullable(),
    revision: z.number().int().min(1),
  })
  .strict();

export const publicEducatorDtoSchema = z
  .object({
    id: objectIdSchema,
    educatorId: objectIdSchema,
    displayName: z.string(),
    biography: z.string(),
    languages: z.array(languageSchema),
    subjects: z.array(subjectDtoSchema),
    approvedAt: z.string().datetime(),
  })
  .strict();

export const adminEducatorListQuerySchema = z
  .object({
    cursor: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const adminEducatorDtoSchema = z
  .object({
    id: objectIdSchema,
    educatorId: objectIdSchema,
    displayName: z.string(),
    email: z.string(),
    languages: z.array(languageSchema),
    subjects: z.array(subjectDtoSchema),
    publicationStatus: publicationStatusSchema,
    approvedAt: z.string().datetime(),
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type EducatorApplicationDraftInput = z.infer<
  typeof educatorApplicationDraftSchema
>;
export type AdminApplicationDecisionInput = z.infer<
  typeof adminApplicationDecisionSchema
>;
export type SubjectDto = z.infer<typeof subjectDtoSchema>;
export type PublicEducatorDto = z.infer<typeof publicEducatorDtoSchema>;
export type ProfileDto = z.infer<typeof profileDtoSchema>;
export type CurrentUserDto = z.infer<typeof currentUserDtoSchema>;
export type EducatorApplicationDto = z.infer<typeof educatorApplicationDtoSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type BookingAcceptInput = z.infer<typeof bookingAcceptSchema>;
export type BookingDeclineInput = z.infer<typeof bookingDeclineSchema>;
export type BookingCancelInput = z.infer<typeof bookingCancelSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type BookingRequestDto = z.infer<typeof bookingRequestDtoSchema>;
export type VerificationDocumentDto = z.infer<typeof verificationDocumentDtoSchema>;
export type DocumentAccessTokenDto = z.infer<typeof documentAccessTokenDtoSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportResolveInput = z.infer<typeof reportResolveSchema>;
export type ReportDismissInput = z.infer<typeof reportDismissSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
export type ReportDto = z.infer<typeof reportDtoSchema>;
export type BlockCreateInput = z.infer<typeof blockCreateSchema>;
export type BlockDto = z.infer<typeof blockDtoSchema>;
export type AdminEducatorListQuery = z.infer<typeof adminEducatorListQuerySchema>;
export type AdminEducatorDto = z.infer<typeof adminEducatorDtoSchema>;
export type EducatorSuspensionReasonInput = z.infer<typeof educatorSuspensionReasonSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditLogEntryDto = z.infer<typeof auditLogEntryDtoSchema>;
