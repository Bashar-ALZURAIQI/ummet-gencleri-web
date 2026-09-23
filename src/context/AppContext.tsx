import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type ServiceResult } from '../lib/supabase';
import { i18n } from '../i18n/config.ts';
import { overlayLocalizedCmsPayload } from '../domain/cmsPublicRead.ts';
import {
  listAssignableMembers,
  listPresidentAssignableMembers,
  listPublicExecutiveDirectory,
  loadSessionIdentity,
  subscribeToOwnProfileAndAssignment,
  transferExecutiveAssignment,
  revokeExecutiveAssignment as revokeExecutiveAssignmentService,
  removeMemberMembership,
  updateOwnProfile as updateOwnProfileService,
  changeOwnPassword as changeOwnPasswordService,
} from '../services/accountService';
import {
  uploadOwnAvatar as uploadOwnAvatarService,
  removeOwnAvatar as deleteOwnAvatarService,
} from '../services/avatarService';
import {
  bindPresidentManagedMemberAvatar,
  registerManagedAsset,
  removeManagedAssetObject,
  setManagedAssetStatus,
  uploadManagedAsset as uploadManagedAssetService,
  type ManagedAssetReference,
} from '../services/managedAssetService';
import { replacePublishedSiteLogo } from '../services/siteBrandingService';
import {
  loadPublishedSiteContent,
} from '../services/siteContentService';
import {
  loadFaqContent,
  loadStudentGuideContent,
  createPublishedEvent as createPublishedEventService,
  publishOwnCommittee,
  publishOwnCommitteeFields,
  publishCmsTarget,
  updateOwnedEvent as updateOwnedEventService,
  createGalleryAlbum as createGalleryAlbumService,
  updateOwnedGalleryAlbum as updateOwnedGalleryAlbumService,
  appendOwnedGalleryMedia as appendOwnedGalleryMediaService,
  listOwnEventIds as listOwnEventIdsService,
  listOwnAlbumIds as listOwnAlbumIdsService,
} from '../services/sectionContentService';
import {
  listVisibleContactMessages,
  markContactMessageRead as markContactMessageReadService,
  replyToContactMessage as replyToContactMessageService,
  sendPendingContactReplyEmail,
  submitContactMessage,
  type ContactMessageRecord,
} from '../services/contactMessagingService';
import type { ManagedAssetUsage } from '../domain/managedAssets';
import {
  replaceSiteLogoAtomically,
  type SiteLogoReplacementResult,
} from '../domain/siteBrandingLifecycle';
import {
  listEditRequests,
  submitStructuredSiteEditRequest,
  approveStructuredSiteEditRequest,
  rejectStructuredSiteEditRequest,
  submitStructuredProfileEditRequest,
  approveStructuredProfileEditRequest,
  rejectStructuredProfileEditRequest,
  type EditRequest,
} from '../services/editRequestService';
import {
  decideStudentApplication,
  listVisibleStudentApplications,
  scheduleStudentApplicationInterview,
} from '../services/applicationService';
import {
  listApplicationEmailNotifications,
  retryApplicationEmailNotification as retryApplicationEmailNotificationService,
  sendApplicationNotification,
} from '../services/applicationEmailService';
import { detachCurrentPushBindingBeforeLogout } from '../services/pushBrowserService';
import {
  requestPasswordReset as requestPasswordResetService,
  updateRecoveredPassword as updateRecoveredPasswordService,
} from '../services/passwordRecoveryService';
import type {
  ApplicationEmailEventType,
  ApplicationEmailNotification,
} from '../domain/applicationEmailNotification';
import {
  deliverApplicationEmailAfterCommit,
  startPresidentApplicationRefresh,
} from '../domain/applicationEmailWorkflow';
import { canUseMemberFeatures, resolveStudentAccess, type StudentAccessState } from '../domain/studentAccess';
import { withProgramsAchievements } from '../domain/programsAchievements.ts';
import { executeMemberRemoval } from '../domain/memberRemoval';
import {
  createEditedApprovalNote,
  createSiteEditEnvelope,
  parseEditRequestEnvelope,
  mapDecidedEditRequestsToHistory,
  mapEditRequestToProfileEdit,
  mapEditRequestToSiteEdit,
  normalizeLegacyHistory,
} from '../domain/editRequestHistory';
import { visibleHistoryFor } from '../domain/accountIdentity';
import { deriveApprovedSiteValue } from '../domain/editApprovalPolicy';
import {
  projectExecutiveContentSnapshot,
  type ExecutiveContentSnapshot,
} from '../domain/executiveEditWorkflow';
import {
  runExecutiveEditApproval,
  runExecutiveEditRejection,
  runExecutiveEditSubmission,
} from '../domain/executiveEditCoordinator';
import {
  cmsAuthorityForTarget,
  selectCmsExpectedVersion,
} from '../domain/cmsTargets';
import { canAccessContactInbox } from '../domain/contactMessagingPolicy';
import {
  canPublishOwnProfileOperationResult,
  createOwnProfileOperations,
  type OwnProfileOperationKind,
  type OwnProfileOperationResult,
  type OwnProfileOperationResults,
  type OwnProfileOperationOwnership,
} from '../domain/ownProfileOperations';
import type {
  CurrentUser as SupabaseCurrentUser,
  MappedSessionIdentity,
} from '../domain/supabaseMappers';
import {
  createBackgroundProfileRefreshCoordinator,
  type BackgroundProfileOwnership,
} from '../domain/backgroundProfileRefresh';
import {
  ConfirmedAuthOwnerStore,
  type ConfirmedAuthOwner,
} from '../domain/confirmedAuthOwner';
import {
  AuthEpochController,
  classifyAuthEvent,
  resolveOwnedOperationEpoch,
} from '../domain/authEpoch';
import {
  buildPasswordRecoveryRedirectUrl,
  reducePasswordRecoveryGate,
  type PasswordRecoveryGate,
  type PasswordRecoveryResult,
} from '../domain/passwordRecovery';
import { classifySignupResult } from '../domain/signupResult';
import {
  buildAccountDirectoryDisplay,
  mergeInstitutionalCommitteeContent,
  synchronizeProfileIdentityByUserId,
  stripPrivateExecutiveEmailsForCache,
  stripPrivateLoginEmailsForCache,
} from '../domain/accountDirectoryDisplay';
import {
  canManageCouncilContent,
  prepareOwnExecutiveProfileUpdate,
  resolveOwnExecutiveProfileTarget,
} from '../domain/executiveProfileUpdatePolicy';
import {
  executeExecutiveTransfer,
  type TransferMemberRoleResult,
} from '../domain/executiveTransfer';
import { executeExecutiveRevocation } from '../domain/executiveRevocation';
import {
  type AdminTab,
  urlToView,
  createHistoryNavigator,
  resolveSessionAuthNavigation,
  type SessionNavigationIntent,
} from '../domain/appNavigation';
import {
  saveLastAdminTab,
  loadLastAdminTab,
  clearLastAdminTab,
} from '../domain/adminTabMemory';
import {
  createIdentitySubscriptionGeneration,
  reduceRealtimeWarning,
} from '../domain/realtimeIdentityGuard';
import {
  mockEvents,
  mockNews,
  mockStudents,
  mockSuggestions,
  mockPlans,
  mockReports,
  mockCommittees,
  type UEvent,
  type NewsItem,
  type Student,
  type Suggestion,
  type SuggestionStatus,
  type SuggestionTargetRole,
  type SuggestionResponse,
  type AdminPlan,
  type AdminReport,
  type CommitteeId,
  type UserRole,
  ROLE_LABEL,
  COMMITTEE_ROLE,
  isLeadershipRole,
  type BoardMember,
  type Committee,
  type CommitteeMember,
  type StudentApplication,
  type InterviewInfo,
  type PendingProfileEdit,
  type PendingSiteEdit,
  type SiteEditSubmit,
  type SiteEditDiff,
  type SiteEditTarget,
  type EditsHistoryEntry,
  type ProgramsContent,
  DEFAULT_PROGRAMS_CONTENT,
  DEFAULT_GUIDE_QUICK_INFO,
  type GuideSectionData,
  initialGuideSections,
  type GalleryAlbum,
  type GalleryMedia,
  type GalleryCategory,
  initialGalleryAlbums,
  initialGalleryCategories,
  type FAQCategoryData,
  initialFAQCategories,
  type ContactCardData,
  initialContactCards,
  type ContactMapData,
  DEFAULT_CONTACT_MAP,
} from '../data/mockData';
import {
  emailKey,
  safeStr,
  safeArray,
  asRecord,
} from '../utils/profileNormalize';

export type View =
  | { kind: 'home' }
  | { kind: 'about' }
  | { kind: 'programs' }
  | { kind: 'contact' }
  | { kind: 'gallery' }
  | { kind: 'news' }
  | { kind: 'guide' }
  | { kind: 'faq' }
  | { kind: 'login'; returnTo?: string }
  | { kind: 'register' }
  | { kind: 'forgot-password' }
  | { kind: 'update-password' }
  | { kind: 'student-dashboard' }
  | { kind: 'admin'; tab?: AdminTab }
  | { kind: 'board' }
  | { kind: 'committee'; committeeId: CommitteeId };

export type { AdminTab };

export type CurrentUser = SupabaseCurrentUser;

export interface UnifiedMember {
  id: string;
  name: string;
  email: string;
  university: string;
  major: string;
  year: string;
  phone?: string;
  photo: string;
  updatedAt?: string;
  role: UserRole;
  committee?: CommitteeId;
  joinedAt: string;
  status: 'active' | 'inactive';
}

