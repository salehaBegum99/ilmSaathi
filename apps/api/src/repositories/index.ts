import mongoose, { type ClientSession, Types } from "mongoose";
import type {
  AdminEducatorDto,
  AuditLogEntryDto,
  BlockDto,
  BookingActorRole,
  BookingRequestDto,
  BookingStatus,
  EducatorApplicationDto as SharedApplicationDto,
  EducatorApplicationDraftInput,
  EducatorApplicationStatus,
  Language,
  ProfileDto as SharedProfileDto,
  PublicationStatus,
  PublicEducatorDto,
  ReportCategory,
  ReportDto,
  ReportStatus,
  SubjectDto,
  UserRole,
  VerificationDocumentDto,
} from "@learning-platform/shared";
import {
  AdminAuditEventModel,
  AuthSessionModel,
  type BlockRecord,
  BlockModel,
  type BookingRequestRecord,
  BookingRequestModel,
  BookingStatusHistoryModel,
  ConsentEventModel,
  type EducatorApplicationRecord,
  EducatorApplicationHistoryModel,
  EducatorApplicationModel,
  ProfileModel,
  PublicEducatorModel,
  type ReportRecord,
  ReportModel,
  SubjectModel,
  UserModel,
  VerificationDocumentModel,
} from "../database/models.js";

const objectId = (value: string) => new Types.ObjectId(value);

export type ApplicationDto = SharedApplicationDto;
export type ProfileDto = SharedProfileDto;

export interface UserAuthRecord {
  id: string;
  email: string;
  passwordHash: string;
  roles: UserRole[];
  accountStatus: "active" | "suspended" | "deleted";
  mfaTotpEnabled: boolean;
}

export interface UserPrincipalRecord {
  id: string;
  email: string;
  roles: UserRole[];
  accountStatus: "active" | "suspended" | "deleted";
  mfaTotpEnabled: boolean;
}

export interface UserMfaRecord extends UserPrincipalRecord {
  encryptedSecret: string | null;
  lastUsedCounter: number | null;
}

export class UserRepository {
  async create(
    input: { email: string; passwordHash: string; roles: UserRole[] },
    session?: ClientSession,
  ): Promise<UserPrincipalRecord> {
    const [created] = await UserModel.create(
      [input],
      session ? { session } : {},
    );
    if (!created) throw new Error("User creation returned no record");
    return {
      id: created._id.toString(),
      email: created.email,
      roles: [...created.roles] as UserRole[],
      accountStatus: created.accountStatus,
      mfaTotpEnabled: created.mfaTotpEnabled,
    };
  }

  async findByEmailForLogin(email: string): Promise<UserAuthRecord | null> {
    const record = await UserModel.findOne({ email })
      .select("+passwordHash")
      .lean()
      .exec();
    if (!record) return null;
    return {
      id: record._id.toString(),
      email: record.email,
      passwordHash: record.passwordHash,
      roles: [...record.roles] as UserRole[],
      accountStatus: record.accountStatus,
      mfaTotpEnabled: record.mfaTotpEnabled,
    };
  }

  async findPrincipalById(id: string): Promise<UserPrincipalRecord | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await UserModel.findById(id)
      .select("email roles accountStatus mfaTotpEnabled")
      .lean()
      .exec();
    if (!record) return null;
    return {
      id: record._id.toString(),
      email: record.email,
      roles: [...record.roles] as UserRole[],
      accountStatus: record.accountStatus,
      mfaTotpEnabled: record.mfaTotpEnabled,
    };
  }

  async findMfaById(id: string): Promise<UserMfaRecord | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await UserModel.findById(id)
      .select("email roles accountStatus mfaTotpEnabled +mfaTotpSecretEncrypted +mfaLastUsedCounter")
      .lean()
      .exec();
    if (!record) return null;
    return {
      id: record._id.toString(),
      email: record.email,
      roles: [...record.roles] as UserRole[],
      accountStatus: record.accountStatus,
      mfaTotpEnabled: record.mfaTotpEnabled,
      encryptedSecret: record.mfaTotpSecretEncrypted ?? null,
      lastUsedCounter: record.mfaLastUsedCounter ?? null,
    };
  }

  async recordTotpUse(
    userId: string,
    counter: number,
    session?: ClientSession,
  ): Promise<boolean> {
    const result = await UserModel.updateOne(
      {
        _id: objectId(userId),
        $or: [
          { mfaLastUsedCounter: { $exists: false } },
          { mfaLastUsedCounter: { $lt: counter } },
        ],
      },
      { $set: { mfaLastUsedCounter: counter } },
      session ? { session } : {},
    ).exec();
    return result.modifiedCount === 1;
  }

  async recordLogin(userId: string, at: Date, session?: ClientSession): Promise<void> {
    await UserModel.updateOne(
      { _id: objectId(userId) },
      { $set: { lastLoginAt: at } },
      session ? { session } : {},
    ).exec();
  }

  async setAccountStatus(
    userId: string,
    status: "active" | "suspended" | "deleted",
    session?: ClientSession,
  ): Promise<void> {
    await UserModel.updateOne(
      { _id: objectId(userId) },
      { $set: { accountStatus: status } },
      session ? { session } : {},
    ).exec();
  }

  async findEmailById(userId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(userId)) return null;
    const record = await UserModel.findById(userId).select("email").lean().exec();
    return record?.email ?? null;
  }

  async listEmailsByRole(role: UserRole): Promise<string[]> {
    const records = await UserModel.find({ roles: role, accountStatus: "active" })
      .select("email")
      .lean()
      .exec();
    return records.map((record) => record.email);
  }

  async findByEmail(email: string): Promise<UserPrincipalRecord | null> {
    const record = await UserModel.findOne({ email }).lean().exec();
    if (!record) return null;
    return {
      id: record._id.toString(),
      email: record.email,
      roles: [...record.roles] as UserRole[],
      accountStatus: record.accountStatus,
      mfaTotpEnabled: record.mfaTotpEnabled,
    };
  }

  async createAdmin(input: {
    email: string;
    passwordHash: string;
    encryptedTotpSecret: string;
  }): Promise<UserPrincipalRecord> {
    const created = await UserModel.create({
      email: input.email,
      passwordHash: input.passwordHash,
      roles: ["admin"],
      mfaTotpEnabled: true,
      mfaTotpSecretEncrypted: input.encryptedTotpSecret,
    });
    return {
      id: created._id.toString(),
      email: created.email,
      roles: [...created.roles] as UserRole[],
      accountStatus: created.accountStatus,
      mfaTotpEnabled: created.mfaTotpEnabled,
    };
  }
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  mfaVerifiedAt: Date | null;
  csrfTokenHash?: string;
  refreshTokenHash?: string;
}

