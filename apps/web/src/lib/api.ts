import type {
  AdminEducator,
  ApiEnvelope,
  AuditLogEntry,
  Block,
  BookingCreateInput,
  BookingRequest,
  BookingStatus,
  DocumentAccessToken,
  Educator,
  EducatorApplication,
  EducatorDraftInput,
  LanguageCode,
  OnboardingInput,
  Profile,
  Report,
  ReportCreateInput,
  ReportStatus,
  Role,
  Subject,
  User,
  VerificationDocument
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
let csrfToken: string | undefined;
let consentVersions: { termsVersion: string; privacyVersion: string } | undefined;

type UnknownRecord = Record<string, unknown>;

interface WireUser {
  id: string;
  email?: string;
  roles: Role[];
  mfaVerified?: boolean;
}

interface WireSubject {
  id: string;
  slug: string;
  category: 'islamic' | 'faith' | 'academic' | 'practical';
  names?: { en: string; hi: string; ur: string };
  name?: string;
  localizedNames?: { en: string; hi: string; ur: string };
}

interface WireEducator extends Omit<Partial<Educator>, 'subjects'> {
  id: string;
  displayName: string;
  biography: string;
  languages: string[];
  subjects: Array<WireSubject | string>;
  approvedAt?: string;
}

interface WireBooking {
  id: string;
  status: BookingRequest['status'];
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
  cancelledBy: BookingRequest['cancelledBy'];
  createdAt: string;
  decidedAt: string | null;
  completedAt: string | null;
}

interface WireDocument {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface WireReport {
  id: string;
  status: ReportStatus;
  category: Report['category'];
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

interface WireBlock {
  id: string;
  blockedUserId: string;
  blockedUserEmail: string;
  createdAt: string;
}

interface WireAdminEducator {
  id: string;
  educatorId: string;
  displayName: string;
  email: string;
  languages: string[];
  subjects: WireSubject[];
  publicationStatus: AdminEducator['publicationStatus'];
  approvedAt: string;
}

interface WireAuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  occurredAt: string;
}

interface WireApplication {
  id: string;
  educatorId?: string;
  status: EducatorApplication['status'];
  educatorName?: string;
  email?: string;
  submittedAt?: string | null;
  subjects?: string[];
  experience?: string;
  biography?: string;
  languages?: string[];
  timezone?: string;
  subjectClaims?: NonNullable<EducatorApplication['subjectClaims']>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapData(value: unknown): unknown {
  return isRecord(value) && 'data' in value ? value.data : value;
}

function field<T>(value: unknown, key: string): T {
  if (isRecord(value) && key in value) return value[key] as T;
  return value as T;
}

function errorDetails(value: unknown) {
  const top = isRecord(value) ? value : {};
  const nested = isRecord(top.error) ? top.error : {};
  return {
    code: String(nested.code || top.code || ''),
    message: String(nested.message || top.message || 'Something went wrong.')
  };
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken && consentVersions) return csrfToken;
  const response = await fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status, 'Could not start a secure session.');
  const payload = unwrapData(await response.json()) as unknown;
  csrfToken = isRecord(payload) && typeof payload.csrfToken === 'string' ? payload.csrfToken : undefined;
  if (!csrfToken) throw new ApiError(500, 'Secure session token was missing.');
  if (
    !isRecord(payload) ||
    typeof payload.termsVersion !== 'string' ||
    typeof payload.privacyVersion !== 'string'
  ) {
    throw new ApiError(500, 'Consent configuration was missing from the API.');
  }
  consentVersions = {
    termsVersion: payload.termsVersion,
    privacyVersion: payload.privacyVersion
  };
  return csrfToken;
}

async function request<T>(path: string, init: RequestInit = {}, retryCsrf = true): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', await ensureCsrf());

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const detail = errorDetails(payload);
    if (retryCsrf && response.status === 403 && ['csrf_invalid', 'csrf_session_mismatch'].includes(detail.code)) {
      csrfToken = undefined;
      return request<T>(path, init, false);
    }
    throw new ApiError(response.status, detail.message, detail.code || undefined);
  }
  return unwrapData(payload) as T;
}