function seedMembersFromCommittees(committees: typeof mockCommittees): UnifiedMember[] {
  const out: UnifiedMember[] = [];
  const seen = new Set<string>();
  for (const c of committees) {
    if (c.head?.name) {
      const key = c.head.id || `legacy-executive:${c.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: key,
          name: c.head.name,
          email: '',
          university: c.head.university ?? '—',
          major: c.head.major ?? '—',
          year: c.head.year ?? '—',
          phone: c.head.phone ?? '',
          photo: c.head.photo || '',
          role: COMMITTEE_ROLE[c.id] ?? 'STUDENT',
          committee: c.id,
          joinedAt: '—',
          status: 'active',
        });
      }
    }
    for (const m of c.members) {
      if (m?.name) {
        const key = (m.id || m.name).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            id: m.id || 'm-' + key,
            name: m.name,
            email: '',
            university: m.university ?? '—',
            major: m.major ?? '—',
            year: m.year ?? '—',
            phone: m.phone ?? '',
            photo: m.photo || '',
            role: 'STUDENT',
            committee: c.id,
            joinedAt: '—',
            status: 'active',
          });
        }
      }
    }
  }
  return out;
}

/**
 * Sanitizes any record (from LocalStorage / Supabase) into a guaranteed
 * complete UnifiedMember — empty/missing fields become safe defaults instead
 * of crashing `.toLowerCase()` / `.map()` callers downstream.
 */
function normalizeMember(raw: unknown): UnifiedMember {
  const r = asRecord(raw);
  return {
    id: safeStr(r.id) || 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
    name: safeStr(r.name),
    email: safeStr(r.email),
    university: safeStr(r.university) || '—',
    major: safeStr(r.major) || '—',
    year: safeStr(r.year) || '—',
    phone: safeStr(r.phone),
    photo: safeStr(r.photo),
    updatedAt: safeStr(r.updatedAt),
    role: (['PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD', 'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD', 'STUDENT'] as UserRole[]).includes(r.role as UserRole)
      ? (r.role as UserRole)
      : 'STUDENT',
    committee: r.committee as CommitteeId | undefined,
    joinedAt: safeStr(r.joinedAt) || '—',
    status: r.status === 'inactive' ? 'inactive' : 'active',
  };
}

/** Sanitizes a loaded student so `registeredEvents` and string fields always exist. */
function normalizeStudent(raw: unknown): Student {
  const r = asRecord(raw);
  return {
    id: safeStr(r.id) || 's' + Date.now() + Math.random().toString(36).slice(2, 6),
    name: safeStr(r.name),
    email: safeStr(r.email),
    university: safeStr(r.university) || 'غير محدد',
    major: safeStr(r.major) || 'غير محدد',
    year: safeStr(r.year) || 'السنة الأولى',
    joinedAt: safeStr(r.joinedAt),
    registeredEvents: safeArray<string>(r.registeredEvents).filter((x): x is string => typeof x === 'string'),
    status: r.status === 'active' ? 'active' : 'inactive',
    phone: safeStr(r.phone),
  };
}

/** Sanitizes a committee loaded from `app_executive` / `ummet_committees`. */
function normalizeCommittee(raw: unknown): (typeof mockCommittees)[number] {
  const r = asRecord(raw);
  const headRaw = asRecord(r.head);
  return {
    id: safeStr(r.id) as CommitteeId,
    name: safeStr(r.name),
    shortName: safeStr(r.shortName),
    icon: safeStr(r.icon) || 'Crown',
    color: safeStr(r.color) || 'from-navy-700 to-navy-950',
    description: safeStr(r.description),
    responsibilities: safeArray<unknown>(r.responsibilities).map(safeStr).filter(Boolean),
    head: {
      id: safeStr(headRaw.id),
      name: safeStr(headRaw.name),
      role: safeStr(headRaw.role),
      bio: safeStr(headRaw.bio),
      photo: safeStr(headRaw.photo),
      email: '',
      phone: safeStr(headRaw.phone),
      university: safeStr(headRaw.university),
      major: safeStr(headRaw.major),
      year: safeStr(headRaw.year),
      updatedAt: safeStr(headRaw.updatedAt),
    },
    members: safeArray<unknown>(r.members).map((mRaw) => {
      const m = asRecord(mRaw);
      return {
        id: safeStr(m.id),
        name: safeStr(m.name),
        position: safeStr(m.position),
        photo: safeStr(m.photo),
        phone: safeStr(m.phone),
        university: safeStr(m.university),
        major: safeStr(m.major),
        year: safeStr(m.year),
      };
    }),
    stats: safeArray<unknown>(r.stats).map((sRaw) => {
      const s = asRecord(sRaw);
      return { label: safeStr(s.label), value: safeStr(s.value) };
    }),
    vision: safeStr(r.vision),
    goals: safeStr(r.goals),
  };
}

/**
 * Sanitize a raw ExecutiveEntry from localStorage so every field is guaranteed
 * to exist. Corrupt or partially-written entries are healed on read, and
 * completely malformed data is silently replaced by defaults.
 */
function sanitizeExecutiveEntry(raw: unknown): ExecutiveEntry {
  const r = asRecord(raw);
  const h = asRecord(r.head);
  return {
    committeeId: safeStr(r.committeeId) as CommitteeId,
    head: {
      id: safeStr(h.id),
      name: safeStr(h.name),
      role: safeStr(h.role),
      bio: safeStr(h.bio),
      photo: safeStr(h.photo),
      email: '',
      phone: safeStr(h.phone),
      university: safeStr(h.university),
      major: safeStr(h.major),
      year: safeStr(h.year),
      updatedAt: safeStr(h.updatedAt),
    },
    members: safeArray<unknown>(r.members).map((mRaw) => {
      const m = asRecord(mRaw);
      return {
        id: safeStr(m.id),
        name: safeStr(m.name),
        position: safeStr(m.position),
        photo: safeStr(m.photo),
        phone: safeStr(m.phone),
        university: safeStr(m.university),
        major: safeStr(m.major),
        year: safeStr(m.year),
      };
    }),
  };
}

export interface GeneralInfo {
  vision: string;
  goals: string;
  studentStats: string;
  contactLinks: { label: string; url: string }[];
}

export type AdminSection =
  | 'general'
  | 'board'
  | 'events'
  | 'news'
  | 'members'
  | 'applications'
  | 'plans'
  | 'gallery'
  | 'guide'
  | 'stats'
  | 'homepage'
  | 'about-page';

export interface AboutContent {
  header: { badge: string; title: string; description: string };
  story: {
    badge: string;
    title: string;
    paragraphs: string[];
    images: string[];
  };
  mission: {
    badge: string;
    title: string;
    cards: { icon: string; title: string; text: string }[];
  };
  goals: {
    badge: string;
    title: string;
    cards: { icon: string; title: string; desc: string }[];
  };
  cta: {
    icon: string;
    title: string;
    description: string;
    buttonText: string;
  };
}

export interface SiteContent {
  brand: {
    name: string;
    nameTr: string;
    logoIcon: string;
    logoUrl?: string;
    logoPath?: string;
  };
  footer: {
    phone: string;
    email: string;
    address: string;
    copyright: string;
    social: { facebook: string; twitter: string; instagram: string; youtube: string };
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    description: string;
    primaryBtn: string;
    secondaryBtn: string;
    tertiaryBtn: string;
    image: string;
    badge1: { value: string; label: string; icon: string };
    badge2: { value: string; label: string; icon: string };
  };
  stats: { value: number; label: string; icon: string }[];
  about: {
    badge: string;
    title: string;
    description: string;
    image: string;
    imageBadge: { value: string; label: string };
    features: { icon: string; title: string; desc: string }[];
  };
  boardPreview: {
    title: string;
    subtitle: string;
    description: string;
    memberIds: string[];
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function canEditSection(user: CurrentUser | null, section: AdminSection): boolean {
  if (!user) return false;
  if (user.role === 'PRESIDENT') return true;
  const committee = user.committee;
  if (committee === 'media') return ['gallery', 'homepage', 'about-page', 'plans'].includes(section);
  if (committee === 'academic') return ['guide', 'events', 'plans'].includes(section);
  if (committee === 'activities') return ['events', 'plans'].includes(section);
  if (committee === 'finance') return ['plans'].includes(section);
  if (committee === 'supervisory') return ['members', 'plans'].includes(section);
  if (committee === 'vice-presidency') return ['plans', 'members', 'profile'].includes(section);
  if (committee === 'presidency') return ['plans'].includes(section);
  return false;
}

interface SiteFieldUpdate {
  path: string;
  value: string | number;
  label?: string;
}

interface AboutFieldUpdate {
  path: string;
  value: unknown;
  label?: string;
}

type PublishedContentTarget = SiteEditTarget | 'plans' | 'reports' | 'committees';

interface AppContextValue {
  view: View;
  setView: (v: View | ((prev: View) => View)) => void;
  navigate: (view: View, options?: { replace?: boolean }) => void;
  events: UEvent[];
  setEvents: React.Dispatch<React.SetStateAction<UEvent[]>>;
  news: NewsItem[];
  setNews: React.Dispatch<React.SetStateAction<NewsItem[]>>;
  students: Student[];
  suggestions: Suggestion[];
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  plans: AdminPlan[];
  setPlans: React.Dispatch<React.SetStateAction<AdminPlan[]>>;
  reports: AdminReport[];
  setReports: React.Dispatch<React.SetStateAction<AdminReport[]>>;
  currentStudent: Student | null;
  currentUser: CurrentUser | null;
  authInitializing: boolean;
  identityRefreshing: boolean;
  authError: string | null;
  passwordRecoveryReady: boolean;
  realtimeWarning: string | null;
  contentLoading: boolean;
  contentError: string | null;
  contentVersion: number;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<PasswordRecoveryResult>;
  updateRecoveredPassword: (password: string) => Promise<PasswordRecoveryResult>;
  finishPasswordRecovery: () => Promise<void>;
  registerForEvent: (eventId: string) => void;
  unregisterFromEvent: (eventId: string) => void;
  contactMessages: ContactMessage[];
  contactMessagesLoading: boolean;
  contactMessagesError: string | null;
  addContactMessage: (m: { name: string; email: string; subject: string; body: string }) => Promise<{ ok: boolean; error?: string }>;
  markContactMessageRead: (messageId: string) => Promise<{ ok: boolean; error?: string }>;
  replyToContactMessage: (messageId: string, replyText: string) => Promise<{ ok: boolean; error?: string; emailWarning?: string }>;
  retryContactReplyEmail: (replyId: string) => Promise<{ ok: boolean; error?: string }>;
  canAccessCommittee: (committeeId: CommitteeId) => boolean;
  canAccessAdmin: () => boolean;
  canEditSection: (section: AdminSection) => boolean;
  refreshPublishedLocalizations: () => Promise<void>;
  generalInfo: GeneralInfo;
  setGeneralInfo: React.Dispatch<React.SetStateAction<GeneralInfo>>;
  siteContent: SiteContent;
  setSiteContent: React.Dispatch<React.SetStateAction<SiteContent>>;
  updateSiteField: (path: string, value: string | number, label?: string) => Promise<boolean>;
  updateSiteFields: (fields: SiteFieldUpdate[]) => Promise<boolean>;
  aboutContent: AboutContent;
  setAboutContent: React.Dispatch<React.SetStateAction<AboutContent>>;
  updateAboutField: (path: string, value: unknown, label?: string) => Promise<boolean>;
  updateAboutFields: (fields: AboutFieldUpdate[]) => Promise<boolean>;
  guideSections: GuideSectionData[];
  setGuideSections: React.Dispatch<React.SetStateAction<GuideSectionData[]>>;
  galleryAlbums: GalleryAlbum[];
  setGalleryAlbums: React.Dispatch<React.SetStateAction<GalleryAlbum[]>>;
  galleryCategories: GalleryCategory[];
  setGalleryCategories: React.Dispatch<React.SetStateAction<GalleryCategory[]>>;
  faqCategories: FAQCategoryData[];
  setFaqCategories: React.Dispatch<React.SetStateAction<FAQCategoryData[]>>;
  contactCards: ContactCardData[];
  setContactCards: React.Dispatch<React.SetStateAction<ContactCardData[]>>;
  contactMap: ContactMapData;
  setContactMap: React.Dispatch<React.SetStateAction<ContactMapData>>;
  committees: typeof mockCommittees;
  setCommittees: React.Dispatch<React.SetStateAction<typeof mockCommittees>>;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  members: UnifiedMember[];
  setMembers: React.Dispatch<React.SetStateAction<UnifiedMember[]>>;
  applications: StudentApplication[];
  applicationsLoading: boolean;
  applicationEmailNotifications: ApplicationEmailNotification[];
  refreshApplicationEmailNotifications: () => Promise<void>;
  retryApplicationEmailNotification: (applicationId: string, eventType: ApplicationEmailEventType) => Promise<{ ok: boolean; error?: string }>;
  myApplication: StudentApplication | null;
  studentAccess: StudentAccessState;
  registerWithApplication: (name: string, email: string, password: string, university: string, major: string, year: string, phone: string, motivation: string) => Promise<{ ok: boolean; error?: string; requiresEmailConfirmation?: boolean; emailWarning?: string }>;
  scheduleInterview: (applicationId: string, interview: InterviewInfo) => Promise<{ ok: boolean; error?: string; emailWarning?: string }>;
  decideApplication: (applicationId: string, status: 'accepted' | 'rejected', rejectionReason?: string) => Promise<{ ok: boolean; error?: string; emailWarning?: string }>;
  respondToSuggestion: (id: string, reply: string, status: SuggestionStatus) => boolean;
  getVisibleSuggestions: () => Suggestion[];
  canRespondToSuggestion: (suggestion: Suggestion) => boolean;
  pendingProfileEdits: PendingProfileEdit[];
  submitProfileEdit: (
    committeeId: CommitteeId,
    snapshot: PendingProfileEdit['snapshot'],
  ) => Promise<
    | { ok: true; data: PendingProfileEdit }
    | { ok: false; error: string; diagnostic?: unknown }
  >;
  approveProfileEdit: (editId: string) => Promise<{ ok: boolean; error?: string }>;
  approveProfileEditWithChanges: (editId: string, revised?: ExecutiveContentSnapshot, decisionNote?: string) => Promise<{ ok: boolean; error?: string }>;
  rejectProfileEdit: (editId: string) => Promise<{ ok: boolean; error?: string }>;
  pendingSiteEdits: PendingSiteEdit[];
  editsHistory: EditsHistoryEntry[];
  editRequestsLoading: boolean;
  editRequestsError: string | null;
  clearEditRequestsError: () => void;
  programsContent: ProgramsContent;
  setProgramsContent: React.Dispatch<React.SetStateAction<ProgramsContent>>;
  guideQuickInfo: string;
  setGuideQuickInfo: React.Dispatch<React.SetStateAction<string>>;
  submitSiteEdit: (input: SiteEditSubmit) => Promise<PendingSiteEdit | null>;
  approveSiteEdit: (editId: string) => Promise<{ ok: boolean; error?: string }>;
  rejectSiteEdit: (editId: string) => Promise<{ ok: boolean; error?: string }>;
  approveSiteEditWithChanges: (editId: string, revisedDiffs: SiteEditDiff[]) => Promise<{ ok: boolean; error?: string }>;
  updatePresidentProfile: (updates: Partial<Pick<BoardMember, 'name' | 'photo' | 'bio'>>) => void;
  transferMemberRole: (memberId: string, role: UserRole) => Promise<TransferMemberRoleResult>;
  revokeExecutiveAssignment: (memberId: string) => Promise<{ ok: boolean; error?: string; revokedMember?: { id: string; name: string } }>;
  getRoleHolder: (role: UserRole) => UnifiedMember | undefined;
  updateBoardHead: (committeeId: CommitteeId, data: Partial<Pick<BoardMember, 'name' | 'bio' | 'photo' | 'email' | 'phone' | 'university' | 'major' | 'year'>>) => Promise<OwnProfileOperationResult>;
  removeMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>;
  updateMemberProfile: (memberId: string, data: Partial<{ name: string; email: string; university: string; major: string; year: string; phone: string; photo: string }>) => void;
  updateCommitteeVision: (committeeId: CommitteeId, data: { vision?: string; goals?: string }) => void;
  updateOwnProfile: (data: Record<string, unknown>) => Promise<OwnProfileOperationResult>;
  uploadOwnAvatar: (file: File) => Promise<OwnProfileOperationResult>;
  deleteOwnAvatar: () => Promise<OwnProfileOperationResult>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<OwnProfileOperationResult>;
  ownProfileOperationResults: OwnProfileOperationResults;
  clearOwnProfileOperationResult: (kind: OwnProfileOperationKind) => void;
  uploadManagedFile: (
    usage: ManagedAssetUsage,
    file: File,
    onProgress?: (percentage: number) => void,
    targetOwnerId?: string,
  ) => Promise<ServiceResult<ManagedAssetReference>>;
  replaceSiteLogo: (
    file: File,
    onProgress?: (percentage: number) => void,
  ) => Promise<SiteLogoReplacementResult>;
  replaceManagedMemberAvatar: (
    targetUserId: string,
    expectedOldPath: string | null,
    asset: ManagedAssetReference,
  ) => Promise<ServiceResult<{ oldPath: string | null; avatarPath: string }>>;
  savePublishedSiteTarget: (
    target: PublishedContentTarget,
    value: unknown,
  ) => Promise<{ ok: boolean; error?: string }>;
  saveOwnCommitteeContent: (
    committeeId: CommitteeId,
    snapshot: ExecutiveContentSnapshot,
  ) => Promise<{ ok: boolean; error?: string }>;
  saveOwnCommitteeVision: (
    committeeId: CommitteeId,
    vision: string,
    goals: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  createPublishedEvent: (event: UEvent) => Promise<{ ok: boolean; error?: string }>;
  updateOwnedEvent: (eventId: string, eventPatch: Partial<UEvent>) => Promise<{ ok: boolean; error?: string }>;
  deleteOwnedEvent: (eventId: string) => Promise<{ ok: boolean; error?: string; eventData?: unknown }>;
  createGalleryAlbum: (album: GalleryAlbum) => Promise<{ ok: boolean; error?: string }>;
  updateOwnedGalleryAlbum: (albumId: string, albumPatch: Partial<GalleryAlbum>) => Promise<{ ok: boolean; error?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteOwnedGalleryAlbum: (albumId: string) => Promise<{ ok: boolean; error?: string; albumData?: any }>;
  appendOwnedGalleryMedia: (albumId: string, media: GalleryMedia) => Promise<{ ok: boolean; error?: string }>;
  deleteOwnedGalleryMedia: (albumId: string, mediaId: string) => Promise<{ ok: boolean; error?: string; mediaUrl?: string }>;
  listOwnEventIds: () => Promise<{ ok: boolean; data?: string[]; error?: string }>;
  listOwnAlbumIds: () => Promise<{ ok: boolean; data?: string[]; error?: string }>;
  canonicalSiteContent?: SiteContent;
  canonicalAboutContent?: AboutContent;
  canonicalNews?: NewsItem[];
  canonicalEvents?: UEvent[];
  canonicalFaqCategories?: FAQCategoryData[];
  canonicalGuideSections?: GuideSectionData[];
  canonicalGuideQuickInfo?: string;
  canonicalGalleryAlbums?: GalleryAlbum[];
  canonicalGalleryCategories?: GalleryCategory[];
  canonicalCommittees?: typeof mockCommittees;
  canonicalPlans?: AdminPlan[];
  canonicalReports?: AdminReport[];
  canonicalProgramsContent?: ProgramsContent;
  canonicalContactCards?: ContactCardData[];
  canonicalContactMap?: ContactMapData;
  canonicalGeneralInfo?: GeneralInfo;
}

const EMPTY_OWN_PROFILE_OPERATION_RESULTS: OwnProfileOperationResults = {
  profile: null,
  avatar: null,
  password: null,
};

export type ContactMessage = ContactMessageRecord;

// Single source of truth keys (LocalStorage) — every mutation writes here,
// and every load reads here FIRST before falling back to defaults.
const LS_MEMBERS_KEY = 'app_members';
const LS_EXECUTIVE_KEY = 'app_executive';
const LS_SUGGESTIONS_KEY = 'app_suggestions';
const LS_SITE_CONTENT_KEY = 'app_site_content';
const LS_EDITS_HISTORY_KEY = 'app_edits_history';
const LS_LEGACY_HISTORY_CACHE_KEY = 'app_edits_history_legacy_v1';
const LS_HISTORY_MIGRATION_KEY = 'app_edits_history_migration';
const HISTORY_MIGRATION_VERSION = '2';
// Standalone live keys for news / events / gallery (written alongside the bundle)
const LS_NEWS_KEY = 'app_news';
const LS_EVENTS_KEY = 'app_events';
const LS_GALLERY_KEY = 'app_gallery';
// Legacy keys (migrated into the new ones on first load)
const LS_LEGACY_MEMBERS_KEY = 'ummet_members';
const LS_STUDENTS_KEY = 'ummet_registered_students';

/** Executives persisted under `app_executive` — heads + members per committee. */
export interface ExecutiveEntry {
  committeeId: CommitteeId;
  head: BoardMember;
  members: CommitteeMember[];
}

/** The live published content mirror — written under `app_site_content` on every change. */
interface SiteContentBundle {
  siteContent?: SiteContent;
  aboutContent?: AboutContent;
  generalInfo?: GeneralInfo;
  programsContent?: ProgramsContent;
  guideQuickInfo?: string;
  guideSections?: GuideSectionData[];
  galleryAlbums?: GalleryAlbum[];
  galleryCategories?: GalleryCategory[];
  faqCategories?: FAQCategoryData[];
  contactCards?: ContactCardData[];
  contactMap?: ContactMapData;
  events?: UEvent[];
  news?: NewsItem[];
  plans?: AdminPlan[];
  reports?: AdminReport[];
  committees?: Committee[];
}

/** Minimal record shape used by the generic site-edit apply helpers. */

const safeParse = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { /* ignore */ return null; }
};

/**
 * Deep-cleans any object/array before persistence so that no field with a
 * blank or whitespace-only value (`trim() === ''`) ever reaches LocalStorage.
 * Undefined and empty-string fields are dropped; `null` and 0 are kept.
 */
const stripBlankValues = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripBlankValues);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (typeof v === 'string') {
        if (v.trim() === '') continue;
        out[k] = v;
      } else {
        out[k] = stripBlankValues(v);
      }
    }
    return out;
  }
  return value;
};

const safeWrite = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(stripBlankValues(value))); } catch { /* ignore */ }
};

const loadLegacyHistoryOnce = (): EditsHistoryEntry[] => {
  const cached = safeParse<unknown>(LS_LEGACY_HISTORY_CACHE_KEY);
  if (Array.isArray(cached)) return normalizeLegacyHistory(cached);
  if (safeParse<string>(LS_HISTORY_MIGRATION_KEY) === HISTORY_MIGRATION_VERSION) return [];

  const legacy = normalizeLegacyHistory(safeParse<unknown>(LS_EDITS_HISTORY_KEY));
  safeWrite(LS_LEGACY_HISTORY_CACHE_KEY, legacy);
  safeWrite(LS_HISTORY_MIGRATION_KEY, HISTORY_MIGRATION_VERSION);
  return legacy;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Migrates legacy suggestion objects (body/adminReply) into the new targeted model. */
const normalizeSuggestion = (s: Partial<Suggestion> & { body?: string; adminReply?: string; repliedAt?: string }): Suggestion => ({
  id: s.id ?? 'sg' + Date.now(),
  studentId: s.studentId ?? '',
  studentName: s.studentName ?? 'طالب',
  studentEmail: s.studentEmail,
  studentUniversity: s.studentUniversity,
  studentMajor: s.studentMajor,
  targetRole: (s.targetRole as SuggestionTargetRole | undefined) ?? 'PRESIDENT',
  category: s.category ?? 'اقتراح',
  title: s.title ?? '',
  content: s.content ?? s.body ?? '',
  status: (s.status as SuggestionStatus | undefined) ?? 'new',
  createdAt: s.createdAt ?? todayStr(),
  responses: Array.isArray(s.responses)
    ? s.responses
    : s.adminReply
      ? [{ id: 'r0', by: 'الإدارة', byRole: 'الإدارة', text: s.adminReply, at: s.repliedAt ?? s.createdAt ?? todayStr() }]
      : [],
});

const AppContext = createContext<AppContextValue | null>(null);

const browserAuthTimerScheduler = {
  schedule: (callback: () => void) => setTimeout(callback, 0),
  cancel: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      return urlToView(window.location.href).view;
    }
    return { kind: 'home' };
  });
  const [events, setEvents] = useState<UEvent[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    const local = safeParse<UEvent[]>(LS_EVENTS_KEY);
    if (Array.isArray(local) && local.length > 0) return local;
    return Array.isArray(bundle?.events) ? bundle.events : mockEvents;
  });
  const [news, setNews] = useState<NewsItem[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    const local = safeParse<NewsItem[]>(LS_NEWS_KEY);
    if (Array.isArray(local) && local.length > 0) return local;
    return Array.isArray(bundle?.news) ? bundle.news : mockNews;
  });
  const [students, setStudents] = useState<Student[]>(() => {
    const stored = safeParse<Student[]>('ummet_students')
      ?? safeParse<Student[]>(LS_STUDENTS_KEY);
    return Array.isArray(stored) && stored.length > 0
      ? stored.map(normalizeStudent)
      : mockStudents;
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => {
    const stored = safeParse<Suggestion[]>(LS_SUGGESTIONS_KEY);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored.map(normalizeSuggestion);
    }
    return mockSuggestions.map(normalizeSuggestion);
  });
  const [editRequestRows, setEditRequestRows] = useState<EditRequest[]>([]);
  const [legacyEditsHistory] = useState<EditsHistoryEntry[]>(loadLegacyHistoryOnce);
  const [editRequestsLoading, setEditRequestsLoading] = useState(false);
  const [editRequestsError, setEditRequestsError] = useState<string | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>(mockPlans);
  const [reports, setReports] = useState<AdminReport[]>(mockReports);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [identityRefreshing, setIdentityRefreshing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [passwordRecoveryGate, setPasswordRecoveryGateState] = useState<PasswordRecoveryGate>('IDLE');
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(0);
  const contentVersionRef = useRef(0);
  const [, setGuideVersion] = useState(0);
  const guideVersionRef = useRef(0);
  const [, setFaqVersion] = useState(0);
  const faqVersionRef = useRef(0);
  const [ownProfileOperationResults, setOwnProfileOperationResults] = useState<OwnProfileOperationResults>(
    EMPTY_OWN_PROFILE_OPERATION_RESULTS,
  );
  const ownProfileOperationOwnerRef = useRef<string | null>(null);
  const authEpoch = useRef(new AuthEpochController(browserAuthTimerScheduler)).current;
  const confirmedAuthOwner = useRef(new ConfirmedAuthOwnerStore()).current;
  const backgroundProfileRefresh = useRef(createBackgroundProfileRefreshCoordinator()).current;
  const identitySubscriptionGeneration = useRef(createIdentitySubscriptionGeneration()).current;
  const latestAuthEventRef = useRef<{ epoch: number; session: Session | null } | null>(null);
  const passwordRecoveryGateRef = useRef<PasswordRecoveryGate>('IDLE');
  const explicitLoginIntentEpochRef = useRef<number | null>(null);

  const setPasswordRecoveryGate = useCallback((gate: PasswordRecoveryGate) => {
    passwordRecoveryGateRef.current = gate;
    setPasswordRecoveryGateState(gate);
  }, []);

  const clearConfirmedAuthOwnership = useCallback(() => {
    confirmedAuthOwner.clear();
  }, [confirmedAuthOwner]);

  const captureConfirmedAuthOwner = useCallback((): ConfirmedAuthOwner | null => (
    confirmedAuthOwner.capture((epoch) => authEpoch.isCurrent(epoch))
  ), [authEpoch, confirmedAuthOwner]);

  const navigatorRef = useRef<ReturnType<typeof createHistoryNavigator> | null>(null);

  const navigate = useCallback((targetView: View, options?: { replace?: boolean }) => {
    if (navigatorRef.current) {
      navigatorRef.current.navigate(targetView, options);
    } else {
      setViewState(targetView);
    }
    if (targetView.kind === 'admin' && targetView.tab) {
      const owner = captureConfirmedAuthOwner();
      if (owner?.userId) {
        saveLastAdminTab(owner.userId, targetView.tab);
      }
    }
  }, [captureConfirmedAuthOwner]);

  const setView = useCallback((v: View | ((prev: View) => View)) => {
    if (typeof v === 'function') {
      setViewState((prev) => {
        const next = v(prev);
        if (navigatorRef.current) {
          navigatorRef.current.navigate(next);
        }
        return next;
      });
    } else {
      navigate(v);
    }
  }, [navigate]);

  useEffect(() => {
    const nav = createHistoryNavigator({
      onViewChange: (nextView) => {
        setViewState(nextView);
      },
    });
    navigatorRef.current = nav;
    return () => {
      nav.destroy();
      navigatorRef.current = null;
    };
  }, []);

  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [contactMessagesLoading, setContactMessagesLoading] = useState(false);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationEmailNotifications, setApplicationEmailNotifications] = useState<ApplicationEmailNotification[]>([]);
  const [generalInfo, setGeneralInfo] = useState<GeneralInfo>({
    vision: 'بناء جيل شبابي واعٍٍ بذاته وهويته، قادر على القيادة والعطاء، يجمع بين أصالة المنطلق ومعاصرة الأداء.',
    goals: 'تنمية المهارات القيادية لدى الشباب، تعزيز الهوية الثقافية، خدمة المجتمع، وبناء شراكات استراتيجية.',
    studentStats: '1248 طالب، 24 جامعة، 540 متطوع، 86 فعالية',
    contactLinks: [
      { label: 'الموقع الإلكتروني', url: 'https://ummet.org' },
      { label: 'البريد الإلكتروني', url: 'mailto:info@ummet.org' },
      { label: 'تيليجرام', url: 'https://t.me/ummet' },
    ],
  });
  const [committees, setCommittees] = useState(() => {
    const baseRaw = safeParse<unknown[]>('ummet_committees');
    const base = Array.isArray(baseRaw) && baseRaw.length > 0
      ? baseRaw.map(normalizeCommittee)
      : mockCommittees.map(normalizeCommittee);
    // `app_executive` is the authoritative source for heads/members.
    try {
      const execRaw = safeParse<unknown[]>(LS_EXECUTIVE_KEY);
      if (!execRaw || !Array.isArray(execRaw) || execRaw.length === 0) return base;
      // Graceful reset: sanitize every entry so corrupt data never reaches rendering.
      const exec = execRaw.map(sanitizeExecutiveEntry);
      return base.map((c) => {
        const entry = exec.find((e) => e.committeeId === c.id);
        if (!entry) return c;
        return normalizeCommittee({ ...c, head: entry.head, members: entry.members });
      });
    } catch {
      // Totally corrupted app_executive — discard it silently and use base data.
      return base;
    }
  });
  const [members, setMembers] = useState<UnifiedMember[]>(() => {
    const stored = safeParse<unknown[]>(LS_MEMBERS_KEY)
      ?? safeParse<unknown[]>(LS_LEGACY_MEMBERS_KEY);
    return Array.isArray(stored) && stored.length > 0
      ? stored.map(normalizeMember)
      : seedMembersFromCommittees(mockCommittees);
  });
  const [siteContent, setSiteContent] = useState<SiteContent>({
    brand: { name: 'اتحاد شباب الأمة', nameTr: 'Ummet Gençleri Birliği', logoIcon: 'Users' },
    footer: {
      phone: '+90 212 555 00 00',
      email: 'info@ummet.org',
      address: 'إسطنبول، تركيا - حي الفاتح',
      copyright: 'اتحاد شباب الأمة - جميع الحقوق محفوظة.',
      social: { facebook: 'https://facebook.com/ummet', twitter: 'https://twitter.com/ummet', instagram: 'https://instagram.com/ummet', youtube: 'https://youtube.com/@ummet' },
    },
    hero: {
      badge: 'نُمكّن الشباب، نبني المستقبل',
      title: 'اتحاد شباب الأمة',
      subtitle: 'نحو جيلٍ واعٍ ومسؤول',
      description: 'اتحاد شبابي يجمع طلاب الجامعات تحت مظلة واحدة، لتعزيز الهوية، وتنمية المهارات، وبناء قادة الغد عبر برامج تثقيفية وتدريبية وتطوعية متكاملة.',
      primaryBtn: 'تصفح البرامج',
      secondaryBtn: 'تعرّف على الاتحاد',
      tertiaryBtn: 'الهيئة التنفيذية',
      image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/1278474e-180d-4c5c-9b50-22472fb26a39.jpg',
      badge1: { value: '12', label: 'جائزة تكريم', icon: 'Award' },
      badge2: { value: '+38%', label: 'نمو سنوي', icon: 'TrendingUp' },
    },
    stats: [
      { value: 1248, label: 'عضو مسجل', icon: 'Users' },
      { value: 86, label: 'فعالية منظمة', icon: 'CalendarDays' },
      { value: 24, label: 'جامعة شريكة', icon: 'GraduationCap' },
      { value: 540, label: 'متطوع نشط', icon: 'HeartHandshake' },
    ],
    about: {
      badge: 'من نحن',
      title: 'رسالتنا: بناء جيلٍ يحمل همّ أمته',
      description: 'نؤمن أن الشباب هم عماد المستقبل وصناع التغيير. لذلك نعمل على تأهيل الطلاب أكاديميًا ومهاريًا، وتعزيز انتمائهم لأمتهم، عبر بيئة شبابية محفّزة وبرامج متنوعة تجمع بين العلم والعمل والقيم.',
      image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/793f1e54-2550-4a05-82cc-75ebf0957f93.jpg',
      imageBadge: { value: '+1200', label: 'طالب استفاد من برامجنا هذا العام' },
      features: [
        { icon: 'Target', title: 'رؤية واضحة', desc: 'إعداد قادة شباب مؤثرين.' },
        { icon: 'BookOpen', title: 'تعليم مستمر', desc: 'برامج تدريبية وتثقيفية.' },
        { icon: 'HeartHandshake', title: 'عمل تطوعي', desc: 'خدمة المجتمع والأمة.' },
        { icon: 'Sparkles', title: 'إبداع وابتكار', desc: 'مساحات للمبادرات الشبابية.' },
      ],
    },
    boardPreview: {
      title: 'الهيئة التنفيذية',
      subtitle: 'الهيكل التنظيمي',
      description: 'فريق قيادي متكامل يضم الرئاسة ونائب الرئيس وخمس لجان متخصصة.',
      memberIds: ['presidency', 'vice-presidency', 'media', 'academic'],
    },
  });

  const [guideSections, setGuideSections] = useState<GuideSectionData[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    return Array.isArray(bundle?.guideSections) ? bundle.guideSections : initialGuideSections;
  });
  const [galleryAlbums, setGalleryAlbums] = useState<GalleryAlbum[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    const local = safeParse<{ albums?: GalleryAlbum[]; categories?: GalleryCategory[] }>(LS_GALLERY_KEY);
    if (Array.isArray(local?.albums)) return local.albums;
    return Array.isArray(bundle?.galleryAlbums) ? bundle.galleryAlbums : initialGalleryAlbums;
  });
  const [galleryCategories, setGalleryCategories] = useState<GalleryCategory[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    const local = safeParse<{ albums?: GalleryAlbum[]; categories?: GalleryCategory[] }>(LS_GALLERY_KEY);
    if (Array.isArray(local?.categories)) return local.categories;
    return Array.isArray(bundle?.galleryCategories) ? bundle.galleryCategories : initialGalleryCategories;
  });
  const [faqCategories, setFaqCategories] = useState<FAQCategoryData[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    return Array.isArray(bundle?.faqCategories) ? bundle.faqCategories : initialFAQCategories;
  });
  const [contactCards, setContactCards] = useState<ContactCardData[]>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    return Array.isArray(bundle?.contactCards) ? bundle.contactCards : initialContactCards;
  });
  const [contactMap, setContactMap] = useState<ContactMapData>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    return bundle?.contactMap ?? DEFAULT_CONTACT_MAP;
  });
  const [programsContent, setProgramsContent] = useState<ProgramsContent>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    return withProgramsAchievements(bundle?.programsContent ?? DEFAULT_PROGRAMS_CONTENT);
  });
  const [guideQuickInfo, setGuideQuickInfo] = useState<string>(() => {
    const bundle = safeParse<SiteContentBundle>(LS_SITE_CONTENT_KEY);
    return typeof bundle?.guideQuickInfo === 'string' ? bundle.guideQuickInfo : DEFAULT_GUIDE_QUICK_INFO;
  });
  const profileEditRequests = useMemo(
    () => editRequestRows.flatMap((request) => {
      const mapped = mapEditRequestToProfileEdit(request);
      return mapped ? [mapped] : [];
    }),
    [editRequestRows],
  );
  const pendingProfileEdits = useMemo(
    () => profileEditRequests.filter((edit) => edit.status === 'PENDING_APPROVAL'),
    [profileEditRequests],
  );
  const pendingSiteEdits = useMemo(
    () => editRequestRows.flatMap((request) => {
      const mapped = mapEditRequestToSiteEdit(request);
      return mapped ? [mapped] : [];
    }),
    [editRequestRows],
  );
  const editsHistory = useMemo(() => {
    if (!currentUser) return [];
    const databaseHistory = mapDecidedEditRequestsToHistory(editRequestRows);
    return visibleHistoryFor(
      [...databaseHistory, ...legacyEditsHistory].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      { userId: currentUser.userId, role: currentUser.role },
    );
  }, [currentUser, editRequestRows, legacyEditsHistory]);

  const clearEditRequestsError = useCallback(() => setEditRequestsError(null), []);
  const refreshEditRequests = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      setEditRequestRows([]);
      setEditRequestsLoading(false);
      setEditRequestsError(null);
      return { ok: true };
    }

    setEditRequestsLoading(true);
    const result = await listEditRequests();
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch) {
      return { ok: false, error: 'تم استبدال جلسة السجل بجلسة أحدث.' };
    }
    setEditRequestsLoading(false);
    if (!result.ok) {
      const message = 'تعذر تحميل سجل التعديلات المصرح لك به. حاول تحديث الصفحة.';
      setEditRequestsError(message);
      return { ok: false, error: message };
    }
    setEditRequestRows(result.data);
    setEditRequestsError(null);
    return { ok: true };
  }, [captureConfirmedAuthOwner]);

  useEffect(() => {
    if (!currentUser || !isLeadershipRole(currentUser.role)) {
      setEditRequestRows([]);
      setEditRequestsLoading(false);
      setEditRequestsError(null);
      return;
    }

    let active = true;
    const reload = () => {
      if (!active) return;
      void refreshEditRequests();
    };
    reload();

    const channel = supabase
      .channel(`edit-requests:${currentUser.userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'edit_requests' },
        reload,
      )
      .subscribe((status) => {
        if (!active || status === 'SUBSCRIBED') return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setEditRequestsError('تعذرت المزامنة اللحظية للسجل؛ سيتم تحديثه بعد كل عملية وعند إعادة فتح الصفحة.');
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser, refreshEditRequests]);

  // Persist students to localStorage for live cross-page sync
  useEffect(() => {
    safeWrite('ummet_students', students);
  }, [students]);

  // Persist committees fully (legacy key) + the executive board under app_executive.
  useEffect(() => {
    safeWrite('ummet_committees', stripPrivateExecutiveEmailsForCache(committees));
  }, [committees]);
  useEffect(() => {
    const exec: ExecutiveEntry[] = committees.map((c) => ({
      committeeId: c.id,
      head: { ...c.head, email: '' },
      members: c.members,
    }));
    safeWrite(LS_EXECUTIVE_KEY, exec);
  }, [committees]);

  // Unified members persistence (single source of truth for roles)
  useEffect(() => {
    safeWrite(LS_MEMBERS_KEY, stripPrivateLoginEmailsForCache(members));
  }, [members]);

  // Suggestions persistence — single source under `app_suggestions`.
  useEffect(() => {
    safeWrite(LS_SUGGESTIONS_KEY, suggestions);
  }, [suggestions]);

  // Persist plans + reports to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ummet_plans');
      if (saved) setPlans(JSON.parse(saved) as AdminPlan[]);
    } catch { /* ignore */ }
    try {
      const saved = localStorage.getItem('ummet_reports');
      if (saved) setReports(JSON.parse(saved) as AdminReport[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    safeWrite('ummet_plans', plans);
  }, [plans]);
  useEffect(() => {
    safeWrite('ummet_reports', reports);
  }, [reports]);

  // Persist siteContent to localStorage for global inline-edit sync
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ummet_site');
      if (saved) setSiteContent(JSON.parse(saved) as SiteContent);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    safeWrite('ummet_site', siteContent);
  }, [siteContent]);

  const [aboutContent, setAboutContent] = useState<AboutContent>({
    header: {
      badge: 'من نحن',
      title: 'عن اتحاد شباب الأمة',
      description: 'اتحاد شبابي تأسس ليجمع طلاب الجامعات تحت مظلة واحدة، يعزز الهوية ويبني المهارات ويصنع القادة.',
    },
    story: {
      badge: 'قصتنا',
      title: 'من البداية حتى اليوم',
      paragraphs: [
        'بدأنا كمجموعة صغيرة من الطلاب المتطوعين يحلمون بمساحة شبابية تجمع بين الهمّ والعمل. اليوم، أصبحنا اتحادًا يضم أكثر من 1200 عضو من 24 جامعة مختلفة.',
        'نظّمنا 86 فعالية متنوعة بين ورش عمل ومحاضرات وبرامج تدريبية وحملات تطوعية، وخرّجنا قادة شبابًا يقودون اليوم مبادراتهم الخاصة في مجتمعاتهم.',
        'نؤمن أن بناء الأمة يبدأ من بناء الشاب، وأن كل طالب يحمل في داخله طاقة قادرة على التغيير إذا وُجدت البيئة المناسبة.',
      ],
      images: [
        'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/a316c67e-0372-49d9-af45-c7c955dcf50c.jpg',
        'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/ebe6a555-d5f5-4e96-bcb6-a3e233b7de0d.jpg',
        'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/044497a0-d0fd-449f-816b-e1d35dda1018.jpg',
        'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/7fea14a6-2566-46f6-8eb1-4bddc8818f71.jpg',
      ],
    },
    mission: {
      badge: 'رسالتنا ورؤيتنا',
      title: 'قيمنا، رؤيتنا، ورسالتنا',
      cards: [
        { icon: 'Target', title: 'رسالتنا', text: 'إعداد جيل شبابي واعٍ ومسؤول، يمتلك المهارات والقيم التي تؤهله لقيادة مستقبل أمته.' },
        { icon: 'Eye', title: 'رؤيتنا', text: 'أن نكون الاتحاد الشبابي الرائد في تأهيل القادة وتنمية المجتمعات على مستوى المنطقة.' },
        { icon: 'Heart', title: 'قيمنا', text: 'الانتماء، الإخلاص، التعاون، التميّز، والمسؤولية. مبادئ نلتزم بها في كل ما نقوم به.' },
      ],
    },
    goals: {
      badge: 'أهدافنا',
      title: 'ما نسعى لتحقيقه',
      cards: [
        { icon: 'BookOpen', title: 'التثقيف المستمر', desc: 'محاضرات وندوات تعزز الوعي الثقافي والفكري.' },
        { icon: 'GraduationCap', title: 'الإرشاد الأكاديمي', desc: 'دعم الطلاب علميًا وتوجيههم نحو التميز في مساراتهم.' },
        { icon: 'Users', title: 'تنمية المهارات', desc: 'تطوير القدرات القيادية والإدارية والإعلامية لدى الطلاب.' },
        { icon: 'ShieldCheck', title: 'تعزيز الهوية', desc: 'تثبيت قيم الانتماء للأمة لدى جيل الشباب.' },
        { icon: 'Sparkles', title: 'دعم الابتكار', desc: 'احتضان المبادرات الشبابية الإبداعية وتطويرها.' },
        { icon: 'Handshake', title: 'العمل التطوعي', desc: 'تنظيم حملات ومبادرات تخدم المجتمع وتعزز المسؤولية.' },
      ],
    },
    cta: {
      icon: 'Award',
      title: 'كن جزءًا من رحلتنا',
      description: 'انضم إلى آلاف الطلاب الذين اختاروا أن يكونوا فاعلين في مجتمعاتهم.',
      buttonText: 'سجّل الآن',
    },
  });

  // Persist aboutContent to localStorage for global inline-edit sync
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ummet_about');
      if (saved) setAboutContent(JSON.parse(saved) as AboutContent);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    safeWrite('ummet_about', aboutContent);
  }, [aboutContent]);

  // Live content bundle — every published page mirror writes into `app_site_content`.
  useEffect(() => {
    safeWrite(LS_SITE_CONTENT_KEY, {
      siteContent,
      aboutContent,
      generalInfo,
      programsContent,
      guideQuickInfo,
      guideSections,
      galleryAlbums,
      galleryCategories,
      faqCategories,
      contactCards,
      contactMap,
      events,
      news,
      plans,
      reports,
      committees,
    });
    // Standalone live keys for news / events / gallery (live cross-page sync).
    safeWrite(LS_NEWS_KEY, news);
    safeWrite(LS_EVENTS_KEY, events);
    safeWrite(LS_GALLERY_KEY, { albums: galleryAlbums, categories: galleryCategories });
  }, [siteContent, aboutContent, generalInfo, programsContent, guideQuickInfo, guideSections, galleryAlbums, galleryCategories, faqCategories, contactCards, contactMap, events, news, plans, reports, committees]);

  const [activeLocale, setActiveLocale] = useState<string>(() => i18n.language || 'ar');

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setActiveLocale(lng || 'ar');
    };
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  const [publishedLocalizations, setPublishedLocalizations] = useState<Record<string, unknown>>({});

  const refreshPublishedLocalizations = useCallback(async () => {
    if (activeLocale === 'ar') {
      setPublishedLocalizations({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from('cms_localizations')
        .select('target, payload')
        .eq('partition', 'published')
        .eq('locale', activeLocale);

      if (error || !data) return;
      const map: Record<string, unknown> = {};
      for (const row of data) {
        if (row && typeof row.target === 'string') {
          map[row.target] = row.payload;
        }
      }
      setPublishedLocalizations(map);
    } catch {
      // Clean fallback to canonical Arabic on network error
    }
  }, [activeLocale]);

  useEffect(() => {
    void refreshPublishedLocalizations();
  }, [refreshPublishedLocalizations]);

  const effectiveNews = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return news;
    const localized = publishedLocalizations['news'];
    return overlayLocalizedCmsPayload(news, localized, 'news') as NewsItem[];
  }, [activeLocale, view.kind, news, publishedLocalizations]);

  const effectiveEvents = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return events;
    const localized = publishedLocalizations['events'];
    return overlayLocalizedCmsPayload(events, localized, 'events') as UEvent[];
  }, [activeLocale, view.kind, events, publishedLocalizations]);

  const effectiveSiteContent = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return siteContent;
    const localized = publishedLocalizations['site'];
    return overlayLocalizedCmsPayload(siteContent, localized, 'site') as SiteContent;
  }, [activeLocale, view.kind, siteContent, publishedLocalizations]);

  const effectiveAboutContent = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return aboutContent;
    const localized = publishedLocalizations['about'];
    return overlayLocalizedCmsPayload(aboutContent, localized, 'about') as AboutContent;
  }, [activeLocale, view.kind, aboutContent, publishedLocalizations]);

  const effectiveFaqCategories = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return faqCategories;
    const localized = publishedLocalizations['faqCategories'];
    return overlayLocalizedCmsPayload(faqCategories, localized, 'faqCategories') as FAQCategoryData[];
  }, [activeLocale, view.kind, faqCategories, publishedLocalizations]);

  const effectiveGuideSections = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return guideSections;
    const localized = publishedLocalizations['guideSections'];
    return overlayLocalizedCmsPayload(guideSections, localized, 'guideSections') as GuideSectionData[];
  }, [activeLocale, view.kind, guideSections, publishedLocalizations]);

  const effectiveGuideQuickInfo = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return guideQuickInfo;
    const localized = publishedLocalizations['guideQuickInfo'];
    return overlayLocalizedCmsPayload(guideQuickInfo, localized, 'guideQuickInfo') as string;
  }, [activeLocale, view.kind, guideQuickInfo, publishedLocalizations]);

  const effectiveGalleryAlbums = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return galleryAlbums;
    const localized = publishedLocalizations['galleryAlbums'];
    return overlayLocalizedCmsPayload(galleryAlbums, localized, 'galleryAlbums') as GalleryAlbum[];
  }, [activeLocale, view.kind, galleryAlbums, publishedLocalizations]);

  const effectiveGalleryCategories = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return galleryCategories;
    const localized = publishedLocalizations['galleryCategories'];
    return overlayLocalizedCmsPayload(galleryCategories, localized, 'galleryCategories') as GalleryCategory[];
  }, [activeLocale, view.kind, galleryCategories, publishedLocalizations]);

  const effectiveCommittees = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return committees;
    const localized = publishedLocalizations['committees'];
    return overlayLocalizedCmsPayload(committees, localized, 'committees') as typeof mockCommittees;
  }, [activeLocale, view.kind, committees, publishedLocalizations]);

  const effectivePlans = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return plans;
    const localized = publishedLocalizations['plans'];
    return overlayLocalizedCmsPayload(plans, localized, 'plans') as AdminPlan[];
  }, [activeLocale, view.kind, plans, publishedLocalizations]);

  const effectiveReports = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return reports;
    const localized = publishedLocalizations['reports'];
    return overlayLocalizedCmsPayload(reports, localized, 'reports') as AdminReport[];
  }, [activeLocale, view.kind, reports, publishedLocalizations]);

  const effectiveProgramsContent = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return programsContent;
    const localized = publishedLocalizations['programsContent'];
    return overlayLocalizedCmsPayload(programsContent, localized, 'programsContent') as ProgramsContent;
  }, [activeLocale, view.kind, programsContent, publishedLocalizations]);

  const effectiveContactCards = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return contactCards;
    const localized = publishedLocalizations['contactCards'];
    return overlayLocalizedCmsPayload(contactCards, localized, 'contactCards') as ContactCardData[];
  }, [activeLocale, view.kind, contactCards, publishedLocalizations]);

  const effectiveContactMap = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return contactMap;
    const localized = publishedLocalizations['contactMap'];
    return overlayLocalizedCmsPayload(contactMap, localized, 'contactMap') as ContactMapData;
  }, [activeLocale, view.kind, contactMap, publishedLocalizations]);

  const effectiveGeneralInfo = useMemo(() => {
    if (activeLocale === 'ar' || view.kind === 'admin') return generalInfo;
    const localized = publishedLocalizations['generalInfo'];
    return overlayLocalizedCmsPayload(generalInfo, localized, 'generalInfo') as GeneralInfo;
  }, [activeLocale, view.kind, generalInfo, publishedLocalizations]);

  const applyPublishedContentBundle = useCallback((bundle: SiteContentBundle) => {
    if (bundle.siteContent) setSiteContent(bundle.siteContent);
    if (bundle.aboutContent) setAboutContent(bundle.aboutContent);
    if (bundle.generalInfo) setGeneralInfo(bundle.generalInfo);
    if (bundle.programsContent) setProgramsContent(withProgramsAchievements(bundle.programsContent));
    if (Array.isArray(bundle.galleryAlbums)) setGalleryAlbums(bundle.galleryAlbums);
    if (Array.isArray(bundle.galleryCategories)) setGalleryCategories(bundle.galleryCategories);
    if (Array.isArray(bundle.contactCards)) setContactCards(bundle.contactCards);
    if (bundle.contactMap) setContactMap(bundle.contactMap);
    if (Array.isArray(bundle.events)) setEvents(bundle.events);
    if (Array.isArray(bundle.news)) setNews(bundle.news);
    if (Array.isArray(bundle.plans)) setPlans(bundle.plans);
    if (Array.isArray(bundle.reports)) setReports(bundle.reports);
    if (Array.isArray(bundle.committees)) {
      setCommittees((current) => mergeInstitutionalCommitteeContent(current, bundle.committees!));
    }
  }, []);

  useEffect(() => {
    let active = true;
    setContentLoading(true);
    void loadPublishedSiteContent<SiteContentBundle & Record<string, unknown>>()
      .then((result) => {
        if (!active) return;
        setContentLoading(false);
        if (!result.ok) {
          setContentError('تعذر تحميل النسخة الرسمية؛ تُعرض آخر نسخة محلية للقراءة فقط.');
          return;
        }
        setContentError(null);
        if (!result.data) {
          contentVersionRef.current = 0;
          setContentVersion(0);
          return;
        }
        contentVersionRef.current = result.data.version;
        setContentVersion(result.data.version);
        applyPublishedContentBundle(result.data.content);
      });

    return () => {
      active = false;
    };
  }, [applyPublishedContentBundle]);

  useEffect(() => {
    let active = true;

    void Promise.all([loadStudentGuideContent(), loadFaqContent()])
      .then(([guideResult, faqResult]) => {
        if (!active) return;
        if (!guideResult.ok || !faqResult.ok) {
          setContentError('تعذر تحميل دليل الطالب أو الأسئلة الشائعة؛ تُعرض آخر نسخة محلية مؤقتاً.');
          return;
        }
        if (guideResult.data) {
          guideVersionRef.current = guideResult.data.version;
          setGuideVersion(guideResult.data.version);
          setGuideQuickInfo(guideResult.data.quickInfo);
          setGuideSections(guideResult.data.sections as GuideSectionData[]);
        }
        if (faqResult.data) {
          faqVersionRef.current = faqResult.data.version;
          setFaqVersion(faqResult.data.version);
          setFaqCategories(faqResult.data.categories as FAQCategoryData[]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setContactMessages([]);
    setContactMessagesError(null);
    setContactMessagesLoading(Boolean(currentUser?.userId));
    if (!currentUser?.userId) return () => { active = false; };

    const refresh = async () => {
      const result = await listVisibleContactMessages();
      if (!active) return;
      setContactMessagesLoading(false);
      if (!result.ok) {
        setContactMessagesError(result.error.message || 'تعذر تحميل رسائل التواصل.');
        return;
      }
      setContactMessages(result.data);
      setContactMessagesError(null);
    };

    void refresh();
    const messagesChannel = supabase
      .channel(`contact-messages:${currentUser.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, () => { void refresh(); })
      .subscribe();
    const repliesChannel = supabase
      .channel(`contact-replies:${currentUser.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_message_replies' }, () => { void refresh(); })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(messagesChannel);
      void supabase.removeChannel(repliesChannel);
    };
  }, [currentUser?.userId]);

  // Supabase RLS is the only application authority. On identity change, clear
  // the prior view immediately and publish only the rows confirmed for the new
  // authenticated UUID (own row, or all rows for the current president).
  useEffect(() => {
    let active = true;
    setApplications([]);
    setApplicationsLoading(Boolean(currentUser?.userId));
    if (!currentUser?.userId) return () => { active = false; };

    const refreshApplications = async () => {
      try {
        const result = await listVisibleStudentApplications();
        if (!active) return;
        if (!result.ok) {
          console.error('Failed to load RLS-visible applications.', { code: result.error.code });
          return;
        }
        setApplications(result.data);
      } catch {
        if (active) console.error('Failed to load RLS-visible applications unexpectedly.');
      }
    };

    void refreshApplications().finally(() => {
      if (active) setApplicationsLoading(false);
    });

    const stopPresidentRefresh = startPresidentApplicationRefresh({
      role: currentUser?.role,
      refresh: refreshApplications,
      eventTarget: {
        addEventListener: (_event, listener) => window.addEventListener('focus', listener),
        removeEventListener: (_event, listener) => window.removeEventListener('focus', listener),
      },
    });

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    if (currentUser?.role === 'PRESIDENT') {
      realtimeChannel = supabase
        .channel('president_applications_refresh')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'student_applications' },
          () => void refreshApplications(),
        )
        .subscribe();
    }

    return () => {
      active = false;
      stopPresidentRefresh();
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [currentUser?.userId, currentUser?.role]);

  const refreshApplicationEmailNotifications = useCallback(async () => {
    if (currentUser?.role !== 'PRESIDENT' || !currentUser.userId) {
      setApplicationEmailNotifications([]);
      return;
    }
    try {
      const rows = await listApplicationEmailNotifications();
      setApplicationEmailNotifications(rows);
    } catch {
      console.error('Failed to load president-visible application email notifications.');
    }
  }, [currentUser?.role, currentUser?.userId]);

  useEffect(() => {
    void refreshApplicationEmailNotifications();
  }, [refreshApplicationEmailNotifications]);

  // Delete obsolete client-auth caches once. Supabase owns session persistence.
  useEffect(() => {
    localStorage.removeItem('app_session');
    localStorage.removeItem('app_auth_version');
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const refreshPublicExecutiveBoard = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await listPublicExecutiveDirectory();
    if (!result.ok) {
      return { ok: false, error: 'تعذر تحديث بيانات الهيئة التنفيذية العامة.' };
    }
    const display = buildAccountDirectoryDisplay([], result.data);
    setCommittees((previous) => previous.map((committee) => {
      const confirmedHead = display.heads[committee.id];
      return {
        ...committee,
        head: confirmedHead
          ? { ...committee.head, ...confirmedHead }
          : {
              ...committee.head,
              id: '',
              name: '',
              bio: '',
              photo: '',
              email: '',
              phone: '',
              university: '',
              major: '',
              year: '',
              updatedAt: '',
            },
      };
    }));
    return { ok: true };
  }, []);

  const refreshAccountDirectory = useCallback(async (
    canPublish: () => boolean = () => true,
  ): Promise<{ ok: boolean; error?: string }> => {
    const [privateResult, publicExecutiveResult] = await Promise.all([
      listPresidentAssignableMembers(),
      listPublicExecutiveDirectory(),
    ]);
    let loginEmailByUser = new Map<string, string>();
    let display: ReturnType<typeof buildAccountDirectoryDisplay>;

    if (privateResult.ok) {
      if (!publicExecutiveResult.ok) {
        return { ok: false, error: 'تعذر تحديث بيانات التواصل العامة للهيئة التنفيذية.' };
      }
      loginEmailByUser = new Map(privateResult.data.map((member) => [member.userId, member.loginEmail]));
      display = buildAccountDirectoryDisplay(
        privateResult.data.map((member) => ({
          userId: member.userId,
          name: member.name,
          university: member.university,
          major: member.major,
          year: member.year,
          bio: member.bio,
          avatarPath: member.avatarPath,
          updatedAt: member.profileUpdatedAt,
        })),
        publicExecutiveResult.data,
      );
    } else {
      // A president transfer revokes the caller before this post-RPC refresh.
      // Fall back to the safe public projections so roles and board never stay stale;
      // previously confirmed login emails remain display-only in the president UI.
      const memberResult = await listAssignableMembers();
      if (!memberResult.ok || !publicExecutiveResult.ok) {
        return { ok: false, error: 'تعذر تحديث دليل الحسابات والهيئة التنفيذية.' };
      }
      display = buildAccountDirectoryDisplay(memberResult.data, publicExecutiveResult.data);
    }

    if (!canPublish()) {
      return { ok: false, error: 'تغيّرت هوية الحساب قبل نشر دليل الأعضاء.' };
    }

    setMembers((previous) => {
      const previousEmailByUser = new Map(previous.map((member) => [member.id, member.email]));
      return display.members.map((member) => ({
        ...member,
        email: loginEmailByUser.get(member.id) ?? previousEmailByUser.get(member.id) ?? '',
        photo: member.photo,
      }));
    });
    setCommittees((previous) => previous.map((committee) => {
      const confirmedHead = display.heads[committee.id];
      return {
        ...committee,
        head: confirmedHead
          ? { ...committee.head, ...confirmedHead }
          : {
              ...committee.head,
              id: '',
              name: '',
              bio: '',
              photo: '',
              email: '',
              phone: '',
              university: '',
              major: '',
              year: '',
              updatedAt: '',
            },
      };
    }));
    return { ok: true };
  }, []);

  useEffect(() => {
    let active = true;
    const reloadPublicBoard = () => {
      void refreshPublicExecutiveBoard().then((result) => {
        if (active && !result.ok) console.error('Failed to refresh the public executive board.');
      });
    };
    reloadPublicBoard();
    return () => {
      active = false;
    };
  }, [refreshPublicExecutiveBoard]);

  const synchronizeConfirmedProfileDisplay = useCallback((
    mapped: MappedSessionIdentity,
    updateAccountState: boolean,
  ) => {
    const profile = {
      userId: mapped.currentUser.userId,
      name: mapped.currentUser.name,
      contactEmail: mapped.currentUser.contactEmail,
      university: mapped.currentUser.university,
      major: mapped.currentUser.major,
      year: mapped.currentUser.year,
      phone: mapped.currentUser.phone,
      bio: mapped.currentUser.bio,
      avatarPath: mapped.currentUser.avatarPath,
      updatedAt: mapped.currentUser.updatedAt,
    };
    if (updateAccountState) {
      setCurrentUser((currentUser) => synchronizeProfileIdentityByUserId({
        currentUser,
        currentStudent: null,
        members: [],
        committees: [],
      }, profile).currentUser);
      setCurrentStudent((currentStudent) => {
        if (mapped.currentUser.role !== 'STUDENT') return null;
        const ownedStudent = currentStudent
          && (currentStudent.userId ?? currentStudent.id) === profile.userId
          ? currentStudent
          : mapped.student;
        return synchronizeProfileIdentityByUserId({
          currentUser: null,
          currentStudent: ownedStudent,
          members: [],
          committees: [],
        }, profile).currentStudent;
      });
    }
    setMembers((members) => synchronizeProfileIdentityByUserId({
      currentUser: null,
      currentStudent: null,
      members,
      committees: [],
    }, profile).members);
    setCommittees((committees) => synchronizeProfileIdentityByUserId({
      currentUser: null,
      currentStudent: null,
      members: [],
      committees,
    }, profile).committees);
  }, []);

  // A session is authoritative only after its profile and UUID assignment have
  // both been loaded successfully. Local display data never participates here.
  const applySession = useCallback(async (
    session: Session,
    capturedEpoch: number,
    navigation: SessionNavigationIntent | boolean = 'passive',
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!authEpoch.isCurrent(capturedEpoch)) {
      return { ok: false, error: 'تم استبدال محاولة تحميل الجلسة بمحاولة أحدث.' };
    }

    const identityResult = await loadSessionIdentity(session);

    if (!authEpoch.isCurrent(capturedEpoch)) {
      return { ok: false, error: 'تم استبدال محاولة تحميل الجلسة بمحاولة أحدث.' };
    }

    if (!identityResult.ok) {
      console.error('Failed to load confirmed session identity:', identityResult.error);
      const message = 'تعذر تحميل ملف الحساب وصلاحياته الموثوقة. يرجى إعادة تسجيل الدخول والمحاولة مرة أخرى.';
      setCurrentUser(null);
      setCurrentStudent(null);
      setAuthError(message);
      setAuthInitializing(false);
      setIdentityRefreshing(false);
      navigate({ kind: 'login' }, { replace: true });
      return { ok: false, error: message };
    }

    const mapped = identityResult.data;
    const displayName = mapped.currentUser.name
      || mapped.currentUser.loginEmail.split('@')[0]
      || 'المستخدم';
    const confirmedUser = { ...mapped.currentUser, name: displayName };
    const confirmedStudent = {
      ...mapped.student,
      name: mapped.student.name || displayName,
    };

    if (!confirmedAuthOwner.publish({
      epoch: capturedEpoch,
      userId: confirmedUser.userId,
      loginEmail: confirmedUser.loginEmail,
      role: confirmedUser.role,
      committee: confirmedUser.committee,
    }, (epoch) => authEpoch.isCurrent(epoch))) {
      return { ok: false, error: 'تم استبدال محاولة تحميل الجلسة بمحاولة أحدث.' };
    }

    if (
      ownProfileOperationOwnerRef.current
      && ownProfileOperationOwnerRef.current !== confirmedUser.userId
    ) {
      ownProfileOperationOwnerRef.current = null;
      setOwnProfileOperationResults(EMPTY_OWN_PROFILE_OPERATION_RESULTS);
    }

    setCurrentUser(confirmedUser);
    setCurrentStudent(confirmedUser.role === 'STUDENT' ? confirmedStudent : null);
    synchronizeConfirmedProfileDisplay({
      currentUser: confirmedUser,
      student: confirmedStudent,
    }, false);
    setAuthError(null);
    setAuthInitializing(false);
    setIdentityRefreshing(false);

    let effectiveIntent: SessionNavigationIntent = typeof navigation === 'boolean'
      ? (navigation ? 'explicit-login' : 'passive')
      : navigation;

    if (
      explicitLoginIntentEpochRef.current !== null
      && explicitLoginIntentEpochRef.current === capturedEpoch
    ) {
      effectiveIntent = 'explicit-login';
      explicitLoginIntentEpochRef.current = null;
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://site.example/';
    const lastAdminTab = loadLastAdminTab(confirmedUser.userId);

    const decision = resolveSessionAuthNavigation({
      currentUrl,
      confirmedUser,
      navigationIntent: effectiveIntent,
      lastAdminTab,
    });

    if (decision.shouldNavigate && decision.targetView) {
      navigate(decision.targetView, decision.replace ? { replace: true } : undefined);
    }
    return { ok: true };
  }, [authEpoch, confirmedAuthOwner, navigate, synchronizeConfirmedProfileDisplay]);

  // Restore the Supabase session and keep it synchronized. The listener stays
  // synchronous; identity loading is deferred to avoid supabase-js callback locks.
  useEffect(() => {
    clearConfirmedAuthOwnership();
    identitySubscriptionGeneration.invalidateAll();
    const initialEpoch = authEpoch.activate();
    setCurrentStudent(null);
    setCurrentUser(null);
    setAuthInitializing(true);
    setIdentityRefreshing(false);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const eventAction = classifyAuthEvent(event, session !== null);

      if (event === 'PASSWORD_RECOVERY') {
        const nextGate = reducePasswordRecoveryGate('IDLE', event, session !== null);
        if (!session || nextGate !== 'READY') {
          setPasswordRecoveryGate('IDLE');
          return;
        }

        clearConfirmedAuthOwnership();
        identitySubscriptionGeneration.invalidateAll();
        const recoveryEpoch = authEpoch.beginEvent();
        if (recoveryEpoch === null) return;
        latestAuthEventRef.current = { epoch: recoveryEpoch, session };
        setCurrentStudent(null);
        setCurrentUser(null);
        setAuthError(null);
        setAuthInitializing(false);
        setIdentityRefreshing(false);
        setPasswordRecoveryGate(nextGate);
        setView({ kind: 'update-password' });

        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('auth');
        cleanUrl.hash = '';
        window.history.replaceState(
          window.history.state,
          '',
          `${cleanUrl.pathname}${cleanUrl.search}`,
        );
        return;
      }

      // A recovery session must not become normal application authority before
      // the password is changed and the temporary session is explicitly closed.
      if (passwordRecoveryGateRef.current === 'READY' && event !== 'SIGNED_OUT') return;

      if (eventAction === 'ignore' || (eventAction === 'refresh' && !session)) return;

      clearConfirmedAuthOwnership();
      identitySubscriptionGeneration.invalidateAll();
      const eventEpoch = authEpoch.beginEvent();
      if (eventEpoch === null) return;
      latestAuthEventRef.current = { epoch: eventEpoch, session };

      if (eventAction === 'clear') {
        setPasswordRecoveryGate(reducePasswordRecoveryGate(
          passwordRecoveryGateRef.current,
          event,
          false,
        ));
        ownProfileOperationOwnerRef.current = null;
        setOwnProfileOperationResults(EMPTY_OWN_PROFILE_OPERATION_RESULTS);
        setCurrentStudent(null);
        setCurrentUser(null);
        setAuthError(null);
        setAuthInitializing(false);
        setIdentityRefreshing(false);
        navigate({ kind: 'home' }, { replace: true });
        return;
      }

      if (eventAction === 'refresh' && session) {
        // Revoke all UI authority synchronously while the replacement identity
        // and assignment are being confirmed.
        setCurrentStudent(null);
        setCurrentUser(null);
        setAuthInitializing(true);
        setIdentityRefreshing(false);
        authEpoch.schedule(eventEpoch, () => {
          const isExplicit = explicitLoginIntentEpochRef.current !== null
            && explicitLoginIntentEpochRef.current === eventEpoch;
          if (isExplicit) {
            explicitLoginIntentEpochRef.current = null;
          }
          void applySession(
            session,
            eventEpoch,
            isExplicit ? 'explicit-login' : event === 'INITIAL_SESSION' ? 'initial' : 'passive',
          );
        });
      }
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!authEpoch.isCurrent(initialEpoch)) return;
        if (error) {
          console.error('Failed to restore Supabase session.');
          setCurrentStudent(null);
          setCurrentUser(null);
          setAuthError('تعذر التحقق من جلسة الحساب. يرجى تسجيل الدخول مرة أخرى.');
          setAuthInitializing(false);
          setIdentityRefreshing(false);
          navigate({ kind: 'login' }, { replace: true });
          return;
        }
        if (data.session) {
          await applySession(data.session, initialEpoch, 'initial');
        } else {
          if (!authEpoch.isCurrent(initialEpoch)) return;
          setCurrentStudent(null);
          setCurrentUser(null);
          setAuthInitializing(false);
          setIdentityRefreshing(false);
        }
      } catch {
        if (!authEpoch.isCurrent(initialEpoch)) return;
        console.error('Failed to initialize Supabase Auth.');
        setCurrentStudent(null);
        setCurrentUser(null);
        setAuthError('تعذر الاتصال بخدمة تسجيل الدخول. يرجى المحاولة لاحقاً.');
        setAuthInitializing(false);
        setIdentityRefreshing(false);
        navigate({ kind: 'login' }, { replace: true });
      }
    })();

    return () => {
      clearConfirmedAuthOwnership();
      latestAuthEventRef.current = null;
      identitySubscriptionGeneration.invalidateAll();
      authEpoch.dispose();
      authListener.subscription.unsubscribe();
    };
  }, [
    applySession,
    authEpoch,
    captureConfirmedAuthOwner,
    clearConfirmedAuthOwnership,
    identitySubscriptionGeneration,
    navigate,
    setPasswordRecoveryGate,
    setView,
  ]);

  const prepareCurrentSessionIdentityRefresh = useCallback((
    previousRole: UserRole,
  ): (() => Promise<{ ok: boolean; error?: string }>) => {
    // Invalidate the active channel before advancing Auth work so a late event
    // from this account cannot cancel or replace the refresh it just requested.
    clearConfirmedAuthOwnership();
    identitySubscriptionGeneration.invalidateAll();
    const refreshEpoch = authEpoch.beginEvent();
    setCurrentStudent(null);
    setCurrentUser(null);
    setIdentityRefreshing(true);

    if (refreshEpoch === null) {
      return async () => {
        setIdentityRefreshing(false);
        setView({ kind: 'login' });
        return { ok: false, error: 'تم إيقاف تحديث الصلاحيات لأن الجلسة لم تعد نشطة.' };
      };
    }

    return async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!authEpoch.isCurrent(refreshEpoch)) {
          return { ok: false, error: 'تم استبدال تحديث الصلاحيات بتحديث أحدث.' };
        }
        if (error || !data.session) {
          const message = 'تعذر التحقق من الصلاحيات المحدثة. يرجى تسجيل الدخول مرة أخرى.';
          setAuthError(message);
          setIdentityRefreshing(false);
          setView({ kind: 'login' });
          return { ok: false, error: message };
        }
        return await applySession(data.session, refreshEpoch, { previousRole });
      } catch {
        if (!authEpoch.isCurrent(refreshEpoch)) {
          return { ok: false, error: 'تم استبدال تحديث الصلاحيات بتحديث أحدث.' };
        }
        const message = 'تعذر الاتصال أثناء تحديث الصلاحيات. تم حجب لوحة الإدارة للأمان.';
        setAuthError(message);
        setIdentityRefreshing(false);
        setView({ kind: 'login' });
        return { ok: false, error: message };
      }
    };
  }, [applySession, authEpoch, clearConfirmedAuthOwnership, identitySubscriptionGeneration, setView]);

  const refreshCurrentSessionIdentity = useCallback((
    previousRole: UserRole,
  ): Promise<{ ok: boolean; error?: string }> => {
    return prepareCurrentSessionIdentityRefresh(previousRole)();
  }, [prepareCurrentSessionIdentityRefresh]);

  const refreshOwnProfileInBackground = useCallback(async (
    expectedUserId: string,
    previousRole: UserRole,
    ownership: OwnProfileOperationOwnership,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await backgroundProfileRefresh.refresh<Session, MappedSessionIdentity>({
      ownership,
      expectedRole: previousRole,
      isOwnershipCurrent: (captured: BackgroundProfileOwnership) => {
        const owner = captureConfirmedAuthOwner();
        return owner?.epoch === captured.authEpoch
          && owner.userId === captured.userId
          && captured.userId === expectedUserId;
      },
      loadSession: async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          return error || !data.session
            ? { ok: false as const }
            : { ok: true as const, session: data.session };
        } catch {
          return { ok: false as const };
        }
      },
      loadIdentity: async (session) => {
        const identityResult = await loadSessionIdentity(session);
        return identityResult.ok
          ? { ok: true as const, identity: identityResult.data }
          : { ok: false as const };
      },
      applyIdentity: (mapped: MappedSessionIdentity) => {
        const displayName = mapped.currentUser.name
          || mapped.currentUser.loginEmail.split('@')[0]
          || 'المستخدم';
        const confirmedUser = { ...mapped.currentUser, name: displayName };
        const confirmedStudent = {
          ...mapped.student,
          name: mapped.student.name || displayName,
        };
        if (!confirmedAuthOwner.publish({
          epoch: ownership.authEpoch,
          userId: confirmedUser.userId,
          loginEmail: confirmedUser.loginEmail,
          role: confirmedUser.role,
          committee: confirmedUser.committee,
        }, (epoch) => authEpoch.isCurrent(epoch))) return;
        synchronizeConfirmedProfileDisplay({
          currentUser: confirmedUser,
          student: confirmedStudent,
        }, true);
        setAuthError(null);
      },
    });

    if (
      !result.ok
      && result.reason === 'role-changed'
      && authEpoch.isCurrent(ownership.authEpoch)
    ) {
      return refreshCurrentSessionIdentity(previousRole);
    }

    return result.ok
      ? { ok: true }
      : { ok: false, error: 'تعذر تأكيد تحديث الملف بهوية الجلسة الحالية.' };
  }, [
    authEpoch,
    backgroundProfileRefresh,
    captureConfirmedAuthOwner,
    confirmedAuthOwner,
    refreshCurrentSessionIdentity,
    synchronizeConfirmedProfileDisplay,
  ]);

  useEffect(() => {
    const subscribedUserId = currentUser?.userId ?? null;
    const subscribedRole = currentUser?.role ?? null;
    if (!subscribedUserId || !subscribedRole || authInitializing || identityRefreshing) return;
    const subscriptionToken = identitySubscriptionGeneration.activate(subscribedUserId);
    const isActive = () => identitySubscriptionGeneration.isActive(subscriptionToken, subscribedUserId);
    const unsubscribe = subscribeToOwnProfileAndAssignment(
      subscribedUserId,
      (changeKind) => {
        if (!isActive()) return;
        if (changeKind === 'profile') {
          const owner = captureConfirmedAuthOwner();
          if (!owner || owner.userId !== subscribedUserId || owner.role !== subscribedRole) return;
          void refreshOwnProfileInBackground(
            subscribedUserId,
            subscribedRole,
            { authEpoch: owner.epoch, userId: owner.userId },
          );
          void refreshPublicExecutiveBoard();
          return;
        }
        void refreshPublicExecutiveBoard();
        void refreshCurrentSessionIdentity(subscribedRole);
      },
      (error) => {
        if (!isActive()) return;
        console.error('Account identity Realtime error.', { code: error.code });
        setRealtimeWarning((current) => reduceRealtimeWarning(current, { kind: 'error', active: true }));
        void refreshPublicExecutiveBoard();
        void refreshCurrentSessionIdentity(subscribedRole);
      },
      () => {
        const active = isActive();
        setRealtimeWarning((current) => reduceRealtimeWarning(current, { kind: 'subscribed', active }));
      },
    );

    return () => {
      identitySubscriptionGeneration.invalidate(subscriptionToken);
      void unsubscribe().then((result) => {
        if (!result.ok) {
          console.error('Account identity Realtime cleanup failed.', { code: result.error.code });
        }
      });
    };
  }, [
    authInitializing,
    captureConfirmedAuthOwner,
    currentUser?.role,
    currentUser?.userId,
    identityRefreshing,
    identitySubscriptionGeneration,
    refreshCurrentSessionIdentity,
    refreshOwnProfileInBackground,
    refreshPublicExecutiveBoard,
  ]);

  useEffect(() => {
    if (currentUser?.role !== 'PRESIDENT' || authInitializing || identityRefreshing) return;
    void refreshAccountDirectory().then((result) => {
      if (!result.ok) setAuthError(result.error ?? 'تعذر تحديث دليل الأعضاء.');
    });
  }, [authInitializing, currentUser?.role, currentUser?.userId, identityRefreshing, refreshAccountDirectory]);

  const requestPasswordReset: AppContextValue['requestPasswordReset'] = async (email) => {
    const redirectTo = buildPasswordRecoveryRedirectUrl({
      origin: window.location.origin,
      pathname: window.location.pathname,
    });
    const result = await requestPasswordResetService(email, redirectTo);
    if (!result.ok) console.error('Supabase password recovery email request failed.');
    return result;
  };

  const updateRecoveredPassword: AppContextValue['updateRecoveredPassword'] = async (password) => {
    const result = await updateRecoveredPasswordService(
      password,
      passwordRecoveryGateRef.current === 'READY',
    );
    if (!result.ok) console.error('Supabase recovered password update failed.');
    return result;
  };

  const finishPasswordRecovery: AppContextValue['finishPasswordRecovery'] = async () => {
    clearConfirmedAuthOwnership();
    identitySubscriptionGeneration.invalidateAll();
    const finishEpoch = authEpoch.suspendEvents();
    latestAuthEventRef.current = null;
    setCurrentStudent(null);
    setCurrentUser(null);
    setAuthError(null);
    setAuthInitializing(false);
    setIdentityRefreshing(false);
    setPasswordRecoveryGate('IDLE');
    explicitLoginIntentEpochRef.current = null;

    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.error('Supabase recovery session sign-out failed.', { code: error.code ?? 'unknown' });
    } catch {
      console.error('Supabase recovery session sign-out request failed.');
    } finally {
      if (authEpoch.isCurrent(finishEpoch)) authEpoch.allowEvents();
      setView({ kind: 'login' });
    }
  };

  // Supabase Auth is the only password verifier; the confirmed profile and
  // assignment loaded by applySession are the only identity/role source.
  const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    const emailLower = email.toLowerCase().trim();
    if (!emailLower || !password) {
      return { ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
    }
    ownProfileOperationOwnerRef.current = null;
    setPasswordRecoveryGate('IDLE');
    setOwnProfileOperationResults(EMPTY_OWN_PROFILE_OPERATION_RESULTS);
    clearConfirmedAuthOwnership();
    identitySubscriptionGeneration.invalidateAll();
    const loginEpoch = authEpoch.beginOperation();
    explicitLoginIntentEpochRef.current = loginEpoch;
    latestAuthEventRef.current = null;
    setCurrentStudent(null);
    setCurrentUser(null);
    setAuthError(null);
    setAuthInitializing(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailLower,
        password,
      });
      if (error || !data.session) {
        explicitLoginIntentEpochRef.current = null;
        if (authEpoch.isCurrent(loginEpoch)) setAuthInitializing(false);
        return { ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
      }
      const eventCapture = latestAuthEventRef.current as { epoch: number; session: Session | null } | null;
      const sessionEpoch = resolveOwnedOperationEpoch({
        controller: authEpoch,
        operationEpoch: loginEpoch,
        operationSession: data.session,
        latestEvent: eventCapture,
      });
      if (sessionEpoch === null) {
        explicitLoginIntentEpochRef.current = null;
        return { ok: false, error: 'تم استبدال محاولة تسجيل الدخول بمحاولة أحدث.' };
      }
      authEpoch.cancelScheduled(sessionEpoch);
      return await applySession(data.session, sessionEpoch, 'explicit-login');
    } catch (error) {
      explicitLoginIntentEpochRef.current = null;
      console.error('Supabase password sign-in failed:', error);
      if (authEpoch.isCurrent(loginEpoch)) setAuthInitializing(false);
      return { ok: false, error: 'تعذر الاتصال بخدمة تسجيل الدخول. يرجى المحاولة لاحقاً.' };
    }
  };

  const registerWithApplication = async (
    name: string,
    email: string,
    password: string,
    university: string,
    major: string,
    year: string,
    phone: string,
    motivation: string,
  ): Promise<{ ok: boolean; error?: string; requiresEmailConfirmation?: boolean; emailWarning?: string }> => {
    const emailLower = email.toLowerCase().trim();
    if (!emailLower || !password || !name.trim()) {
      return { ok: false, error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة.' };
    }

    setPasswordRecoveryGate('IDLE');
    clearConfirmedAuthOwnership();
    identitySubscriptionGeneration.invalidateAll();
    const signupEpoch = authEpoch.beginOperation();
    explicitLoginIntentEpochRef.current = signupEpoch;
    latestAuthEventRef.current = null;
    setCurrentStudent(null);
    setCurrentUser(null);
    setAuthError(null);
    setAuthInitializing(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailLower,
        password,
        options: {
          data: {
            name: name.trim(),
            contact_email: emailLower,
            university,
            major,
            year,
            phone,
            motivation,
          },
        },
      });
      const eventCapture = latestAuthEventRef.current as { epoch: number; session: Session | null } | null;
      const responseEpoch = resolveOwnedOperationEpoch({
        controller: authEpoch,
        operationEpoch: signupEpoch,
        operationSession: data.session,
        latestEvent: eventCapture,
      });
      if (responseEpoch === null) {
        explicitLoginIntentEpochRef.current = null;
        return { ok: false, error: 'تم استبدال محاولة إنشاء الحساب بمحاولة مصادقة أحدث.' };
      }

      const signupResult = classifySignupResult({
        user: data.user,
        session: data.session,
        error,
      });
      if (signupResult.kind === 'failure') {
        explicitLoginIntentEpochRef.current = null;
        console.error('Supabase signup failed.');
        if (authEpoch.isCurrent(responseEpoch)) setAuthInitializing(false);
        return { ok: false, error: 'تعذر إنشاء الحساب. تحقق من البريد الإلكتروني أو حاول لاحقاً.' };
      }
      if (signupResult.kind === 'existing-or-disguised') {
        explicitLoginIntentEpochRef.current = null;
        setAuthInitializing(false);
        return {
          ok: false,
          error: 'تعذر إنشاء حساب جديد بهذه البيانات. حاول تسجيل الدخول أو استعادة كلمة المرور.',
        };
      }

      const emailDelivery = await deliverApplicationEmailAfterCommit(
        sendApplicationNotification,
        `signup_${signupResult.userId}`,
        'NEW_APPLICATION',
      );
      if (emailDelivery.emailWarning) {
        console.error('New application was saved but its president email notification is delayed.');
      }

      if (signupResult.kind === 'signed-in' && data.session) {
        authEpoch.cancelScheduled(responseEpoch);
        const sessionResult = await applySession(data.session, responseEpoch, 'explicit-login');
        return sessionResult.ok ? { ...sessionResult, ...emailDelivery } : sessionResult;
      }

      explicitLoginIntentEpochRef.current = null;
      if (!authEpoch.isCurrent(responseEpoch)) {
        return { ok: false, error: 'تم استبدال محاولة إنشاء الحساب بمحاولة مصادقة أحدث.' };
      }
      setCurrentStudent(null);
      setCurrentUser(null);
      setAuthInitializing(false);
      return { ok: true, requiresEmailConfirmation: true, ...emailDelivery };
    } catch (error) {
      explicitLoginIntentEpochRef.current = null;
      console.error('Supabase signup request failed:', error);
      if (authEpoch.isCurrent(signupEpoch)) setAuthInitializing(false);
      return { ok: false, error: 'تعذر الاتصال بخدمة إنشاء الحساب. يرجى المحاولة لاحقاً.' };
    }
  };

  const scheduleInterview: AppContextValue['scheduleInterview'] = async (applicationId, interview) => {
    const result = await scheduleStudentApplicationInterview(applicationId, interview);
    if (!result.ok) {
      console.error('Failed to schedule application interview.', { code: result.error.code });
      return { ok: false, error: 'تعذر حفظ موعد المقابلة. تحقق من صلاحيتك وحاول مرة أخرى.' };
    }

    setApplications((previous) => previous.map((application) => (
      application.id === result.data.id ? result.data : application
    )));
    const emailDelivery = await deliverApplicationEmailAfterCommit(
      sendApplicationNotification,
      result.data.id,
      'INTERVIEW_SCHEDULED',
    );
    if (emailDelivery.emailWarning) {
      console.error('Interview was saved but its student email notification is delayed.');
    }
    await refreshApplicationEmailNotifications();
    return { ok: true, ...emailDelivery };
  };

  const decideApplication: AppContextValue['decideApplication'] = async (
    applicationId,
    status,
    rejectionReason,
  ) => {
    const result = await decideStudentApplication(applicationId, status, rejectionReason);
    if (!result.ok) {
      console.error('Failed to decide student application.', { code: result.error.code });
      return { ok: false, error: 'تعذر حفظ القرار. تحقق من صلاحيتك وحالة الطلب ثم حاول مرة أخرى.' };
    }

    // The accepted profile activation and application decision are committed in
    // one database transaction. Publish only the returned authoritative row.
    setApplications((previous) => previous.map((application) => (
      application.id === result.data.id ? result.data : application
    )));
    const emailDelivery = await deliverApplicationEmailAfterCommit(
      sendApplicationNotification,
      result.data.id,
      status === 'accepted' ? 'ACCEPTED' : 'REJECTED',
    );
    if (emailDelivery.emailWarning) {
      console.error('Application decision was saved but its student email notification is delayed.');
    }
    await refreshApplicationEmailNotifications();
    return { ok: true, ...emailDelivery };
  };

  const retryApplicationEmailNotification: AppContextValue['retryApplicationEmailNotification'] = async (
    applicationId,
    eventType,
  ) => {
    const result = await retryApplicationEmailNotificationService(applicationId, eventType);
    await refreshApplicationEmailNotifications();
    return result.ok
      ? { ok: true }
      : { ok: false, error: 'تعذر إعادة إرسال البريد حالياً. تم الاحتفاظ بالسجل للمحاولة لاحقاً.' };
  };

  const logout = async () => {
    try {
      await detachCurrentPushBindingBeforeLogout();
    } catch (error) {
      console.warn('Push subscription detach before logout failed.', error);
    }
    clearConfirmedAuthOwnership();
    identitySubscriptionGeneration.invalidateAll();
    const logoutEpoch = authEpoch.suspendEvents();
    latestAuthEventRef.current = null;
    explicitLoginIntentEpochRef.current = null;
    const currentUserId = currentUser?.userId;
    setCurrentStudent(null);
    setCurrentUser(null);
    setAuthError(null);
    setAuthInitializing(false);
    setPasswordRecoveryGate('IDLE');
    clearLastAdminTab(currentUserId);
    navigate({ kind: 'home' }, { replace: true });

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase sign-out failed.', { code: error.code ?? 'unknown' });
        if (authEpoch.isCurrent(logoutEpoch)) {
          setAuthError('تم تسجيل خروجك محلياً، لكن تعذر إنهاء الجلسة على الخادم. حاول مرة أخرى لاحقاً.');
        }
        return;
      }
      if (authEpoch.isCurrent(logoutEpoch)) authEpoch.allowEvents();
    } catch {
      console.error('Supabase sign-out request failed.');
      if (authEpoch.isCurrent(logoutEpoch)) {
        setAuthError('تم تسجيل خروجك محلياً، لكن تعذر الاتصال بخدمة المصادقة. حاول مرة أخرى لاحقاً.');
      }
    }
  };

  // RBAC visibility: PRESIDENT sees everything, each committee head sees only the
  // suggestions targeted to their own role, and students see only their own.
  const getVisibleSuggestions: AppContextValue['getVisibleSuggestions'] = () => {
    if (!currentUser) return [];
    if (currentUser.role === 'PRESIDENT') return suggestions;
    if (isLeadershipRole(currentUser.role)) {
      return suggestions.filter((s) => s.targetRole === currentUser.role);
    }
    const ownId = currentStudent?.id;
    const ownEmail = emailKey(currentUser.email);
    return suggestions.filter(
      (s) => (ownId && s.studentId === ownId) || (s.studentEmail && emailKey(s.studentEmail) === ownEmail)
    );
  };

  // Reply rights: the targeted official OR the president (as direct supervisor).
  const canRespondToSuggestion: AppContextValue['canRespondToSuggestion'] = (suggestion) => {
    if (!currentUser || !isLeadershipRole(currentUser.role)) return false;
    if (currentUser.role === 'PRESIDENT') return true;
    return suggestion.targetRole === currentUser.role;
  };

  // Respond to a suggestion + update its status. Returns false when the caller has
  // no permission (targeted to another committee) so the UI can stay read-only.
  const respondToSuggestion: AppContextValue['respondToSuggestion'] = (id, reply, status) => {
    const target = suggestions.find((s) => s.id === id);
    if (!target || !canRespondToSuggestion(target)) return false;
    const response: SuggestionResponse = {
      id: 'r' + Date.now() + Math.random().toString(36).slice(2, 6),
      by: currentUser?.name ?? 'الإدارة',
      byRole: currentUser ? ROLE_LABEL[currentUser.role] : 'الإدارة',
      text: reply,
      at: todayStr(),
    };
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, responses: [...s.responses, response] } : s))
    );
    return true;
  };

  const upsertEditRequestRow = (request: EditRequest) => {
    setEditRequestRows((previous) => [
      request,
      ...previous.filter((existing) => existing.id !== request.id),
    ]);
  };

  const submitProfileEdit: AppContextValue['submitProfileEdit'] = async (committeeId, snapshot) => {
    const failSubmission = (error: string, diagnostic?: unknown) => {
      setEditRequestsError(error);
      return { ok: false as const, error, ...(diagnostic === undefined ? {} : { diagnostic }) };
    };
    const owner = captureConfirmedAuthOwner();
    if (
      !currentUser
      || !owner
      || currentUser.userId !== owner.userId
      || currentUser.role === 'STUDENT'
      || currentUser.committee !== committeeId
    ) {
      return failSubmission('لا يمكنك إرسال تعديل إلا لمحتوى لجنتك المرتبط بحسابك الحالي.');
    }
    const committee = committees.find((c) => c.id === committeeId);
    if (!committee) return failSubmission('تعذر العثور على بطاقة اللجنة المطلوب تعديلها.');
    if (pendingProfileEdits.some((edit) => (
      edit.committeeId === committeeId && edit.submittedByUserId === owner.userId
    ))) {
      return failSubmission('لديك طلب تعديل معلق لهذه البطاقة. انتظر قرار رئيس الاتحاد قبل إرسال طلب جديد.');
    }
    const proposedSnapshot = projectExecutiveContentSnapshot(snapshot);
    const currentSnapshot = projectExecutiveContentSnapshot({
      responsibilities: committee.responsibilities,
      stats: committee.stats,
      members: committee.members,
    });
    if (!proposedSnapshot || !currentSnapshot) {
      return failSubmission('بيانات تعديل الهيئة غير صالحة أو تحتوي حقولاً غير مسموح بها.');
    }
    if (JSON.stringify(proposedSnapshot) === JSON.stringify(currentSnapshot)) {
      return failSubmission('لا توجد تغييرات في محتوى اللجنة لإرسالها. بيانات الملف الأساسية تُحفظ من صفحة الملف الشخصي مباشرة.');
    }
    const result = await runExecutiveEditSubmission({
      submit: (confirmedSnapshot) => submitStructuredProfileEditRequest({ proposedSnapshot: confirmedSnapshot }),
      publishRequest: upsertEditRequestRow,
    }, proposedSnapshot);
    if (!result.ok) {
      const serverDiagnostic = `${result.error.code} ${result.error.message}`;
      const duplicate = serverDiagnostic.includes('PROFILE_EDIT_ALREADY_PENDING');
      const invalidStoredMember = serverDiagnostic.includes('PROFILE_EDIT_INVALID_MEMBER');
      const unauthorized = result.error.code === '42501';
      const message = duplicate
        ? 'لديك طلب تعديل معلق لهذه البطاقة. انتظر قرار رئيس الاتحاد قبل إرسال طلب جديد.'
        : invalidStoredMember
          ? 'تعذر قراءة بيانات بطاقة الهيئة المخزنة. حدّث الصفحة ثم أعد المحاولة، وإن استمر الخطأ فتواصل مع الإدارة.'
          : unauthorized
            ? 'انتهت صلاحية جلسة الهيئة أو تغير تكليفك. سجّل الدخول مرة أخرى ثم أعد المحاولة.'
            : 'تعذر إرسال طلب تعديل الهيئة إلى الخادم. لم يُسجل أي طلب.';
      setEditRequestsError(message);
      if (duplicate) void refreshEditRequests();
      return { ok: false, error: message, diagnostic: result.error };
    }
    const edit = mapEditRequestToProfileEdit(result.data);
    if (!edit) {
      return failSubmission(
        'أعاد الخادم طلبًا غير صالح للتطبيق، لذلك لم يُعرض كطلب ناجح.',
        { code: 'PROFILE_EDIT_RESPONSE_INVALID', requestId: result.data.id },
      );
    }
    setEditRequestsError(null);
    return { ok: true, data: edit };
  };

  const approveProfileEdit: AppContextValue['approveProfileEdit'] = async (editId) => {
    return approveProfileEditWithChanges(editId);
  };

  const approveProfileEditWithChanges: AppContextValue['approveProfileEditWithChanges'] = async (
    editId,
    revised,
    decisionNote,
  ) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || owner.role !== 'PRESIDENT') return { ok: false, error: 'الاعتماد متاح للرئيس الحالي فقط.' };
    const edit = pendingProfileEdits.find((candidate) => candidate.id === editId);
    if (!edit) {
      return { ok: false, error: 'لم يعد طلب تعديل الهيئة معلقًا.' };
    }
    const result = await runExecutiveEditApproval({
      approve: async (requestId, approvedSnapshot, note) => {
        const serviceResult = await approveStructuredProfileEditRequest(requestId, approvedSnapshot, note);
        const currentOwner = captureConfirmedAuthOwner();
        if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || currentOwner.role !== 'PRESIDENT') {
          return { ok: false, error: { code: 'SESSION_CHANGED', message: 'تغيرت جلسة الرئيس أثناء الاعتماد.' } };
        }
        return serviceResult;
      },
      publishCommittees: (publication) => applyCmsPublication(
        'committees', publication.payload, publication.version,
      ),
      publishRequest: upsertEditRequestRow,
    }, editId, revised, decisionNote);
    if (!result.ok) {
      const error = result.error.message || 'تعذر اعتماد طلب تعديل الهيئة. لم تُنشر أي تغييرات.';
      setEditRequestsError(error);
      void refreshEditRequests();
      return { ok: false, error };
    }
    setEditRequestsError(null);
    return { ok: true };
  };

  const rejectProfileEdit: AppContextValue['rejectProfileEdit'] = async (editId) => {
    const edit = pendingProfileEdits.find((candidate) => candidate.id === editId);
    if (!edit) {
      return { ok: false, error: 'لم يعد طلب تعديل الهيئة معلقًا.' };
    }
    const result = await runExecutiveEditRejection({
      reject: rejectStructuredProfileEditRequest,
      publishRequest: upsertEditRequestRow,
    }, editId);
    if (!result.ok) {
      const error = 'تعذر رفض طلب تعديل الهيئة. بقي الطلب معلقًا.';
      setEditRequestsError(error);
      return { ok: false, error };
    }
    setEditRequestsError(null);
    return { ok: true };
  };

  // Executive identity is profile-owned. The president manages assignments via
  // the transfer RPC, but may not write another account's mutable profile.
  const updateBoardHead: AppContextValue['updateBoardHead'] = async (committeeId, data) => {
    const owner = captureConfirmedAuthOwner();
    const targetUserId = owner
      ? resolveOwnExecutiveProfileTarget(owner, committeeId) ?? ''
      : '';
    const prepared = prepareOwnExecutiveProfileUpdate({
      actorUserId: owner?.userId ?? '',
      targetUserId,
      changes: data,
    });
    if (!owner || !prepared.ok) {
      return { ok: false, error: 'يمكن لكل مسؤول تعديل ملفه الشخصي فقط.' };
    }

    const result = await updateOwnProfileService(owner.userId, prepared.data);
    if (!result.ok) {
      return { ok: false, error: 'تعذر حفظ الملف الشخصي. حاول مرة أخرى.' };
    }
    const refresh = await refreshOwnProfileInBackground(
      owner.userId,
      owner.role,
      { authEpoch: owner.epoch, userId: owner.userId },
    );
    return refresh.ok
      ? { ok: true, message: 'تم حفظ بيانات الملف الشخصي ومزامنتها.' }
      : { ok: false, error: refresh.error ?? 'تم الحفظ وتعذر تأكيد المزامنة.' };
  };

  const updatePresidentProfile: AppContextValue['updatePresidentProfile'] = async (updates) => {
    await updateBoardHead('presidency', updates);
  };

  // The member currently holding a given leadership role (undefined if vacant).
  const getRoleHolder: AppContextValue['getRoleHolder'] = (role) => {
    if (role === 'STUDENT') return undefined;
    return members.find((m) => m.role === role && m.status === 'active');
  };

  const transferMemberRole: AppContextValue['transferMemberRole'] = async (memberId, role) => {
    const target = members.find((member) => member.id === memberId);
    if (!target) {
      return { ok: false, error: 'لم يعد العضو المحدد موجوداً في الدليل المحدث.' };
    }
    const previousHolder = role === 'STUDENT' ? undefined : getRoleHolder(role);
    const actorRole = currentUser?.role ?? 'STUDENT';
    let reloadIdentity = async (): Promise<{ ok: boolean; error?: string }> => ({
      ok: false,
      error: 'لم يبدأ تحديث صلاحيات الجلسة.',
    });
    const result = await executeExecutiveTransfer({
      actor: currentUser ? { role: currentUser.role } : null,
      target: { id: target.id, name: target.name },
      position: role,
      previousHolder: previousHolder
        ? { id: previousHolder.id, name: previousHolder.name }
        : null,
      transfer: transferExecutiveAssignment,
      gateAuthority: () => {
        reloadIdentity = prepareCurrentSessionIdentityRefresh(actorRole);
      },
      refreshDirectory: refreshAccountDirectory,
      reloadIdentity: () => reloadIdentity(),
    });
    return result;
  };

  const revokeExecutiveAssignment: AppContextValue['revokeExecutiveAssignment'] = async (memberId) => {
    const target = members.find((member) => member.id === memberId);
    if (!target) {
      return { ok: false, error: 'لم يعد العضو المحدد موجوداً في الدليل المحدث.' };
    }
    return executeExecutiveRevocation({
      actor: currentUser ? { role: currentUser.role, userId: currentUser.userId } : null,
      target: { id: target.id, name: target.name, role: target.role },
      revoke: revokeExecutiveAssignmentService,
      refreshDirectory: refreshAccountDirectory,
    });
  };

  const removeMember: AppContextValue['removeMember'] = async (memberId) => {
    const actor = captureConfirmedAuthOwner();
    if (actor?.role === 'PRESIDENT' && !members.some((member) => member.id === memberId)) {
      return { ok: false, error: 'لم يعد العضو المحدد موجوداً في الدليل المحدث.' };
    }
    const isOwnershipCurrent = () => {
      const current = captureConfirmedAuthOwner();
      return Boolean(actor
        && current?.epoch === actor.epoch
        && current.userId === actor.userId
        && current.role === 'PRESIDENT');
    };
    return executeMemberRemoval({
      actor,
      targetUserId: memberId,
      remove: removeMemberMembership,
      isOwnershipCurrent,
      refreshDirectory: refreshAccountDirectory,
    });
  };

  const updateMemberProfile: AppContextValue['updateMemberProfile'] = (memberId, data) => {
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, ...data } : m));
    setCommittees((prev) =>
      prev.map((c) => {
          if (c.head?.id !== memberId) return c;
          const head = c.head ?? { id: '', name: '', role: '', bio: '', photo: '', email: '' };
          return {
            ...c,
            head: {
              ...head,
              name: data.name ?? head.name,
              email: data.email ?? head.email,
              photo: data.photo ?? head.photo,
              phone: data.phone ?? head.phone,
              university: data.university ?? head.university,
              major: data.major ?? head.major,
              year: data.year ?? head.year,
            },
          };
        })
    );
    setCurrentUser((current) => current?.userId === memberId
      ? {
          ...current,
          name: data.name ?? current.name,
          contactEmail: data.email ?? current.contactEmail,
          university: data.university ?? current.university,
          major: data.major ?? current.major,
          year: data.year ?? current.year,
          phone: data.phone ?? current.phone,
          photo: data.photo ?? current.photo,
          avatarPath: data.photo ?? current.avatarPath,
        }
      : current);
    setCurrentStudent((current) => current && (current.userId ?? current.id) === memberId
      ? {
          ...current,
          name: data.name ?? current.name,
          contactEmail: data.email ?? current.contactEmail,
          university: data.university ?? current.university,
          major: data.major ?? current.major,
          year: data.year ?? current.year,
          phone: data.phone ?? current.phone,
          photo: data.photo ?? current.photo,
        }
      : current);
  };

  const updateCommitteeVision: AppContextValue['updateCommitteeVision'] = (committeeId, data) => {
    setCommittees((prev) => prev.map((c) => c.id === committeeId ? { ...c, ...data } : c));
  };

  const createOperationsForOwner = (capturedOwner: ConfirmedAuthOwner) => {
    const ownership = { authEpoch: capturedOwner.epoch, userId: capturedOwner.userId };
    const isExactOwnerCurrent = () => {
      const owner = captureConfirmedAuthOwner();
      return owner?.epoch === capturedOwner.epoch && owner.userId === capturedOwner.userId;
    };
    return createOwnProfileOperations<File>({
      getIdentity: () => isExactOwnerCurrent()
        ? {
            userId: capturedOwner.userId,
            loginEmail: capturedOwner.loginEmail,
            role: capturedOwner.role,
            ownership,
          }
        : null,
      updateProfile: updateOwnProfileService,
      uploadAvatar: uploadOwnAvatarService,
      deleteAvatar: deleteOwnAvatarService,
      changePassword: (loginEmail, currentPassword, newPassword, operationOwnership) => (
        changeOwnPasswordService(loginEmail, currentPassword, newPassword, {
          expectedUserId: operationOwnership.userId,
        })
      ),
      isOwnershipCurrent: (operationOwnership, userId) => {
        const owner = captureConfirmedAuthOwner();
        return operationOwnership.userId === userId
          && owner?.epoch === operationOwnership.authEpoch
          && owner.userId === operationOwnership.userId;
      },
      refreshIdentity: refreshOwnProfileInBackground,
    });
  };

  const clearOwnProfileOperationResult: AppContextValue['clearOwnProfileOperationResult'] = (kind) => {
    setOwnProfileOperationResults((current) => ({ ...current, [kind]: null }));
  };

  const publishOwnProfileResult = (
    kind: OwnProfileOperationKind,
    ownership: OwnProfileOperationOwnership | null,
    result: OwnProfileOperationResult,
  ) => {
    const owner = captureConfirmedAuthOwner();
    if (!canPublishOwnProfileOperationResult({
      ownership,
      activeUserId: owner?.userId ?? null,
      isAuthEpochCurrent: (capturedEpoch) => authEpoch.isCurrent(capturedEpoch),
    })) return;
    setOwnProfileOperationResults((current) => ({ ...current, [kind]: result }));
  };

  const updateOwnProfile: AppContextValue['updateOwnProfile'] = async (data) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner) return { ok: false, error: 'تعذر تنفيذ العملية لأن هوية الحساب غير مؤكدة. سجّل الدخول مجدداً.' };
    const ownership = { authEpoch: owner.epoch, userId: owner.userId };
    ownProfileOperationOwnerRef.current = owner.userId;
    clearOwnProfileOperationResult('profile');
    const result = await createOperationsForOwner(owner).updateProfile(data);
    publishOwnProfileResult('profile', ownership, result);
    return result;
  };
  const uploadOwnAvatar: AppContextValue['uploadOwnAvatar'] = async (file) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner) return { ok: false, error: 'تعذر تنفيذ العملية لأن هوية الحساب غير مؤكدة. سجّل الدخول مجدداً.' };
    const ownership = { authEpoch: owner.epoch, userId: owner.userId };
    ownProfileOperationOwnerRef.current = owner.userId;
    clearOwnProfileOperationResult('avatar');
    const result = await createOperationsForOwner(owner).uploadAvatar(file);
    publishOwnProfileResult('avatar', ownership, result);
    return result;
  };
  const deleteOwnAvatar: AppContextValue['deleteOwnAvatar'] = async () => {
    const owner = captureConfirmedAuthOwner();
    if (!owner) return { ok: false, error: 'تعذر تنفيذ العملية لأن هوية الحساب غير مؤكدة. سجّل الدخول مجدداً.' };
    const ownership = { authEpoch: owner.epoch, userId: owner.userId };
    ownProfileOperationOwnerRef.current = owner.userId;
    clearOwnProfileOperationResult('avatar');
    const result = await createOperationsForOwner(owner).deleteAvatar();
    publishOwnProfileResult('avatar', ownership, result);
    return result;
  };
  const changeOwnPassword: AppContextValue['changeOwnPassword'] = async (currentPassword, newPassword) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner) return { ok: false, error: 'تعذر تنفيذ العملية لأن هوية الحساب غير مؤكدة. سجّل الدخول مجدداً.' };
    const ownership = { authEpoch: owner.epoch, userId: owner.userId };
    ownProfileOperationOwnerRef.current = owner.userId;
    clearOwnProfileOperationResult('password');
    const result = await createOperationsForOwner(owner).changePassword(currentPassword, newPassword);
    publishOwnProfileResult('password', ownership, result);
    return result;
  };

  const registerForEvent = (eventId: string) => {
    if (!currentStudent || !canUseMemberFeatures(studentAccess)) return;
    setCurrentStudent((prev) =>
      prev
        ? {
            ...prev,
            registeredEvents: prev.registeredEvents.includes(eventId)
              ? prev.registeredEvents
              : [...prev.registeredEvents, eventId],
          }
        : prev
    );
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, registered: Math.min(e.registered + 1, e.capacity) }
          : e
      )
    );
  };

  const unregisterFromEvent = (eventId: string) => {
    if (!currentStudent || !canUseMemberFeatures(studentAccess)) return;
    setCurrentStudent((prev) =>
      prev
        ? {
            ...prev,
            registeredEvents: prev.registeredEvents.filter((id) => id !== eventId),
          }
        : prev
    );
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, registered: Math.max(e.registered - 1, 0) }
          : e
      )
    );
  };

  const refreshVisibleContactMessages = async () => {
    if (!currentUser?.userId) return;
    const result = await listVisibleContactMessages();
    if (result.ok) {
      setContactMessages(result.data);
      setContactMessagesError(null);
    } else {
      setContactMessagesError(result.error.message);
    }
  };

  const addContactMessage: AppContextValue['addContactMessage'] = async (message) => {
    const result = await submitContactMessage({
      senderName: message.name,
      senderEmail: message.email,
      subject: message.subject,
      message: message.body,
    });
    if (!result.ok) return { ok: false, error: result.error.message };
    await refreshVisibleContactMessages();
    return { ok: true };
  };

  const markContactMessageRead: AppContextValue['markContactMessageRead'] = async (messageId) => {
    if (!currentUser || !canAccessContactInbox(currentUser.role)) {
      return { ok: false, error: 'قراءة البريد الإداري متاحة للرئيس ونائبه فقط.' };
    }
    const result = await markContactMessageReadService(messageId);
    if (!result.ok) return { ok: false, error: result.error.message };
    setContactMessages((rows) => rows.map((row) => row.id === messageId
      ? { ...row, status: result.data.status, readAt: result.data.readAt, readBy: result.data.readBy }
      : row));
    return { ok: true };
  };

  const replyToContactMessage: AppContextValue['replyToContactMessage'] = async (messageId, replyText) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !canAccessContactInbox(owner.role)) {
      return { ok: false, error: 'الرد متاح للرئيس ونائبه الحاليين فقط.' };
    }
    const result = await replyToContactMessageService(messageId, replyText);
    if (!result.ok) {
      const error = result.error.message === 'CONTACT_MESSAGE_ALREADY_REPLIED'
        ? 'تم الرد على هذه الرسالة مسبقاً.'
        : result.error.message;
      return { ok: false, error };
    }
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch) {
      return { ok: false, error: 'تغيرت الجلسة أثناء إرسال الرد؛ حدّث الصفحة لعرض السجل الرسمي.' };
    }
    setContactMessages((rows) => rows.map((row) => row.id === messageId
      ? { ...row, status: 'REPLIED', reply: result.data }
      : row));
    if (result.data.deliveryChannel === 'EMAIL') {
      const delivery = await sendPendingContactReplyEmail(result.data.id);
      await refreshVisibleContactMessages();
      return delivery.ok
        ? { ok: true }
        : { ok: true, emailWarning: delivery.error };
    }
    return { ok: true };
  };

  const retryContactReplyEmail: AppContextValue['retryContactReplyEmail'] = async (replyId) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !canAccessContactInbox(owner.role)) {
      return { ok: false, error: 'إعادة إرسال البريد متاحة للرئيس ونائبه فقط.' };
    }
    const result = await sendPendingContactReplyEmail(replyId);
    await refreshVisibleContactMessages();
    return result;
  };

  const canAccessCommittee = (committeeId: CommitteeId): boolean => {
    if (!currentUser) return true;
    if (currentUser.role === 'PRESIDENT') return true;
    if (isLeadershipRole(currentUser.role)) return currentUser.committee === committeeId;
    return true;
  };

  const canAccessAdmin = (): boolean => {
    if (!currentUser) return false;
    return isLeadershipRole(currentUser.role);
  };

  const setByPath = (obj: Record<string, unknown> | unknown[], path: string, value: unknown): Record<string, unknown> | unknown[] => {
    const keys = path.split('.');
    const clone: Record<string, unknown> = Array.isArray(obj) ? [...obj] as unknown as Record<string, unknown> : { ...(obj as Record<string, unknown>) };
    let cur: Record<string, unknown> = clone;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      const idx = Number(k);
      if (!Number.isNaN(idx) && Array.isArray(cur)) {
        cur = cur[idx] as Record<string, unknown>;
      } else {
        cur = (cur[k] as Record<string, unknown>) ?? {};
      }
    }
    const last = keys[keys.length - 1];
    const lastIdx = Number(last);
    if (!Number.isNaN(lastIdx) && Array.isArray(cur)) {
      cur[lastIdx] = value;
    } else {
      cur[last] = value;
    }
    return clone;
  };

  const getByPath = (obj: unknown, path: string): unknown => {
    let cur: unknown = obj;
    for (const k of path.split('.')) {
      if (cur == null) return undefined;
      if (Array.isArray(cur)) {
        const idx = Number(k);
        cur = Number.isNaN(idx) ? (cur as unknown as Record<string, unknown>)[k] : cur[idx];
      } else {
        cur = (cur as Record<string, unknown>)[k];
      }
    }
    return cur;
  };

  const formatValue = (v: unknown): string => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? formatValue(x) : String(x ?? ''))).join(' • ');
    if (v === null || v === undefined) return '';
    return String(v);
  };

  const currentSiteTargetValue = (target: PublishedContentTarget): unknown => {
    switch (target) {
      case 'site': return siteContent;
      case 'about': return aboutContent;
      case 'programsContent': return programsContent;
      case 'events': return events;
      case 'galleryAlbums': return galleryAlbums;
      case 'galleryCategories': return galleryCategories;
      case 'guideSections': return guideSections;
      case 'guideQuickInfo': return guideQuickInfo;
      case 'faqCategories': return faqCategories;
      case 'contactCards': return contactCards;
      case 'contactMap': return contactMap;
      case 'news': return news;
      case 'plans': return plans;
      case 'reports': return reports;
      case 'committees': return committees;
    }
  };

  const publishApprovedSiteValue = (target: PublishedContentTarget, value: unknown) => {
    switch (target) {
      case 'site': setSiteContent(value as SiteContent); break;
      case 'about': setAboutContent(value as AboutContent); break;
      case 'programsContent': setProgramsContent(withProgramsAchievements(value as ProgramsContent)); break;
      case 'events': setEvents(value as UEvent[]); break;
      case 'galleryAlbums': setGalleryAlbums(value as GalleryAlbum[]); break;
      case 'galleryCategories': setGalleryCategories(value as GalleryCategory[]); break;
      case 'guideSections': setGuideSections(value as GuideSectionData[]); break;
      case 'guideQuickInfo': setGuideQuickInfo(value as string); break;
      case 'faqCategories': setFaqCategories(value as FAQCategoryData[]); break;
      case 'contactCards': setContactCards(value as ContactCardData[]); break;
      case 'contactMap': setContactMap(value as ContactMapData); break;
      case 'news': setNews(value as NewsItem[]); break;
      case 'plans': setPlans(value as AdminPlan[]); break;
      case 'reports': setReports(value as AdminReport[]); break;
      case 'committees': setCommittees((current) => (
        mergeInstitutionalCommitteeContent(current, value as Committee[])
      )); break;
    }
  };

  const currentCmsVersions = () => ({
    site: contentVersionRef.current,
    guide: guideVersionRef.current,
    faq: faqVersionRef.current,
  });

  const applyCmsPublication = (target: PublishedContentTarget, payload: unknown, version: number) => {
    const authority = cmsAuthorityForTarget(target);
    if (authority === 'guide') {
      guideVersionRef.current = version;
      setGuideVersion(version);
    } else if (authority === 'faq') {
      faqVersionRef.current = version;
      setFaqVersion(version);
    } else {
      contentVersionRef.current = version;
      setContentVersion(version);
    }
    publishApprovedSiteValue(target, payload);
  };

  const savePublishedSiteTarget: AppContextValue['savePublishedSiteTarget'] = async (target, value) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || owner.role !== 'PRESIDENT') {
      return { ok: false, error: 'النشر المباشر متاح لرئيس الاتحاد الحالي فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion(target, currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await publishCmsTarget(target, value, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner
      || currentOwner.userId !== owner.userId
      || currentOwner.epoch !== owner.epoch
      || currentOwner.role !== 'PRESIDENT') {
      return { ok: false, error: 'تغيرت جلسة الرئيس أثناء الحفظ؛ لم تُنشر النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.code === 'CONTENT_VERSION_CONFLICT'
        ? result.error.message
        : result.error.message || 'تعذر حفظ محتوى الموقع في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication(target, result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  /**
   * Direct own-committee save for any current executive. Only the governing
   * committee's institutional content is sent; the server enforces the
   * assignment and replaces just that committee element under a version lock.
   */
  const saveOwnCommitteeContent: AppContextValue['saveOwnCommitteeContent'] = async (committeeId, snapshot) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner
      || !currentUser
      || currentUser.userId !== owner.userId
      || !canManageCouncilContent(owner, committeeId)) {
      return { ok: false, error: 'يمكنك تعديل محتوى لجنتك الحالية فقط عبر حساب مرتبط بتكليف حالي.' };
    }
    const expectedVersion = selectCmsExpectedVersion('committees', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await publishOwnCommittee(committeeId, snapshot, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner
      || currentOwner.userId !== owner.userId
      || currentOwner.epoch !== owner.epoch
      || !canManageCouncilContent(currentOwner, committeeId)) {
      return { ok: false, error: 'تغير تكليفك أثناء الحفظ؛ لم تُنشر النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.code === 'CONTENT_VERSION_CONFLICT'
        ? result.error.message
        : result.error.message || 'تعذر حفظ محتوى الهيئة في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication('committees', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  /**
   * Direct canonical vision/goals save for the acting executive's own committee
   * (or any committee for the president). Only the vision/goals keys of the
   * matching committee element are replaced under a version lock; the server
   * enforces the assignment and preserves every other committee field.
   */
  const saveOwnCommitteeVision: AppContextValue['saveOwnCommitteeVision'] = async (committeeId, vision, goals) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner
      || !currentUser
      || currentUser.userId !== owner.userId
      || !canManageCouncilContent(owner, committeeId)) {
      return { ok: false, error: 'يمكنك تعديل محتوى لجنتك الحالية فقط عبر حساب مرتبط بتكليف حالي.' };
    }
    const expectedVersion = selectCmsExpectedVersion('committees', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await publishOwnCommitteeFields(committeeId, { vision, goals }, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner
      || currentOwner.userId !== owner.userId
      || currentOwner.epoch !== owner.epoch
      || !canManageCouncilContent(currentOwner, committeeId)) {
      return { ok: false, error: 'تغير تكليفك أثناء الحفظ؛ لم تُنشر النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      if (import.meta.env.DEV) {
        const authenticated = await supabase.auth.getUser();
        console.error('[saveOwnCommitteeVision] persistence failed', {
          rpcError: {
            code: result.error.code,
            message: result.error.message,
            details: result.error.details,
            hint: result.error.hint,
          },
          authUserId: authenticated.data.user?.id ?? null,
          appContextCurrentUserId: currentUser.userId,
          profileId: currentUser.userId,
          executiveAssignmentUserId: owner.userId,
          confirmedOwnerUserId: owner.userId,
          currentUserRole: currentUser.role,
          confirmedOwnerRole: owner.role,
          currentUserCommittee: currentUser.committee ?? null,
          confirmedOwnerCommittee: owner.committee ?? null,
          editedCommitteeId: committeeId,
          rpcCommitteeId: committeeId,
        });
      }
      const error = result.error.code === 'CONTENT_VERSION_CONFLICT'
        ? result.error.message
        : result.error.message || 'تعذر حفظ محتوى الهيئة في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication('committees', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  const createPublishedEvent: AppContextValue['createPublishedEvent'] = async (event) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'إنشاء الفعاليات متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion('events', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await createPublishedEventService(event, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner
      || currentOwner.userId !== owner.userId
      || currentOwner.epoch !== owner.epoch
      || !isLeadershipRole(currentOwner.role)) {
      return { ok: false, error: 'تغيرت صلاحية الحساب أثناء إنشاء الفعالية؛ لم تُعتمد النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.message || 'تعذر إنشاء الفعالية في قاعدة البيانات.';
      setContentError(error);
      console.error('[cms] event creation failed', result.error);
      return { ok: false, error };
    }
    applyCmsPublication('events', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  const updateOwnedEvent: AppContextValue['updateOwnedEvent'] = async (eventId, eventPatch) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'تعديل الفعاليات متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion('events', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await updateOwnedEventService(eventId, eventPatch, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || !isLeadershipRole(currentOwner.role)) {
      return { ok: false, error: 'تغيرت صلاحية الحساب أثناء التعديل؛ لم تُعتمد النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.message || 'تعذر تعديل الفعالية في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication('events', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  const deleteOwnedEvent: AppContextValue['deleteOwnedEvent'] = async (eventId) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'حذف الفعاليات متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion('events', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const { deleteOwnedEvent: serviceDelete } = await import('../services/sectionContentService.ts');
    const result = await serviceDelete(eventId);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || !isLeadershipRole(currentOwner.role)) {
      return { ok: false, error: 'تغيرت صلاحية الحساب أثناء الحذف؛ لم تُعتمد النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.message || 'تعذر حذف الفعالية في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }

    // UI refresh like gallery
    const prevEvents = Array.isArray(events) ? events : [];
    const nextEvents = prevEvents.filter((e: { id: string }) => e.id !== eventId);
    applyCmsPublication('events', nextEvents, result.data.newVersion ?? expectedVersion);
    setContentError(null);
    return { ok: true, eventData: result.data.eventData };
  };

  const createGalleryAlbum: AppContextValue['createGalleryAlbum'] = async (album) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'إنشاء الألبومات متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion('galleryAlbums', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await createGalleryAlbumService(album, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || !isLeadershipRole(currentOwner.role)) {
      return { ok: false, error: 'تغيرت صلاحية الحساب أثناء الإنشاء؛ لم تُعتمد النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.message || 'تعذر إنشاء الألبوم في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication('galleryAlbums', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  const updateOwnedGalleryAlbum: AppContextValue['updateOwnedGalleryAlbum'] = async (albumId, albumPatch) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'تعديل الألبومات متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion('galleryAlbums', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await updateOwnedGalleryAlbumService(albumId, albumPatch, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || !isLeadershipRole(currentOwner.role)) {
      return { ok: false, error: 'تغيرت صلاحية الحساب أثناء التعديل؛ لم تُعتمد النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.message || 'تعذر تعديل الألبوم في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication('galleryAlbums', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  const appendOwnedGalleryMedia: AppContextValue['appendOwnedGalleryMedia'] = async (albumId, media) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'إضافة الوسائط متاحة لأعضاء الهيئة التنفيذية فقط.' };
    }
    const expectedVersion = selectCmsExpectedVersion('galleryAlbums', currentCmsVersions());
    if (expectedVersion < 1) {
      return { ok: false, error: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.' };
    }
    const result = await appendOwnedGalleryMediaService(albumId, media, expectedVersion);
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || !isLeadershipRole(currentOwner.role)) {
      return { ok: false, error: 'تغيرت صلاحية الحساب أثناء الإضافة؛ لم تُعتمد النتيجة في هذه الجلسة.' };
    }
    if (!result.ok) {
      const error = result.error.message || 'تعذر إضافة الوسائط في قاعدة البيانات.';
      setContentError(error);
      return { ok: false, error };
    }
    applyCmsPublication('galleryAlbums', result.data.payload, result.data.version);
    setContentError(null);
    return { ok: true };
  };

  const deleteOwnedGalleryAlbum: AppContextValue['deleteOwnedGalleryAlbum'] = async (albumId) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'حذف الألبومات متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const { data, error } = await supabase.rpc('delete_owned_gallery_album', { p_album_id: albumId });
    if (error || !data || !data.deletedAlbumId) {
      const errMsg = error?.message || 'تعذر حذف الألبوم في قاعدة البيانات.';
      setContentError(errMsg);
      return { ok: false, error: errMsg };
    }

    const newPayload = galleryAlbums.filter(a => a.id !== albumId);
    applyCmsPublication('galleryAlbums', newPayload, contentVersionRef.current + 1);

    setContentError(null);
    return { ok: true, albumData: data.albumData };
  };

  const deleteOwnedGalleryMedia: AppContextValue['deleteOwnedGalleryMedia'] = async (albumId, mediaId) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'حذف الوسائط متاح لأعضاء الهيئة التنفيذية فقط.' };
    }
    const { data, error } = await supabase.rpc('delete_owned_gallery_media', { p_album_id: albumId, p_media_id: mediaId });
    if (error || !data || !data.deletedMediaId) {
      const errMsg = error?.message || 'تعذر حذف الوسائط في قاعدة البيانات.';
      setContentError(errMsg);
      return { ok: false, error: errMsg };
    }

    const newPayload = galleryAlbums.map(album => {
      if (album.id !== albumId) return album;
      const targetMedia = album.media.find(m => m.id === mediaId);
      return {
        ...album,
        media: album.media.filter(m => m.id !== mediaId),
        photoCount: targetMedia?.type === 'photo' ? Math.max(0, album.photoCount - 1) : album.photoCount,
        videoCount: targetMedia?.type === 'video' ? Math.max(0, album.videoCount - 1) : album.videoCount,
      };
    });
    applyCmsPublication('galleryAlbums', newPayload, contentVersionRef.current + 1);

    setContentError(null);
    return { ok: true, mediaUrl: data.mediaData?.url };
  };

  const listOwnEventIds: AppContextValue['listOwnEventIds'] = async () => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'غير مصرح.' };
    }
    const result = await listOwnEventIdsService();
    if (!result.ok) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, data: result.data };
  };

  const listOwnAlbumIds: AppContextValue['listOwnAlbumIds'] = useCallback(async () => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || !isLeadershipRole(owner.role)) {
      return { ok: false, error: 'غير مصرح.' };
    }
    const result = await listOwnAlbumIdsService();
    if (!result.ok) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, data: result.data };
  }, [captureConfirmedAuthOwner]);

  /** Media-head edits are persisted first; the UI changes only after RPC confirmation. */
  const submitSiteEdit: AppContextValue['submitSiteEdit'] = async (input) => {
    const owner = captureConfirmedAuthOwner();
    if (
      !currentUser
      || !owner
      || currentUser.userId !== owner.userId
      || currentUser.role !== 'MEDIA_HEAD'
      || currentUser.committee !== 'media'
    ) {
      setEditRequestsError('هذا النوع من تعديل الموقع متاح للمسؤول الإعلامي الحالي فقط.');
      return null;
    }
    let proposedText: string;
    let canonicalPayload: SiteEditSubmit;
    try {
      proposedText = createSiteEditEnvelope({
        applicantName: currentUser.name,
        applicantEmail: currentUser.contactEmail || currentUser.email,
        ...input,
      });
      const envelope = parseEditRequestEnvelope(proposedText);
      if (envelope?.kind !== 'site') throw new Error('INVALID_SITE_EDIT');
      canonicalPayload = envelope.payload;
    } catch {
      setEditRequestsError('تعذر إرسال التعديل لأن الحقول لا تطابق القسم المسموح به.');
      return null;
    }
    const planned = deriveApprovedSiteValue(
      canonicalPayload,
      canonicalPayload.diffs,
      currentSiteTargetValue(canonicalPayload.target),
    );
    if (!planned.ok) {
      setEditRequestsError(planned.error);
      return null;
    }
    const baseVersion = selectCmsExpectedVersion(canonicalPayload.target, currentCmsVersions());
    if (baseVersion < 1) {
      setEditRequestsError('لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.');
      return null;
    }
    const result = await submitStructuredSiteEditRequest({
      originalText: input.diffs.map((diff) => `${diff.label}: ${diff.oldValue || '—'}`).join(' | '),
      proposedText,
      target: canonicalPayload.target,
      payload: planned.value,
      baseVersion,
    });
    if (!result.ok) {
      setEditRequestsError('تعذر إرسال تعديل الموقع إلى الخادم. لم يُسجل أي تعديل.');
      return null;
    }
    const edit = mapEditRequestToSiteEdit(result.data);
    if (!edit) {
      setEditRequestsError('أعاد الخادم تعديلًا غير صالح للتطبيق، لذلك لم يُعرض كطلب ناجح.');
      return null;
    }
    upsertEditRequestRow(result.data);
    setEditRequestsError(null);
    window.alert('تم إرسال التعديل وحفظه لدى رئيس الاتحاد للمراجعة.');
    return edit;
  };

  const approveSiteEdit: AppContextValue['approveSiteEdit'] = async (editId) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || owner.role !== 'PRESIDENT') return { ok: false, error: 'الاعتماد متاح للرئيس الحالي فقط.' };
    const edit = pendingSiteEdits.find((candidate) => candidate.id === editId);
    if (!edit || edit.status !== 'PENDING_PRESIDENT_APPROVAL') {
      return { ok: false, error: 'لم يعد تعديل الموقع معلقًا.' };
    }
    const planned = deriveApprovedSiteValue(edit, edit.diffs, currentSiteTargetValue(edit.target));
    if (!planned.ok) {
      setEditRequestsError(planned.error);
      return { ok: false, error: planned.error };
    }
    const result = await approveStructuredSiteEditRequest(editId, planned.value);
    if (!result.ok) {
      const error = result.error.message || 'تعذر اعتماد تعديل الموقع. لم تُنشر أي تغييرات.';
      setEditRequestsError(error);
      return { ok: false, error };
    }
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || currentOwner.role !== 'PRESIDENT') {
      return { ok: false, error: 'تغيرت جلسة الرئيس أثناء الاعتماد؛ حدّث الصفحة لعرض النتيجة الرسمية.' };
    }
    applyCmsPublication(
      result.data.publication.target as PublishedContentTarget,
      result.data.publication.payload,
      result.data.publication.version,
    );
    upsertEditRequestRow(result.data.request);
    setEditRequestsError(null);
    return { ok: true };
  };

  const rejectSiteEdit: AppContextValue['rejectSiteEdit'] = async (editId) => {
    const edit = pendingSiteEdits.find((candidate) => candidate.id === editId);
    if (!edit || edit.status !== 'PENDING_PRESIDENT_APPROVAL') {
      return { ok: false, error: 'لم يعد تعديل الموقع معلقًا.' };
    }
    const result = await rejectStructuredSiteEditRequest(editId);
    if (!result.ok) {
      const error = 'تعذر رفض تعديل الموقع. بقي الطلب معلقًا.';
      setEditRequestsError(error);
      return { ok: false, error };
    }
    upsertEditRequestRow(result.data);
    setEditRequestsError(null);
    return { ok: true };
  };

  const approveSiteEditWithChanges: AppContextValue['approveSiteEditWithChanges'] = async (editId, revisedDiffs) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || owner.role !== 'PRESIDENT') return { ok: false, error: 'الاعتماد متاح للرئيس الحالي فقط.' };
    const edit = pendingSiteEdits.find((candidate) => candidate.id === editId);
    if (!edit || edit.status !== 'PENDING_PRESIDENT_APPROVAL') {
      return { ok: false, error: 'لم يعد تعديل الموقع معلقًا.' };
    }
    const planned = deriveApprovedSiteValue(edit, revisedDiffs, currentSiteTargetValue(edit.target));
    if (!planned.ok) {
      setEditRequestsError(planned.error);
      return { ok: false, error: planned.error };
    }
    const result = await approveStructuredSiteEditRequest(
      editId,
      planned.value,
      createEditedApprovalNote(revisedDiffs),
    );
    if (!result.ok) {
      const error = 'تعذر اعتماد النسخة المعدلة. لم تُنشر أي تغييرات.';
      setEditRequestsError(error);
      return { ok: false, error };
    }
    const currentOwner = captureConfirmedAuthOwner();
    if (!currentOwner || currentOwner.userId !== owner.userId || currentOwner.epoch !== owner.epoch || currentOwner.role !== 'PRESIDENT') {
      return { ok: false, error: 'تغيرت جلسة الرئيس أثناء الاعتماد؛ حدّث الصفحة لعرض النتيجة الرسمية.' };
    }
    applyCmsPublication(
      result.data.publication.target as PublishedContentTarget,
      result.data.publication.payload,
      result.data.publication.version,
    );
    upsertEditRequestRow(result.data.request);
    setEditRequestsError(null);
    return { ok: true };
  };

  const fieldLabelForPath = (path: string): string => {
    const last = path.split('.').pop() ?? path;
    const map: Record<string, string> = {
      name: 'اسم الاتحاد', nameTr: 'الاسم الإنجليزي', logoIcon: 'الأيقونة',
      phone: 'الهاتف', email: 'البريد الإلكتروني', address: 'العنوان', copyright: 'حقوق النشر',
      facebook: 'فيسبوك', twitter: 'تويتر', instagram: 'إنستغرام', youtube: 'يوتيوب',
      badge: 'الشارة', title: 'العنوان', subtitle: 'العنوان الفرعي', description: 'الوصف',
      primaryBtn: 'زر أساسي', secondaryBtn: 'زر ثانوي', tertiaryBtn: 'زر ثالث', image: 'الصورة',
      value: 'القيمة', label: 'التسمية', badge1: 'شارة 1', badge2: 'شارة 2',
    };
    return map[last] ?? last;
  };

  const pageMetaForPath = (target: 'site' | 'about', path: string): { pageId: string; pageLabel: string } => {
    const section = path.split('.')[0];
    if (target === 'site') {
      if (section === 'brand' || section === 'footer') return { pageId: 'home', pageLabel: 'الشعار والتذييل' };
      if (section === 'hero') return { pageId: 'home', pageLabel: 'القسم الترحيبي' };
      if (section === 'stats') return { pageId: 'home', pageLabel: 'الإحصائيات' };
      if (section === 'about') return { pageId: 'home', pageLabel: 'الرؤية والرسالة' };
      if (section === 'boardPreview') return { pageId: 'home', pageLabel: 'الهيئة التنفيذية' };
      return { pageId: 'home', pageLabel: 'الصفحة الرئيسية' };
    }
    if (section === 'header') return { pageId: 'about', pageLabel: 'ترويسة صفحة من نحن' };
    if (section === 'story') return { pageId: 'about', pageLabel: 'قصتنا' };
    if (section === 'mission') return { pageId: 'about', pageLabel: 'الرسالة والرؤية' };
    if (section === 'goals') return { pageId: 'about', pageLabel: 'الأهداف' };
    if (section === 'cta') return { pageId: 'about', pageLabel: 'دعوة التسجيل' };
    return { pageId: 'about', pageLabel: 'صفحة من نحن' };
  };

  const updateSiteFields: AppContextValue['updateSiteFields'] = async (fields) => {
    const changes: Array<SiteFieldUpdate & { oldValue: string; newValue: string; labelText: string }> = [];
    for (const field of fields) {
      const oldValue = formatValue(getByPath(siteContent, field.path));
      const newValue = formatValue(field.value);
      if (oldValue !== newValue) {
        changes.push({ ...field, oldValue, newValue, labelText: field.label ?? fieldLabelForPath(field.path) });
      }
    }
    if (changes.length === 0) return true;
    if (currentUser?.role === 'MEDIA_HEAD') {
      const meta = pageMetaForPath('site', changes[0].path);
      const submitted = await submitSiteEdit({
        pageId: meta.pageId,
        pageLabel: meta.pageLabel,
        sectionLabel: changes.length === 1 ? changes[0].labelText : 'تعديل بطاقة محتوى',
        target: 'site',
        op: 'set',
        ...(changes.length === 1 ? { path: changes[0].path } : {}),
        diffs: changes.map((change) => ({
          label: change.labelText,
          path: change.path,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      });
      return submitted !== null;
    }
    if (currentUser?.role !== 'PRESIDENT') return false;
    const nextSiteContent = changes.reduce<Record<string, unknown> | unknown[]>(
      (next, change) => setByPath(next, change.path, change.value),
      siteContent as unknown as Record<string, unknown>,
    ) as unknown as SiteContent;
    return (await savePublishedSiteTarget('site', nextSiteContent)).ok;
  };

  const updateAboutFields: AppContextValue['updateAboutFields'] = async (fields) => {
    const changes: Array<AboutFieldUpdate & { oldValue: string; newValue: string; labelText: string }> = [];
    for (const field of fields) {
      const oldValue = formatValue(getByPath(aboutContent, field.path));
      const newValue = formatValue(field.value);
      if (oldValue !== newValue) {
        changes.push({ ...field, oldValue, newValue, labelText: field.label ?? fieldLabelForPath(field.path) });
      }
    }
    if (changes.length === 0) return true;
    if (currentUser?.role === 'MEDIA_HEAD') {
      const meta = pageMetaForPath('about', changes[0].path);
      const submitted = await submitSiteEdit({
        pageId: meta.pageId,
        pageLabel: meta.pageLabel,
        sectionLabel: changes.length === 1 ? changes[0].labelText : 'تعديل بطاقة محتوى',
        target: 'about',
        op: 'set',
        ...(changes.length === 1 ? { path: changes[0].path } : {}),
        diffs: changes.map((change) => ({
          label: change.labelText,
          path: change.path,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      });
      return submitted !== null;
    }
    if (currentUser?.role !== 'PRESIDENT') return false;
    const nextAboutContent = changes.reduce<Record<string, unknown> | unknown[]>(
      (next, change) => setByPath(next, change.path, change.value),
      aboutContent as unknown as Record<string, unknown>,
    ) as unknown as AboutContent;
    return (await savePublishedSiteTarget('about', nextAboutContent)).ok;
  };

  const updateSiteField: AppContextValue['updateSiteField'] = async (path, value, label) => (
    updateSiteFields([{ path, value, label }])
  );

  const updateAboutField: AppContextValue['updateAboutField'] = async (path, value, label) => (
    updateAboutFields([{ path, value, label }])
  );

  const canEditSection = (section: AdminSection): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'PRESIDENT') return true;
    const committee = currentUser.committee;
  if (committee === 'media') return ['gallery', 'homepage', 'about-page', 'plans', 'news'].includes(section);
    if (committee === 'academic') return ['guide', 'events', 'plans'].includes(section);
    if (committee === 'activities') return ['events', 'plans'].includes(section);
    if (committee === 'finance') return ['plans'].includes(section);
    if (committee === 'supervisory') return ['members', 'plans'].includes(section);
    if (committee === 'vice-presidency') return ['plans', 'members', 'profile'].includes(section);
    if (committee === 'presidency') return ['plans'].includes(section);
    return false;
  };

  const myApplication = currentUser?.role === 'STUDENT'
    ? applications.find((application) => application.studentId === currentUser.userId) ?? null
    : null;
  const studentAccess = resolveStudentAccess({
    profileStatus: currentStudent?.status,
    applicationStatus: myApplication?.status,
    applicationsLoading: currentUser?.role === 'STUDENT' && applicationsLoading,
  });

  const replaceSiteLogo: AppContextValue['replaceSiteLogo'] = async (file, onProgress) => {
    const expectedVersion = contentVersionRef.current;
    const result = await replaceSiteLogoAtomically({
      siteContent,
      expectedVersion,
      captureOwner: captureConfirmedAuthOwner,
      upload: (owner) => {
        if (expectedVersion < 1) {
          return Promise.resolve({
            ok: false,
            error: {
              code: 'SITE_CONTENT_NOT_SYNCHRONIZED',
              message: 'لم تكتمل مزامنة النسخة الرسمية بعد. حدّث الصفحة ثم أعد المحاولة.',
            },
          });
        }
        return uploadManagedAssetService({
          usage: 'site-logo',
          ownerId: owner.userId,
          file,
        }, onProgress);
      },
      register: registerManagedAsset,
      publishAtomically: replacePublishedSiteLogo,
      applyPublication: (publication) => {
        applyCmsPublication('site', publication.content, publication.version);
        setContentError(null);
      },
      removeObject: removeManagedAssetObject,
      markOrphaned: (assetId) => setManagedAssetStatus(assetId, 'orphaned'),
    });
    if (!result.ok) setContentError(result.error.message);
    return result;
  };

  const uploadManagedFile: AppContextValue['uploadManagedFile'] = async (usage, file, onProgress, targetOwnerId) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner) {
      return {
        ok: false,
        error: { code: 'UPLOAD_AUTH_REQUIRED', message: 'يجب تسجيل الدخول قبل رفع الملف.' },
      };
    }
    if (targetOwnerId && (usage !== 'avatar' || currentUser?.role !== 'PRESIDENT')) {
      return {
        ok: false,
        error: { code: 'MEMBER_AVATAR_FORBIDDEN', message: 'الرئيس فقط يمكنه رفع صورة لحساب عضو آخر.' },
      };
    }
    const uploaded = await uploadManagedAssetService({
      usage,
      ownerId: targetOwnerId ?? owner.userId,
      file,
    }, onProgress);
    if (!uploaded.ok) return uploaded;

    const ownerAfterUpload = captureConfirmedAuthOwner();
    if (!ownerAfterUpload
      || ownerAfterUpload.userId !== owner.userId
      || ownerAfterUpload.epoch !== owner.epoch) {
      await removeManagedAssetObject(uploaded.data);
      return {
        ok: false,
        error: { code: 'UPLOAD_OWNER_CHANGED', message: 'تغير الحساب أثناء الرفع؛ تم إلغاء الملف الجديد.' },
      };
    }

    const registered = await registerManagedAsset(uploaded.data);
    if (!registered.ok) {
      await removeManagedAssetObject(uploaded.data);
      return registered;
    }
    const ownerAfterRegister = captureConfirmedAuthOwner();
    if (!ownerAfterRegister
      || ownerAfterRegister.userId !== owner.userId
      || ownerAfterRegister.epoch !== owner.epoch) {
      await removeManagedAssetObject(uploaded.data);
      await setManagedAssetStatus(uploaded.data.id, 'orphaned');
      return {
        ok: false,
        error: { code: 'UPLOAD_OWNER_CHANGED', message: 'تغير الحساب قبل تأكيد الملف؛ لم يُربط بالمحتوى.' },
      };
    }
    return registered;
  };

  const replaceManagedMemberAvatar: AppContextValue['replaceManagedMemberAvatar'] = async (targetUserId, expectedOldPath, asset) => {
    const owner = captureConfirmedAuthOwner();
    if (!owner || currentUser?.role !== 'PRESIDENT') {
      return { ok: false, error: { code: 'MEMBER_AVATAR_FORBIDDEN', message: 'الرئيس فقط يمكنه تغيير صورة عضو آخر.' } };
    }
    const result = await bindPresidentManagedMemberAvatar({ targetUserId, expectedOldPath, asset });
    const ownerAfter = captureConfirmedAuthOwner();
    if (!ownerAfter || ownerAfter.userId !== owner.userId || ownerAfter.epoch !== owner.epoch) {
      return { ok: false, error: { code: 'MEMBER_AVATAR_OWNER_CHANGED', message: 'تغير الحساب أثناء تحديث الصورة؛ أعد تحميل الصفحة.' } };
    }
    if (result.ok) {
      await refreshAccountDirectory(() => {
        const active = captureConfirmedAuthOwner();
        return !!active && active.userId === owner.userId && active.epoch === owner.epoch;
      });
    }
    return result;
  };

  const value: AppContextValue = {
      view,
      setView,
      navigate,
      events: effectiveEvents,
      setEvents,
      news: effectiveNews,
      setNews,
      students,
      suggestions,
      setSuggestions,
      plans: effectivePlans,
      setPlans,
      reports: effectiveReports,
      setReports,
      currentStudent,
      currentUser,
      authInitializing,
      identityRefreshing,
      authError,
      passwordRecoveryReady: passwordRecoveryGate === 'READY',
      realtimeWarning,
      contentLoading,
      contentError,
      contentVersion,
      clearAuthError,
      login,
      logout,
      requestPasswordReset,
      updateRecoveredPassword,
      finishPasswordRecovery,
      registerForEvent,
      unregisterFromEvent,
      contactMessages,
      contactMessagesLoading,
      contactMessagesError,
      addContactMessage,
      markContactMessageRead,
      replyToContactMessage,
      retryContactReplyEmail,
      canAccessCommittee,
      canAccessAdmin,
      canEditSection,
      refreshPublishedLocalizations,
      generalInfo: effectiveGeneralInfo,
      setGeneralInfo,
      siteContent: effectiveSiteContent,
      setSiteContent,
      updateSiteField,
      updateSiteFields,
      aboutContent: effectiveAboutContent,
      setAboutContent,
      updateAboutField,
      updateAboutFields,
      guideSections: effectiveGuideSections,
      setGuideSections,
      galleryAlbums: effectiveGalleryAlbums,
      setGalleryAlbums,
      galleryCategories: effectiveGalleryCategories,
      setGalleryCategories,
      faqCategories: effectiveFaqCategories,
      setFaqCategories,
      contactCards: effectiveContactCards,
      setContactCards,
      contactMap: effectiveContactMap,
      setContactMap,
      committees: effectiveCommittees,
      canonicalSiteContent: siteContent,
      canonicalAboutContent: aboutContent,
      canonicalNews: news,
      canonicalEvents: events,
      canonicalFaqCategories: faqCategories,
      canonicalGuideSections: guideSections,
      canonicalGuideQuickInfo: guideQuickInfo,
      canonicalGalleryAlbums: galleryAlbums,
      canonicalGalleryCategories: galleryCategories,
      canonicalCommittees: committees,
      canonicalPlans: plans,
      canonicalReports: reports,
      canonicalProgramsContent: programsContent,
      canonicalContactCards: contactCards,
      canonicalContactMap: contactMap,
      canonicalGeneralInfo: generalInfo,
      members,
      setMembers,
      updateMemberProfile,
      setCommittees,
      setStudents,
      applications,
      applicationsLoading,
      applicationEmailNotifications,
      refreshApplicationEmailNotifications,
      retryApplicationEmailNotification,
      myApplication,
      studentAccess,
      registerWithApplication,
      scheduleInterview,
      decideApplication,
      respondToSuggestion,
      getVisibleSuggestions,
      canRespondToSuggestion,
      pendingProfileEdits,
      submitProfileEdit,
      approveProfileEdit,
      approveProfileEditWithChanges,
      rejectProfileEdit,
      pendingSiteEdits,
      editsHistory,
      editRequestsLoading,
      editRequestsError,
      clearEditRequestsError,
      programsContent: effectiveProgramsContent,
      setProgramsContent,
      guideQuickInfo: effectiveGuideQuickInfo,
      setGuideQuickInfo,
      submitSiteEdit,
      approveSiteEdit,
      rejectSiteEdit,
      approveSiteEditWithChanges,
      updatePresidentProfile,
      transferMemberRole,
      revokeExecutiveAssignment,
      getRoleHolder,
      updateBoardHead,
      removeMember,
      updateCommitteeVision,
      updateOwnProfile,
      uploadOwnAvatar,
      deleteOwnAvatar,
      changeOwnPassword,
      ownProfileOperationResults,
      clearOwnProfileOperationResult,
      uploadManagedFile,
      replaceSiteLogo,
      replaceManagedMemberAvatar,
      savePublishedSiteTarget,
      saveOwnCommitteeContent,
      saveOwnCommitteeVision,
      createPublishedEvent,
      updateOwnedEvent,
      deleteOwnedEvent,
      createGalleryAlbum,
      updateOwnedGalleryAlbum,
      deleteOwnedGalleryAlbum,
      appendOwnedGalleryMedia,
      deleteOwnedGalleryMedia,
      listOwnEventIds,
      listOwnAlbumIds,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalApp() {
  return useContext(AppContext);
}