function mapSession(record: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  expiresAt: Date;
  revokedAt?: Date | null;
  mfaVerifiedAt?: Date | null;
  csrfTokenHash?: string;
  refreshTokenHash?: string;
}): SessionRecord {
  return {
    id: record._id.toString(),
    userId: record.userId.toString(),
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt ?? null,
    mfaVerifiedAt: record.mfaVerifiedAt ?? null,
    ...(record.csrfTokenHash ? { csrfTokenHash: record.csrfTokenHash } : {}),
    ...(record.refreshTokenHash ? { refreshTokenHash: record.refreshTokenHash } : {}),
  };
}

export class SessionRepository {
  async create(input: {
    userId: string;
    refreshTokenHash: string;
    csrfTokenHash: string;
    expiresAt: Date;
    ipHash: string;
    userAgent: string;
    now: Date;
    session?: ClientSession;
  }): Promise<SessionRecord> {
    const [created] = await AuthSessionModel.create(
      [
        {
          userId: objectId(input.userId),
          refreshTokenHash: input.refreshTokenHash,
          csrfTokenHash: input.csrfTokenHash,
          expiresAt: input.expiresAt,
          ipHash: input.ipHash,
          userAgent: input.userAgent,
          lastUsedAt: input.now,
        },
      ],
      input.session ? { session: input.session } : {},
    );
    if (!created) throw new Error("Session creation returned no record");
    return mapSession(created.toObject());
  }

  async findActive(id: string, now: Date): Promise<SessionRecord | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await AuthSessionModel.findOne({
      _id: objectId(id),
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    })
      .select("+csrfTokenHash")
      .lean()
      .exec();
    return record ? mapSession(record) : null;
  }

  async findForRefresh(id: string, now: Date): Promise<SessionRecord | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await AuthSessionModel.findOne({
      _id: objectId(id),
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    })
      .select("+refreshTokenHash +csrfTokenHash")
      .lean()
      .exec();
    return record ? mapSession(record) : null;
  }

  async rotate(input: {
    id: string;
    expectedRefreshHash: string;
    newRefreshHash: string;
    ipHash: string;
    userAgent: string;
    now: Date;
  }): Promise<boolean> {
    const result = await AuthSessionModel.updateOne(
      {
        _id: objectId(input.id),
        refreshTokenHash: input.expectedRefreshHash,
        revokedAt: { $exists: false },
        expiresAt: { $gt: input.now },
      },
      {
        $set: {
          refreshTokenHash: input.newRefreshHash,
          ipHash: input.ipHash,
          userAgent: input.userAgent,
          lastUsedAt: input.now,
        },
      },
    ).exec();
    return result.modifiedCount === 1;
  }

  async revoke(id: string, reason: string, now: Date): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await AuthSessionModel.updateOne(
      { _id: objectId(id), revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokeReason: reason } },
    ).exec();
  }

  async setMfaVerified(id: string, at: Date, session?: ClientSession): Promise<void> {
    const result = await AuthSessionModel.updateOne(
      { _id: objectId(id), revokedAt: { $exists: false }, expiresAt: { $gt: at } },
      { $set: { mfaVerifiedAt: at, lastUsedAt: at } },
      session ? { session } : {},
    ).exec();
    if (result.modifiedCount !== 1) throw new Error("Could not mark session as MFA verified");
  }
}

export class ConsentRepository {
  async recordRegistration(
    input: {
      userId: string;
      termsVersion: string;
      privacyVersion: string;
      ipHash: string;
      occurredAt: Date;
    },
    session?: ClientSession,
  ): Promise<void> {
    await ConsentEventModel.insertMany(
      [
        {
          userId: objectId(input.userId),
          documentType: "terms",
          version: input.termsVersion,
          purpose: "Platform terms acceptance at registration",
          action: "accepted",
          occurredAt: input.occurredAt,
          ipHash: input.ipHash,
        },
        {
          userId: objectId(input.userId),
          documentType: "privacy",
          version: input.privacyVersion,
          purpose: "Privacy notice acknowledgement at registration",
          action: "accepted",
          occurredAt: input.occurredAt,
          ipHash: input.ipHash,
        },
      ],
      session ? { session } : {},
    );
  }
}

function mapProfile(record: {
  displayName?: string | null;
  preferredLanguage?: string | null;
  timezone?: string | null;
  age18AttestedAt?: Date | null;
  onboardingCompletedAt?: Date | null;
  learningGoals?: string[];
  subjectIds?: Types.ObjectId[];
}): ProfileDto {
  return {
    displayName: record.displayName ?? null,
    preferredLanguage: (record.preferredLanguage as Language | undefined) ?? null,
    timezone: record.timezone ?? null,
    age18AttestedAt: record.age18AttestedAt?.toISOString() ?? null,
    onboardingCompletedAt: record.onboardingCompletedAt?.toISOString() ?? null,
    learningGoals: record.learningGoals ? [...record.learningGoals] : [],
    subjectIds: record.subjectIds?.map(String) ?? [],
  };
}