const languageNames: Record<LanguageCode, string> = { en: 'English', hi: 'Hindi', ur: 'Urdu' };
const languageCode = (value: string): LanguageCode | undefined => {
  const code = value.toLowerCase();
  if (code === 'en' || code === 'english') return 'en';
  if (code === 'hi' || code === 'hindi') return 'hi';
  if (code === 'ur' || code === 'urdu') return 'ur';
  return undefined;
};

function mapSubject(subject: WireSubject): Subject {
  const localizedNames = subject.names || subject.localizedNames || { en: subject.name || subject.slug, hi: subject.name || subject.slug, ur: subject.name || subject.slug };
  return {
    id: subject.id,
    slug: subject.slug,
    name: subject.name || localizedNames.en,
    localizedNames,
    category: subject.category === 'islamic' ? 'faith' : subject.category,
    active: true
  };
}

function slugify(value: string, fallback: string) {
  const slug = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${slug || 'educator'}-${fallback.slice(-6)}`;
}

function mapEducator(value: WireEducator, index = 0): Educator {
  const mappedSubjects = value.subjects.map(subject => typeof subject === 'string' ? subject : mapSubject(subject).name);
  const subjectRefs = value.subjects.map(subject => typeof subject === 'string' ? { id: subject, name: subject } : { id: subject.id, name: mapSubject(subject).name });
  const accents: Educator['accent'][] = ['plum', 'saffron', 'teal', 'rose'];
  const displayName = value.displayName.trim() || 'IlmSaathi educator';
  return {
    id: value.id,
    educatorId: value.educatorId || value.id,
    slug: value.slug || slugify(displayName, value.id),
    displayName,
    initials: value.initials || displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    city: value.city || 'Online',
    languages: value.languages.map(item => languageCode(item) ? languageNames[languageCode(item)!] : item),
    headline: value.headline || value.biography,
    biography: value.biography,
    subjects: mappedSubjects,
    subjectRefs,
    rating: value.rating ?? 0,
    reviewCount: value.reviewCount ?? 0,
    completedClasses: value.completedClasses ?? 0,
    yearsExperience: value.yearsExperience ?? 0,
    priceFrom: value.priceFrom ?? 0,
    responseTime: value.responseTime ?? 'Response time not available yet',
    nextAvailable: value.nextAvailable ?? 'Availability on request',
    verified: value.verified || { identity: false, qualifications: false, subjects: true },
    accent: value.accent || accents[index % accents.length] || 'plum'
  };
}

function mapUser(authUser: WireUser, profile?: Profile, displayName?: string): User {
  const emailName = authUser.email?.split('@')[0]?.replace(/[._-]+/g, ' ');
  const user: User = {
    id: authUser.id,
    email: authUser.email || '',
    displayName: profile?.displayName || displayName || emailName || 'IlmSaathi member',
    roles: authUser.roles,
    onboardingComplete: Boolean(profile?.onboardingCompletedAt)
  };
  if (profile?.preferredLanguage) user.preferredLanguage = profile.preferredLanguage;
  if (authUser.mfaVerified !== undefined) user.mfaVerified = authUser.mfaVerified;
  return user;
}

function mapApplication(value: WireApplication, subjectById = new Map<string, string>()): EducatorApplication {
  const claims = value.subjectClaims || [];
  const subjects = value.subjects || claims.map(claim => subjectById.get(claim.subjectId) || claim.subjectId);
  const experience = value.experience || claims.find(claim => claim.experienceSummary)?.experienceSummary || 'Not supplied';
  const application: EducatorApplication = {
    id: value.id,
    educatorName: value.educatorName || (value.educatorId ? `Educator ${value.educatorId.slice(-6)}` : 'Educator application'),
    email: value.email || '',
    submittedAt: value.submittedAt || null,
    subjects,
    languages: (value.languages || []).map(item => languageCode(item) ? languageNames[languageCode(item)!] : item),
    experience,
    status: value.status
  };
  if (value.educatorId) application.educatorId = value.educatorId;
  if (value.biography) application.biography = value.biography;
  if (value.timezone) application.timezone = value.timezone;
  if (claims.length) application.subjectClaims = claims;
  return application;
}

function mapBooking(value: WireBooking): BookingRequest {
  return {
    id: value.id,
    status: value.status,
    educatorId: value.educatorId,
    educatorName: value.educatorName,
    learnerId: value.learnerId,
    learnerName: value.learnerName,
    subjectId: value.subjectId,
    subjectName: value.subjectName,
    startAt: value.startAt,
    durationMinutes: value.durationMinutes,
    timezone: value.timezone,
    message: value.message,
    meetingLink: value.meetingLink,
    declineReason: value.declineReason,
    cancelReason: value.cancelReason,
    cancelledBy: value.cancelledBy,
    createdAt: value.createdAt,
    decidedAt: value.decidedAt,
    completedAt: value.completedAt
  };
}

function mapDocument(value: WireDocument): VerificationDocument {
  return {
    id: value.id,
    filename: value.filename,
    contentType: value.contentType as VerificationDocument['contentType'],
    sizeBytes: value.sizeBytes,
    uploadedAt: value.uploadedAt
  };
}

function mapReport(value: WireReport): Report {
  return {
    id: value.id,
    status: value.status,
    category: value.category,
    description: value.description,
    reporterId: value.reporterId,
    reporterEmail: value.reporterEmail,
    reportedUserId: value.reportedUserId,
    reportedUserEmail: value.reportedUserEmail,
    relatedBookingId: value.relatedBookingId,
    assignedAdminId: value.assignedAdminId,
    resolutionReason: value.resolutionReason,
    createdAt: value.createdAt,
    resolvedAt: value.resolvedAt
  };
}

function mapBlock(value: WireBlock): Block {
  return {
    id: value.id,
    blockedUserId: value.blockedUserId,
    blockedUserEmail: value.blockedUserEmail,
    createdAt: value.createdAt
  };
}

function mapAdminEducator(value: WireAdminEducator): AdminEducator {
  return {
    id: value.id,
    educatorId: value.educatorId,
    displayName: value.displayName,
    email: value.email,
    languages: value.languages.map(item => languageCode(item) ? languageNames[languageCode(item)!] : item),
    subjects: value.subjects.map(mapSubject),
    publicationStatus: value.publicationStatus,
    approvedAt: value.approvedAt
  };
}

function mapAuditLogEntry(value: WireAuditLogEntry): AuditLogEntry {
  return {
    id: value.id,
    actorEmail: value.actorEmail,
    action: value.action,
    targetType: value.targetType,
    targetId: value.targetId,
    reason: value.reason,
    occurredAt: value.occurredAt
  };
}

async function profile(): Promise<Profile> {
  const payload = await request<Profile | { profile: Profile }>('/profiles/me');
  return field<Profile>(payload, 'profile');
}

async function currentUser(authPayload?: WireUser): Promise<User> {
  const payload = authPayload || field<WireUser>(await request<WireUser | { user: WireUser }>('/auth/me'), 'user');
  const ownProfile = await profile().catch(() => undefined);
  return mapUser(payload, ownProfile);
}

async function listSubjects(): Promise<Subject[]> {
  const payload = await request<WireSubject[] | { subjects: WireSubject[] }>('/subjects');
  return field<WireSubject[]>(payload, 'subjects').map(mapSubject);
}

async function listEducators(params = ''): Promise<Educator[]> {
  const query = params || 'limit=30';
  const payload = await request<WireEducator[] | { items: WireEducator[] }>(`/public/educators?${query}`);
  return field<WireEducator[]>(payload, 'items').map(mapEducator);
}

export const api = {
  me: () => currentUser(),
  login: async (input: { email: string; password: string }) => {
    const payload = await request<{ user: WireUser; mfaRequired: boolean } | WireUser>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
    csrfToken = undefined;
    const authUser = field<WireUser>(payload, 'user');
    const mfaRequired = isRecord(payload) && Boolean(payload.mfaRequired);
    return { user: await currentUser(authUser), mfaRequired };
  },
  verifyMfa: async (code: string) => {
    await request<unknown>('/auth/mfa/totp', { method: 'POST', body: JSON.stringify({ code }) });
    return { user: await currentUser() };
  },
  register: async (input: { email: string; password: string; displayName: string; role: 'learner' | 'educator'; ageConfirmed?: boolean }) => {
    await ensureCsrf();
    if (!consentVersions) throw new ApiError(500, 'Consent configuration was unavailable.');
    const registration = {
      email: input.email,
      password: input.password,
      role: input.role,
      termsVersion: consentVersions.termsVersion,
      privacyVersion: consentVersions.privacyVersion,
      ...(input.role === 'educator' ? { age18Confirmed: input.ageConfirmed } : {})
    };
    const payload = await request<{ user: WireUser } | WireUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(registration)
    });
    csrfToken = undefined;
    return { user: mapUser(field<WireUser>(payload, 'user'), undefined, input.displayName) };
  },
  logout: async () => { await request<void>('/auth/logout', { method: 'POST' }); csrfToken = undefined; },
  profile,
  updateProfile: async (input: OnboardingInput) => {
    const payload = await request<Profile | { profile: Profile }>('/profiles/me/onboarding', { method: 'PUT', body: JSON.stringify(input) });
    return field<Profile>(payload, 'profile');
  },
  subjects: listSubjects,
  educators: listEducators,
  educator: async (slug: string) => {
    const items = await listEducators('limit=30');
    const educator = items.find(item => item.slug === slug || item.id === slug);
    if (!educator) throw new ApiError(404, 'This educator profile is no longer published.', 'educator_not_found');
    return educator;
  },
  myApplication: async () => {
    const [payload, catalog] = await Promise.all([
      request<WireApplication | { application: WireApplication | null } | null>('/educators/me/application'),
      listSubjects().catch(() => [] as Subject[])
    ]);
    const application = field<WireApplication | null>(payload, 'application');
    return application ? mapApplication(application, new Map(catalog.map(item => [item.id, item.name]))) : null;
  },
  saveApplication: async (input: EducatorDraftInput) => {
    const payload = await request<WireApplication | { application: WireApplication }>('/educators/me/application', { method: 'PUT', body: JSON.stringify(input) });
    return mapApplication(field<WireApplication>(payload, 'application'));
  },
  submitApplication: async () => {
    const payload = await request<WireApplication | { application: WireApplication }>('/educators/me/application/submit', { method: 'POST' });
    return mapApplication(field<WireApplication>(payload, 'application'));
  },
  adminApplications: async () => {
    const [payload, catalog] = await Promise.all([
      request<WireApplication[] | { items: WireApplication[] }>('/admin/educator-applications?limit=50'),
      listSubjects().catch(() => [] as Subject[])
    ]);
    const names = new Map(catalog.map(item => [item.id, item.name]));
    return field<WireApplication[]>(payload, 'items').map(item => mapApplication(item, names));
  },
  startReview: async (id: string) => {
    const payload = await request<WireApplication | { application: WireApplication }>(`/admin/educator-applications/${id}/start-review`, { method: 'POST' });
    return mapApplication(field<WireApplication>(payload, 'application'));
  },
  reviewApplication: async (id: string, input: { decision: 'approve' | 'reject' | 'request_changes'; reason: string }) => {
    const payload = await request<WireApplication | { application: WireApplication }>(`/admin/educator-applications/${id}/decision`, { method: 'POST', body: JSON.stringify(input) });
    return mapApplication(field<WireApplication>(payload, 'application'));
  },
  requestClass: async (input: BookingCreateInput) => {
    const payload = await request<WireBooking | { booking: WireBooking }>('/bookings', { method: 'POST', body: JSON.stringify(input) });
    return mapBooking(field<WireBooking>(payload, 'booking'));
  },
  myBookings: async (status?: BookingStatus) => {
    const payload = await request<WireBooking[] | { items: WireBooking[] }>(`/bookings/mine${status ? `?status=${status}` : ''}`);
    return field<WireBooking[]>(payload, 'items').map(mapBooking);
  },
  receivedBookings: async (status?: BookingStatus) => {
    const payload = await request<WireBooking[] | { items: WireBooking[] }>(`/bookings/received${status ? `?status=${status}` : ''}`);
    return field<WireBooking[]>(payload, 'items').map(mapBooking);
  },
  acceptBooking: async (id: string, meetingLink: string) => {
    const payload = await request<WireBooking | { booking: WireBooking }>(`/bookings/${id}/accept`, { method: 'POST', body: JSON.stringify({ meetingLink }) });
    return mapBooking(field<WireBooking>(payload, 'booking'));
  },
  declineBooking: async (id: string, reason: string) => {
    const payload = await request<WireBooking | { booking: WireBooking }>(`/bookings/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) });
    return mapBooking(field<WireBooking>(payload, 'booking'));
  },
  cancelBooking: async (id: string, reason: string) => {
    const payload = await request<WireBooking | { booking: WireBooking }>(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
    return mapBooking(field<WireBooking>(payload, 'booking'));
  },
  completeBooking: async (id: string) => {
    const payload = await request<WireBooking | { booking: WireBooking }>(`/bookings/${id}/complete`, { method: 'POST' });
    return mapBooking(field<WireBooking>(payload, 'booking'));
  },
  uploadApplicationDocument: async (file: File) => {
    const payload = await request<WireDocument | { document: WireDocument }>('/educators/me/application/documents', {
      method: 'POST',
      headers: { 'content-type': file.type, 'x-filename': encodeURIComponent(file.name) },
      body: file
    });
    return mapDocument(field<WireDocument>(payload, 'document'));
  },
  applicationDocuments: async () => {
    const payload = await request<WireDocument[] | { documents: WireDocument[] }>('/educators/me/application/documents');
    return field<WireDocument[]>(payload, 'documents').map(mapDocument);
  },
  deleteApplicationDocument: (id: string) => request<void>(`/educators/me/application/documents/${id}`, { method: 'DELETE' }),
  adminApplicationDocuments: async (applicationId: string) => {
    const payload = await request<WireDocument[] | { documents: WireDocument[] }>(`/admin/educator-applications/${applicationId}/documents`);
    return field<WireDocument[]>(payload, 'documents').map(mapDocument);
  },
  documentAccessUrl: async (applicationId: string, documentId: string) => {
    const payload = await request<DocumentAccessToken | { access: DocumentAccessToken }>(`/admin/educator-applications/${applicationId}/documents/${documentId}/access`, { method: 'POST' });
    const access = field<DocumentAccessToken>(payload, 'access');
    return `${API_BASE}/admin/educator-applications/${applicationId}/documents/${documentId}/content?token=${encodeURIComponent(access.token)}`;
  },
  fileReport: async (input: ReportCreateInput) => {
    const payload = await request<WireReport | { report: WireReport }>('/reports', { method: 'POST', body: JSON.stringify(input) });
    return mapReport(field<WireReport>(payload, 'report'));
  },
  blockUser: async (blockedUserId: string) => {
    const payload = await request<WireBlock | { block: WireBlock }>('/blocks', { method: 'POST', body: JSON.stringify({ blockedUserId }) });
    return mapBlock(field<WireBlock>(payload, 'block'));
  },
  unblockUser: (id: string) => request<void>(`/blocks/${id}`, { method: 'DELETE' }),
  myBlocks: async () => {
    const payload = await request<WireBlock[] | { blocks: WireBlock[] }>('/blocks/mine');
    return field<WireBlock[]>(payload, 'blocks').map(mapBlock);
  },
  adminEducators: async () => {
    const payload = await request<WireAdminEducator[] | { items: WireAdminEducator[] }>('/admin/educators?limit=50');
    return field<WireAdminEducator[]>(payload, 'items').map(mapAdminEducator);
  },
  suspendEducator: (id: string, reason: string) => request<void>(`/admin/educators/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reinstateEducator: (id: string, reason: string) => request<void>(`/admin/educators/${id}/reinstate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  auditLog: async () => {
    const payload = await request<WireAuditLogEntry[] | { items: WireAuditLogEntry[] }>('/admin/audit-log?limit=50');
    return field<WireAuditLogEntry[]>(payload, 'items').map(mapAuditLogEntry);
  },
  adminReports: async (status?: ReportStatus) => {
    const payload = await request<WireReport[] | { items: WireReport[] }>(`/admin/reports?limit=50${status ? `&status=${status}` : ''}`);
    return field<WireReport[]>(payload, 'items').map(mapReport);
  },
  assignReport: async (id: string) => {
    const payload = await request<WireReport | { report: WireReport }>(`/admin/reports/${id}/assign`, { method: 'POST' });
    return mapReport(field<WireReport>(payload, 'report'));
  },
  resolveReport: async (id: string, reason: string, suspendUser: boolean) => {
    const payload = await request<WireReport | { report: WireReport }>(`/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ reason, suspendUser }) });
    return mapReport(field<WireReport>(payload, 'report'));
  },
  dismissReport: async (id: string, reason: string) => {
    const payload = await request<WireReport | { report: WireReport }>(`/admin/reports/${id}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) });
    return mapReport(field<WireReport>(payload, 'report'));
  },
};

export type { ApiEnvelope };
