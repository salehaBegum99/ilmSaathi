export type Role = 'learner' | 'educator' | 'moderator' | 'admin';
export type LanguageCode = 'en' | 'hi' | 'ur';

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  preferredLanguage?: LanguageCode;
  onboardingComplete?: boolean;
  mfaVerified?: boolean;
}

export interface Subject {
  id: string;
  slug: string;
  name: string;
  localizedNames?: { en: string; hi: string; ur: string };
  category: 'faith' | 'academic' | 'practical';
  active: boolean;
}

export interface Educator {
  id: string;
  educatorId: string;
  slug: string;
  displayName: string;
  initials: string;
  city: string;
  languages: string[];
  headline: string;
  biography: string;
  subjects: string[];
  subjectRefs: { id: string; name: string }[];
  rating?: number;
  reviewCount?: number;
  completedClasses?: number;
  yearsExperience?: number;
  priceFrom?: number;
  responseTime?: string;
  nextAvailable?: string;
  verified: { identity: boolean; qualifications: boolean; subjects: boolean };
  accent: 'plum' | 'saffron' | 'teal' | 'rose';
}

export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'completed';
export type BookingActorRole = 'learner' | 'educator';

export interface BookingRequest {
  id: string;
  status: BookingStatus;
  educatorId: string;
  educatorName: string;
  learnerId: string;
  learnerName: string;
  subjectId: string;
  subjectName: string;
  startAt: string;
  durationMinutes: number;
  timezone: string;
  message: string;
  meetingLink: string | null;
  declineReason: string | null;
  cancelReason: string | null;
  cancelledBy: BookingActorRole | null;
  createdAt: string;
  decidedAt: string | null;
  completedAt: string | null;
}

export interface BookingCreateInput {
  educatorId: string;
  subjectId: string;
  startAt: string;
  timezone: string;
  message?: string;
}

export interface EducatorApplication {
  id: string;
  educatorId?: string;
  educatorName: string;
  email: string;
  submittedAt: string | null;
  subjects: string[];
  languages: string[];
  experience: string;
  biography?: string;
  timezone?: string;
  subjectClaims?: Array<{
    subjectId: string;
    qualificationSummary: string;
    experienceSummary: string;
    approvalStatus?: string;
  }>;
  status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected' | 'suspended';
}

export interface Profile {
  displayName: string | null;
  preferredLanguage: LanguageCode | null;
  timezone: string | null;
  onboardingCompletedAt: string | null;
  learningGoals: string[];
  subjectIds: string[];
}

export interface OnboardingInput {
  displayName: string;
  preferredLanguage: LanguageCode;
  timezone: string;
  learningGoals: string[];
  subjectIds: string[];
}

export interface EducatorDraftInput {
  biography: string;
  languages: LanguageCode[];
  timezone: string;
  subjectClaims: Array<{
    subjectId: string;
    qualificationSummary: string;
    experienceSummary: string;
  }>;
}

export interface VerificationDocument {
  id: string;
  filename: string;
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
  uploadedAt: string;
}

export interface DocumentAccessToken {
  token: string;
  expiresAt: string;
}

export type ReportCategory = 'safety_concern' | 'harassment' | 'inappropriate_content' | 'other';
export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';
export type PublicationStatus = 'published' | 'unpublished' | 'suspended';

export interface Report {
  id: string;
  status: ReportStatus;
  category: ReportCategory;
  description: string;
  reporterId: string;
  reporterEmail: string;
  reportedUserId: string;
  reportedUserEmail: string;
  relatedBookingId: string | null;
  assignedAdminId: string | null;
  resolutionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReportCreateInput {
  reportedUserId: string;
  category: ReportCategory;
  description: string;
  relatedBookingId?: string;
}

export interface Block {
  id: string;
  blockedUserId: string;
  blockedUserEmail: string;
  createdAt: string;
}

export interface AdminEducator {
  id: string;
  educatorId: string;
  displayName: string;
  email: string;
  languages: string[];
  subjects: Subject[];
  publicationStatus: PublicationStatus;
  approvedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  occurredAt: string;
}

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}