export class ProfileRepository {
  async createForRegistration(
    userId: string,
    age18AttestedAt: Date | null,
    session?: ClientSession,
  ): Promise<void> {
    await ProfileModel.create(
      [
        {
          userId: objectId(userId),
          ...(age18AttestedAt ? { age18AttestedAt } : {}),
        },
      ],
      session ? { session } : {},
    );
  }

  async findByOwner(userId: string, session?: ClientSession): Promise<ProfileDto | null> {
    const record = await ProfileModel.findOne({ userId: objectId(userId) })
      .session(session ?? null)
      .lean()
      .exec();
    return record ? mapProfile(record) : null;
  }

  async completeOnboarding(input: {
    userId: string;
    displayName: string;
    preferredLanguage: Language;
    timezone: string;
    learningGoals: string[];
    subjectIds: string[];
    at: Date;
  }): Promise<ProfileDto> {
    const record = await ProfileModel.findOneAndUpdate(
      { userId: objectId(input.userId) },
      {
        $set: {
          displayName: input.displayName,
          preferredLanguage: input.preferredLanguage,
          timezone: input.timezone,
          learningGoals: input.learningGoals,
          subjectIds: input.subjectIds.map(objectId),
          onboardingCompletedAt: input.at,
        },
      },
      { new: true },
    )
      .lean()
      .exec();
    if (!record) throw new Error("Profile not found for registered user");
    return mapProfile(record);
  }

  async getDisplayName(userId: string, session?: ClientSession): Promise<string | null> {
    const record = await ProfileModel.findOne({ userId: objectId(userId) })
      .select("displayName")
      .session(session ?? null)
      .lean()
      .exec();
    return record?.displayName ?? null;
  }
}

export class SubjectRepository {
  async listActive(): Promise<SubjectDto[]> {
    const records = await SubjectModel.find({ active: true })
      .sort({ sortOrder: 1, _id: 1 })
      .select("slug category names")
      .lean()
      .exec();
    return records.map((record) => ({
      id: record._id.toString(),
      slug: record.slug,
      category: record.category,
      names: { ...record.names },
    }));
  }

  async activeIdsExist(ids: string[], session?: ClientSession): Promise<boolean> {
    if (ids.length === 0) return true;
    const count = await SubjectModel.countDocuments({
      _id: { $in: ids.map(objectId) },
      active: true,
    })
      .session(session ?? null)
      .exec();
    return count === new Set(ids).size;
  }

  async findActiveByIds(ids: string[]): Promise<SubjectDto[]> {
    if (ids.length === 0) return [];
    const records = await SubjectModel.find({ _id: { $in: ids.map(objectId) }, active: true })
      .select("slug category names")
      .lean()
      .exec();
    const byId = new Map(
      records.map((record) => [
        record._id.toString(),
        {
          id: record._id.toString(),
          slug: record.slug,
          category: record.category,
          names: { ...record.names },
        } satisfies SubjectDto,
      ]),
    );
    return ids.flatMap((id) => {
      const subject = byId.get(id);
      return subject ? [subject] : [];
    });
  }

  // Unlike findActiveByIds, this does not filter on `active`: a booking or historical
  // record may reference a subject that was later deactivated, and display should not
  // silently drop it.
  async findByIds(ids: string[]): Promise<SubjectDto[]> {
    if (ids.length === 0) return [];
    const records = await SubjectModel.find({ _id: { $in: ids.map(objectId) } })
      .select("slug category names")
      .lean()
      .exec();
    const byId = new Map(
      records.map((record) => [
        record._id.toString(),
        {
          id: record._id.toString(),
          slug: record.slug,
          category: record.category,
          names: { ...record.names },
        } satisfies SubjectDto,
      ]),
    );
    return ids.flatMap((id) => {
      const subject = byId.get(id);
      return subject ? [subject] : [];
    });
  }
}

function mapApplication(
  record: EducatorApplicationRecord & { _id: Types.ObjectId },
): ApplicationDto {
  return {
    id: String(record._id),
    educatorId: String(record.educatorId),
    status: record.status as EducatorApplicationStatus,
    biography: String(record.biographyDraft),
    languages: [...record.languages] as Language[],
    timezone: String(record.timezone),
    subjectClaims: record.subjectClaims.map((claim) => ({
      subjectId: String(claim.subjectId),
      qualificationSummary: String(claim.qualificationSummary ?? ""),
      experienceSummary: String(claim.experienceSummary ?? ""),
      qualificationStatus: String(claim.qualificationStatus) as
        | "not_reviewed"
        | "verified"
        | "not_verified",
      experienceStatus: String(claim.experienceStatus) as
        | "self_declared"
        | "verified"
        | "not_verified",
      approvalStatus: String(claim.approvalStatus) as
        | "pending"
        | "approved"
        | "rejected",
    })),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    reviewStartedAt: record.reviewStartedAt?.toISOString() ?? null,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    decisionReason: record.decisionReason ?? null,
    revision: Number(record.revision),
  };
}

export class EducatorApplicationRepository {
  async getByOwner(
    educatorId: string,
    session?: ClientSession,
  ): Promise<ApplicationDto | null> {
    const record = await EducatorApplicationModel.findOne({ educatorId: objectId(educatorId) })
      .session(session ?? null)
      .lean()
      .exec();
    return record ? mapApplication(record) : null;
  }

  async saveDraft(
    educatorId: string,
    draft: EducatorApplicationDraftInput,
  ): Promise<ApplicationDto | null> {
    const subjectClaims = draft.subjectClaims.map((claim) => ({
      ...claim,
      subjectId: objectId(claim.subjectId),
      qualificationStatus: "not_reviewed",
      experienceStatus: "self_declared",
      approvalStatus: "pending",
    }));
    const updated = await EducatorApplicationModel.findOneAndUpdate(
      {
        educatorId: objectId(educatorId),
        status: { $in: ["draft", "changes_requested"] },
      },
      {
        $set: {
          biographyDraft: draft.biography,
          languages: draft.languages,
          timezone: draft.timezone,
          subjectClaims,
        },
        $inc: { revision: 1 },
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated) return mapApplication(updated);

    const existing = await EducatorApplicationModel.exists({ educatorId: objectId(educatorId) });
    if (existing) return null;
    try {
      const created = await EducatorApplicationModel.create({
        educatorId: objectId(educatorId),
        status: "draft",
        biographyDraft: draft.biography,
        languages: draft.languages,
        timezone: draft.timezone,
        subjectClaims,
        revision: 1,
      });
      return mapApplication(created.toObject());
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        return null;
      }
      throw error;
    }
  }

  async submit(
    educatorId: string,
    fromStatus: "draft" | "changes_requested",
    at: Date,
    session: ClientSession,
  ): Promise<ApplicationDto | null> {
    const record = await EducatorApplicationModel.findOneAndUpdate(
      { educatorId: objectId(educatorId), status: fromStatus },
      {
        $set: { status: "submitted", submittedAt: at },
        $unset: {
          decisionReason: "",
          decidedAt: "",
          reviewedBy: "",
          reviewStartedAt: "",
        },
      },
      { new: true, session },
    )
      .lean()
      .exec();
    return record ? mapApplication(record) : null;
  }

  async list(input: {
    status?: EducatorApplicationStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ApplicationDto[]; nextCursor: string | null }> {
    const records = await EducatorApplicationModel.find({
      ...(input.status ? { status: input.status } : {}),
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    const hasMore = records.length > input.limit;
    const page = records.slice(0, input.limit);
    return {
      items: page.map(mapApplication),
      nextCursor: hasMore ? String(page.at(-1)!._id) : null,
    };
  }

  async getById(id: string, session?: ClientSession): Promise<ApplicationDto | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await EducatorApplicationModel.findById(id)
      .session(session ?? null)
      .lean()
      .exec();
    return record ? mapApplication(record) : null;
  }

  async startReview(input: {
    id: string;
    reviewerId: string;
    at: Date;
    session: ClientSession;
  }): Promise<ApplicationDto | null> {
    const record = await EducatorApplicationModel.findOneAndUpdate(
      { _id: objectId(input.id), status: "submitted" },
      {
        $set: {
          status: "under_review",
          reviewedBy: objectId(input.reviewerId),
          reviewStartedAt: input.at,
        },
      },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
    return record ? mapApplication(record) : null;
  }

  async decide(input: {
    id: string;
    reviewerId: string;
    toStatus: "approved" | "rejected" | "changes_requested";
    reason: string;
    at: Date;
    session: ClientSession;
  }): Promise<ApplicationDto | null> {
    const approvalFields =
      input.toStatus === "approved"
        ? { "subjectClaims.$[].approvalStatus": "approved" }
        : input.toStatus === "rejected"
          ? { "subjectClaims.$[].approvalStatus": "rejected" }
          : {};
    const record = await EducatorApplicationModel.findOneAndUpdate(
      { _id: objectId(input.id), status: "under_review", reviewedBy: objectId(input.reviewerId) },
      {
        $set: {
          status: input.toStatus,
          decisionReason: input.reason,
          decidedAt: input.at,
          ...approvalFields,
        },
      },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
    return record ? mapApplication(record) : null;
  }
}

export class ApplicationHistoryRepository {
  async record(input: {
    applicationId: string;
    educatorId: string;
    actorId: string;
    fromStatus: EducatorApplicationStatus;
    toStatus: EducatorApplicationStatus;
    reason?: string;
    occurredAt: Date;
    session: ClientSession;
  }): Promise<void> {
    await EducatorApplicationHistoryModel.create(
      [
        {
          applicationId: objectId(input.applicationId),
          educatorId: objectId(input.educatorId),
          actorId: objectId(input.actorId),
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          ...(input.reason ? { reason: input.reason } : {}),
          occurredAt: input.occurredAt,
        },
      ],
      { session: input.session },
    );
  }
}

export class PublicEducatorRepository {
  async publish(input: {
    application: ApplicationDto;
    displayName: string;
    approvedAt: Date;
    session: ClientSession;
  }): Promise<void> {
    await PublicEducatorModel.updateOne(
      { educatorId: objectId(input.application.educatorId) },
      {
        $set: {
          applicationId: objectId(input.application.id),
          displayName: input.displayName,
          biography: input.application.biography,
          languages: input.application.languages,
          subjectIds: input.application.subjectClaims
            .filter(({ approvalStatus }) => approvalStatus === "approved")
            .map(({ subjectId }) => objectId(subjectId)),
          publicationStatus: "published",
          approvedAt: input.approvedAt,
        },
      },
      { upsert: true, session: input.session, runValidators: true },
    ).exec();
  }

  async unpublish(educatorId: string, session: ClientSession): Promise<void> {
    await PublicEducatorModel.updateOne(
      { educatorId: objectId(educatorId) },
      { $set: { publicationStatus: "unpublished" } },
      { session },
    ).exec();
  }

  async getPublishedByEducatorId(educatorId: string): Promise<{ subjectIds: string[] } | null> {
    if (!Types.ObjectId.isValid(educatorId)) return null;
    const record = await PublicEducatorModel.findOne({
      educatorId: objectId(educatorId),
      publicationStatus: "published",
    })
      .select("subjectIds")
      .lean()
      .exec();
    return record ? { subjectIds: record.subjectIds.map(String) } : null;
  }

  async list(input: {
    subjectId?: string;
    language?: Language;
    cursor?: string;
    limit: number;
  }, subjectRepository: SubjectRepository): Promise<{
    items: PublicEducatorDto[];
    nextCursor: string | null;
  }> {
    // This select is intentionally explicit. Never replace it with a raw document response.
    const records = await PublicEducatorModel.find({
      publicationStatus: "published",
      ...(input.subjectId ? { subjectIds: objectId(input.subjectId) } : {}),
      ...(input.language ? { languages: input.language } : {}),
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .select("educatorId displayName biography languages subjectIds approvedAt")
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    const page = records.slice(0, input.limit);
    const allSubjectIds = [...new Set(page.flatMap((record) => record.subjectIds.map(String)))];
    const subjects = await subjectRepository.findActiveByIds(allSubjectIds);
    const byId = new Map(subjects.map((subject) => [subject.id, subject]));
    return {
      items: page.map((record) => ({
        id: record._id.toString(),
        educatorId: record.educatorId.toString(),
        displayName: record.displayName,
        biography: record.biography,
        languages: [...record.languages] as Language[],
        subjects: record.subjectIds.flatMap((id) => {
          const subject = byId.get(id.toString());
          return subject ? [subject] : [];
        }),
        approvedAt: record.approvedAt.toISOString(),
      })),
      nextCursor: records.length > input.limit ? String(page.at(-1)!._id) : null,
    };
  }

  // Admin-only: every publication status, not just "published" — used by the Educators
  // directory. Never expose this through a public route.
  async listAll(
    input: { cursor?: string; limit: number },
    subjectRepository: SubjectRepository,
  ): Promise<{ items: AdminEducatorDto[]; nextCursor: string | null }> {
    const records = await PublicEducatorModel.find({
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    const page = records.slice(0, input.limit);
    const allSubjectIds = [...new Set(page.flatMap((record) => record.subjectIds.map(String)))];
    const [subjects, users] = await Promise.all([
      subjectRepository.findByIds(allSubjectIds),
      UserModel.find({ _id: { $in: page.map((record) => record.educatorId) } })
        .select("email")
        .lean()
        .exec(),
    ]);
    const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
    const emailByEducatorId = new Map(users.map((user) => [String(user._id), user.email]));
    return {
      items: page.map((record) => ({
        id: String(record._id),
        educatorId: String(record.educatorId),
        displayName: record.displayName,
        email: emailByEducatorId.get(String(record.educatorId)) ?? "unknown",
        languages: [...record.languages] as Language[],
        subjects: record.subjectIds.flatMap((id) => {
          const subject = subjectsById.get(id.toString());
          return subject ? [subject] : [];
        }),
        publicationStatus: record.publicationStatus as PublicationStatus,
        approvedAt: record.approvedAt.toISOString(),
      })),
      nextCursor: records.length > input.limit ? String(page.at(-1)!._id) : null,
    };
  }

  async setPublicationStatus(input: {
    educatorId: string;
    from: PublicationStatus;
    to: PublicationStatus;
  }): Promise<boolean> {
    const result = await PublicEducatorModel.updateOne(
      { educatorId: objectId(input.educatorId), publicationStatus: input.from },
      { $set: { publicationStatus: input.to } },
    ).exec();
    return result.modifiedCount === 1;
  }
}

function mapBookingRecord(
  record: BookingRequestRecord & { _id: Types.ObjectId; createdAt: Date },
  names: { educatorName: string; learnerName: string; subjectName: string },
): BookingRequestDto {
  return {
    id: String(record._id),
    status: record.status as BookingStatus,
    educatorId: String(record.educatorId),
    educatorName: names.educatorName,
    learnerId: String(record.learnerId),
    learnerName: names.learnerName,
    subjectId: String(record.subjectId),
    subjectName: names.subjectName,
    startAt: record.startAt.toISOString(),
    durationMinutes: Number(record.durationMinutes),
    timezone: String(record.timezone),
    message: String(record.message ?? ""),
    meetingLink: record.meetingLink ?? null,
    declineReason: record.declineReason ?? null,
    cancelReason: record.cancelReason ?? null,
    cancelledBy: (record.cancelledBy as BookingActorRole | undefined) ?? null,
    createdAt: record.createdAt.toISOString(),
    decidedAt: record.decidedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
  };
}

type BookingLeanRecord = BookingRequestRecord & { _id: Types.ObjectId; createdAt: Date };

export class BookingRepository {
  async create(input: {
    learnerId: string;
    educatorId: string;
    subjectId: string;
    startAt: Date;
    timezone: string;
    message: string;
    session?: ClientSession;
  }): Promise<BookingLeanRecord> {
    const [created] = await BookingRequestModel.create(
      [
        {
          learnerId: objectId(input.learnerId),
          educatorId: objectId(input.educatorId),
          subjectId: objectId(input.subjectId),
          status: "requested",
          startAt: input.startAt,
          durationMinutes: 50,
          timezone: input.timezone,
          message: input.message,
        },
      ],
      input.session ? { session: input.session } : {},
    );
    if (!created) throw new Error("Booking creation returned no record");
    return created.toObject();
  }

  async getById(id: string, session?: ClientSession): Promise<BookingLeanRecord | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return BookingRequestModel.findById(id).session(session ?? null).lean().exec();
  }

  async listForLearner(
    input: { learnerId: string; status?: BookingStatus; cursor?: string; limit: number },
    subjectRepository: SubjectRepository,
  ): Promise<{ items: BookingRequestDto[]; nextCursor: string | null }> {
    const records = await BookingRequestModel.find({
      learnerId: objectId(input.learnerId),
      ...(input.status ? { status: input.status } : {}),
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    return this.hydrate(records, input.limit, subjectRepository);
  }

  async listForEducator(
    input: { educatorId: string; status?: BookingStatus; cursor?: string; limit: number },
    subjectRepository: SubjectRepository,
  ): Promise<{ items: BookingRequestDto[]; nextCursor: string | null }> {
    const records = await BookingRequestModel.find({
      educatorId: objectId(input.educatorId),
      ...(input.status ? { status: input.status } : {}),
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    return this.hydrate(records, input.limit, subjectRepository);
  }

  async accept(input: {
    id: string;
    educatorId: string;
    meetingLink: string;
    at: Date;
    session: ClientSession;
  }): Promise<BookingLeanRecord | null> {
    return BookingRequestModel.findOneAndUpdate(
      { _id: objectId(input.id), educatorId: objectId(input.educatorId), status: "requested" },
      { $set: { status: "accepted", meetingLink: input.meetingLink, decidedAt: input.at } },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async decline(input: {
    id: string;
    educatorId: string;
    reason: string;
    at: Date;
    session: ClientSession;
  }): Promise<BookingLeanRecord | null> {
    return BookingRequestModel.findOneAndUpdate(
      { _id: objectId(input.id), educatorId: objectId(input.educatorId), status: "requested" },
      { $set: { status: "declined", declineReason: input.reason, decidedAt: input.at } },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async cancel(input: {
    id: string;
    actorId: string;
    actorRole: BookingActorRole;
    reason: string;
    at: Date;
    session: ClientSession;
  }): Promise<BookingLeanRecord | null> {
    const ownershipFilter =
      input.actorRole === "learner"
        ? { learnerId: objectId(input.actorId) }
        : { educatorId: objectId(input.actorId) };
    return BookingRequestModel.findOneAndUpdate(
      { _id: objectId(input.id), ...ownershipFilter, status: { $in: ["requested", "accepted"] } },
      { $set: { status: "cancelled", cancelReason: input.reason, cancelledBy: input.actorRole } },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async complete(input: {
    id: string;
    educatorId: string;
    at: Date;
    session: ClientSession;
  }): Promise<BookingLeanRecord | null> {
    return BookingRequestModel.findOneAndUpdate(
      {
        _id: objectId(input.id),
        educatorId: objectId(input.educatorId),
        status: "accepted",
        startAt: { $lte: input.at },
      },
      { $set: { status: "completed", completedAt: input.at } },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async toDto(
    record: BookingLeanRecord,
    subjectRepository: SubjectRepository,
  ): Promise<BookingRequestDto> {
    const { items } = await this.hydrate([record], 1, subjectRepository);
    const dto = items[0];
    if (!dto) throw new Error("Booking hydration returned no record");
    return dto;
  }

  private async hydrate(
    records: BookingLeanRecord[],
    limit: number,
    subjectRepository: SubjectRepository,
  ): Promise<{ items: BookingRequestDto[]; nextCursor: string | null }> {
    const page = records.slice(0, limit);
    const educatorIds = [...new Set(page.map((record) => String(record.educatorId)))];
    const learnerIds = [...new Set(page.map((record) => String(record.learnerId)))];
    const subjectIds = [...new Set(page.map((record) => String(record.subjectId)))];
    const [educators, learners, subjects] = await Promise.all([
      PublicEducatorModel.find({ educatorId: { $in: educatorIds.map(objectId) } })
        .select("educatorId displayName")
        .lean()
        .exec(),
      ProfileModel.find({ userId: { $in: learnerIds.map(objectId) } })
        .select("userId displayName")
        .lean()
        .exec(),
      subjectRepository.findByIds(subjectIds),
    ]);
    const educatorNames = new Map(educators.map((record) => [String(record.educatorId), record.displayName]));
    const learnerNames = new Map(
      learners.map((record) => [String(record.userId), record.displayName || "IlmSaathi learner"]),
    );
    const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.names.en]));
    return {
      items: page.map((record) =>
        mapBookingRecord(record, {
          educatorName: educatorNames.get(String(record.educatorId)) ?? "IlmSaathi educator",
          learnerName: learnerNames.get(String(record.learnerId)) ?? "IlmSaathi learner",
          subjectName: subjectNames.get(String(record.subjectId)) ?? "Subject",
        }),
      ),
      nextCursor: records.length > limit ? String(page.at(-1)!._id) : null,
    };
  }
}

export class BookingHistoryRepository {
  async record(input: {
    bookingId: string;
    actorId: string;
    actorRole: BookingActorRole;
    fromStatus: BookingStatus;
    toStatus: BookingStatus;
    reason?: string;
    occurredAt: Date;
    session: ClientSession;
  }): Promise<void> {
    await BookingStatusHistoryModel.create(
      [
        {
          bookingId: objectId(input.bookingId),
          actorId: objectId(input.actorId),
          actorRole: input.actorRole,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          ...(input.reason ? { reason: input.reason } : {}),
          occurredAt: input.occurredAt,
        },
      ],
      { session: input.session },
    );
  }
}

function mapVerificationDocument(record: {
  _id: Types.ObjectId;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}): VerificationDocumentDto {
  return {
    id: String(record._id),
    filename: record.originalFilename,
    contentType: record.contentType as VerificationDocumentDto["contentType"],
    sizeBytes: Number(record.sizeBytes),
    uploadedAt: record.createdAt.toISOString(),
  };
}

export class VerificationDocumentRepository {
  async create(input: {
    applicationId: string;
    educatorId: string;
    objectKey: string;
    originalFilename: string;
    contentType: VerificationDocumentDto["contentType"];
    sizeBytes: number;
  }): Promise<VerificationDocumentDto> {
    const created = await VerificationDocumentModel.create({
      applicationId: objectId(input.applicationId),
      educatorId: objectId(input.educatorId),
      objectKey: input.objectKey,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    return mapVerificationDocument(created.toObject());
  }

  async listForApplication(applicationId: string): Promise<VerificationDocumentDto[]> {
    const records = await VerificationDocumentModel.find({ applicationId: objectId(applicationId) })
      .sort({ _id: 1 })
      .lean()
      .exec();
    return records.map(mapVerificationDocument);
  }

  async countForApplication(applicationId: string): Promise<number> {
    return VerificationDocumentModel.countDocuments({ applicationId: objectId(applicationId) }).exec();
  }

  // Returns the raw record (including objectKey, needed for storage lookup) rather than the
  // DTO; callers that only need display fields should use listForApplication instead.
  async getById(id: string): Promise<
    | (VerificationDocumentDto & { objectKey: string; applicationId: string; educatorId: string })
    | null
  > {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await VerificationDocumentModel.findById(id).lean().exec();
    if (!record) return null;
    return {
      ...mapVerificationDocument(record),
      objectKey: record.objectKey,
      applicationId: String(record.applicationId),
      educatorId: String(record.educatorId),
    };
  }

  async deleteById(input: {
    id: string;
    applicationId: string;
  }): Promise<{ objectKey: string } | null> {
    if (!Types.ObjectId.isValid(input.id)) return null;
    const record = await VerificationDocumentModel.findOneAndDelete({
      _id: objectId(input.id),
      applicationId: objectId(input.applicationId),
    })
      .lean()
      .exec();
    return record ? { objectKey: record.objectKey } : null;
  }
}

export interface AuditContext {
  ipHash: string;
  userAgent: string;
  sessionId?: string;
  aal: 1 | 2;
}

export class AuditRepository {
  async append(input: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    securityContext: AuditContext;
    occurredAt: Date;
    session?: ClientSession;
  }): Promise<void> {
    await AdminAuditEventModel.create(
      [
        {
          actorId: objectId(input.actorId),
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          ...(input.reason ? { reason: input.reason } : {}),
          securityContext: input.securityContext,
          occurredAt: input.occurredAt,
        },
      ],
      { session: input.session },
    );
  }

  async list(input: {
    cursor?: string;
    limit: number;
  }): Promise<{ items: AuditLogEntryDto[]; nextCursor: string | null }> {
    const records = await AdminAuditEventModel.find({
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    const page = records.slice(0, input.limit);
    const actorIds = [...new Set(page.map((record) => String(record.actorId)))];
    const actors = await UserModel.find({ _id: { $in: actorIds.map(objectId) } })
      .select("email")
      .lean()
      .exec();
    const emailByActorId = new Map(actors.map((actor) => [String(actor._id), actor.email]));
    return {
      items: page.map((record) => ({
        id: String(record._id),
        actorEmail: emailByActorId.get(String(record.actorId)) ?? "unknown",
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId,
        reason: record.reason ?? null,
        occurredAt: record.occurredAt.toISOString(),
      })),
      nextCursor: records.length > input.limit ? String(page.at(-1)!._id) : null,
    };
  }
}

function mapReport(
  record: ReportRecord & { _id: Types.ObjectId; createdAt: Date },
  emails: { reporterEmail: string; reportedUserEmail: string },
): ReportDto {
  return {
    id: String(record._id),
    status: record.status as ReportStatus,
    category: record.category as ReportCategory,
    description: String(record.description),
    reporterId: String(record.reporterId),
    reporterEmail: emails.reporterEmail,
    reportedUserId: String(record.reportedUserId),
    reportedUserEmail: emails.reportedUserEmail,
    relatedBookingId: record.relatedBookingId ? String(record.relatedBookingId) : null,
    assignedAdminId: record.assignedAdminId ? String(record.assignedAdminId) : null,
    resolutionReason: record.resolutionReason ?? null,
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  };
}

type ReportLeanRecord = ReportRecord & { _id: Types.ObjectId; createdAt: Date };

export class ReportRepository {
  async create(input: {
    reporterId: string;
    reportedUserId: string;
    category: ReportCategory;
    description: string;
    relatedBookingId?: string;
  }): Promise<ReportLeanRecord> {
    const created = await ReportModel.create({
      reporterId: objectId(input.reporterId),
      reportedUserId: objectId(input.reportedUserId),
      category: input.category,
      description: input.description,
      ...(input.relatedBookingId ? { relatedBookingId: objectId(input.relatedBookingId) } : {}),
    });
    return created.toObject();
  }

  async getById(id: string): Promise<ReportLeanRecord | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return ReportModel.findById(id).lean().exec();
  }

  async list(input: {
    status?: ReportStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReportDto[]; nextCursor: string | null }> {
    const records = await ReportModel.find({
      ...(input.status ? { status: input.status } : {}),
      ...(input.cursor ? { _id: { $gt: objectId(input.cursor) } } : {}),
    })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean()
      .exec();
    return this.hydrate(records, input.limit);
  }

  async assign(input: {
    id: string;
    adminId: string;
    session: ClientSession;
  }): Promise<ReportLeanRecord | null> {
    return ReportModel.findOneAndUpdate(
      { _id: objectId(input.id), status: "open" },
      { $set: { status: "in_review", assignedAdminId: objectId(input.adminId) } },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async resolve(input: {
    id: string;
    adminId: string;
    reason: string;
    at: Date;
    session: ClientSession;
  }): Promise<ReportLeanRecord | null> {
    return ReportModel.findOneAndUpdate(
      { _id: objectId(input.id), status: { $in: ["open", "in_review"] } },
      {
        $set: {
          status: "resolved",
          assignedAdminId: objectId(input.adminId),
          resolutionReason: input.reason,
          resolvedAt: input.at,
        },
      },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async dismiss(input: {
    id: string;
    adminId: string;
    reason: string;
    at: Date;
    session: ClientSession;
  }): Promise<ReportLeanRecord | null> {
    return ReportModel.findOneAndUpdate(
      { _id: objectId(input.id), status: { $in: ["open", "in_review"] } },
      {
        $set: {
          status: "dismissed",
          assignedAdminId: objectId(input.adminId),
          resolutionReason: input.reason,
          resolvedAt: input.at,
        },
      },
      { new: true, session: input.session },
    )
      .lean()
      .exec();
  }

  async toDto(record: ReportLeanRecord): Promise<ReportDto> {
    const { items } = await this.hydrate([record], 1);
    const dto = items[0];
    if (!dto) throw new Error("Report hydration returned no record");
    return dto;
  }

  private async hydrate(
    records: ReportLeanRecord[],
    limit: number,
  ): Promise<{ items: ReportDto[]; nextCursor: string | null }> {
    const page = records.slice(0, limit);
    const userIds = [
      ...new Set(page.flatMap((record) => [String(record.reporterId), String(record.reportedUserId)])),
    ];
    const users = await UserModel.find({ _id: { $in: userIds.map(objectId) } })
      .select("email")
      .lean()
      .exec();
    const emailById = new Map(users.map((user) => [String(user._id), user.email]));
    return {
      items: page.map((record) =>
        mapReport(record, {
          reporterEmail: emailById.get(String(record.reporterId)) ?? "unknown",
          reportedUserEmail: emailById.get(String(record.reportedUserId)) ?? "unknown",
        }),
      ),
      nextCursor: records.length > limit ? String(page.at(-1)!._id) : null,
    };
  }
}

export class BlockRepository {
  async create(input: { blockerId: string; blockedUserId: string }): Promise<BlockDto> {
    const created = (
      await BlockModel.create({
        blockerId: objectId(input.blockerId),
        blockedUserId: objectId(input.blockedUserId),
      })
    ).toObject() as BlockRecord & { _id: Types.ObjectId; createdAt: Date };
    const email = await UserModel.findById(created.blockedUserId).select("email").lean().exec();
    return {
      id: String(created._id),
      blockedUserId: String(created.blockedUserId),
      blockedUserEmail: email?.email ?? "unknown",
      createdAt: created.createdAt.toISOString(),
    };
  }

  async delete(id: string, blockerId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await BlockModel.deleteOne({ _id: objectId(id), blockerId: objectId(blockerId) }).exec();
    return result.deletedCount === 1;
  }

  async listForBlocker(blockerId: string): Promise<BlockDto[]> {
    const records = await BlockModel.find({ blockerId: objectId(blockerId) })
      .sort({ _id: 1 })
      .lean()
      .exec();
    const blockedIds = records.map((record) => record.blockedUserId);
    const users = await UserModel.find({ _id: { $in: blockedIds } }).select("email").lean().exec();
    const emailById = new Map(users.map((user) => [String(user._id), user.email]));
    return records.map((record) => ({
      id: String(record._id),
      blockedUserId: String(record.blockedUserId),
      blockedUserEmail: emailById.get(String(record.blockedUserId)) ?? "unknown",
      createdAt: (record as unknown as { createdAt: Date }).createdAt.toISOString(),
    }));
  }

  async isBlockedEitherDirection(userIdA: string, userIdB: string): Promise<boolean> {
    const count = await BlockModel.countDocuments({
      $or: [
        { blockerId: objectId(userIdA), blockedUserId: objectId(userIdB) },
        { blockerId: objectId(userIdB), blockedUserId: objectId(userIdA) },
      ],
    }).exec();
    return count > 0;
  }
}

export async function inTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  let value: T | undefined;
  try {
    await session.withTransaction(
      async () => {
        value = await operation(session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
  } finally {
    await session.endSession();
  }
  if (value === undefined) throw new Error("Transaction completed without a result");
  return value;
}

export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  consents: ConsentRepository;
  profiles: ProfileRepository;
  subjects: SubjectRepository;
  applications: EducatorApplicationRepository;
  applicationHistory: ApplicationHistoryRepository;
  publicEducators: PublicEducatorRepository;
  bookings: BookingRepository;
  bookingHistory: BookingHistoryRepository;
  verificationDocuments: VerificationDocumentRepository;
  reports: ReportRepository;
  blocks: BlockRepository;
  audit: AuditRepository;
}

export function createRepositories(): Repositories {
  return {
    users: new UserRepository(),
    sessions: new SessionRepository(),
    consents: new ConsentRepository(),
    profiles: new ProfileRepository(),
    subjects: new SubjectRepository(),
    applications: new EducatorApplicationRepository(),
    applicationHistory: new ApplicationHistoryRepository(),
    publicEducators: new PublicEducatorRepository(),
    bookings: new BookingRepository(),
    bookingHistory: new BookingHistoryRepository(),
    verificationDocuments: new VerificationDocumentRepository(),
    reports: new ReportRepository(),
    blocks: new BlockRepository(),
    audit: new AuditRepository(),
  };
}
