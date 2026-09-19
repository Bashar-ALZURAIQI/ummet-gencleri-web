import type { ApplicationStatus } from '../data/mockData.ts';
import type {
  ApplicationEmailEventType,
  ApplicationEmailSendResult,
} from './applicationEmailNotification.ts';

export const APPLICATION_EMAIL_DELAY_WARNING =
  'تم حفظ العملية بنجاح، لكن تعذر إرسال إشعار البريد حالياً. يمكنك إعادة المحاولة من لوحة الطلبات.';

export const getPendingApplicationBadge = (
  role: string | null | undefined,
  applications: readonly { status: string }[],
): number | undefined => {
  if (role !== 'PRESIDENT') return undefined;
  const pendingCount = applications.filter((application) => application.status === 'pending').length;
  return pendingCount > 0 ? pendingCount : undefined;
};

interface PresidentApplicationRefreshOptions {
  role: string | null | undefined;
  refresh: () => void | Promise<void>;
  eventTarget: {
    addEventListener: (event: 'focus', listener: () => void) => void;
    removeEventListener: (event: 'focus', listener: () => void) => void;
  };
}

export function startPresidentApplicationRefresh({
  role,
  refresh,
  eventTarget,
}: PresidentApplicationRefreshOptions): () => void {
  if (role !== 'PRESIDENT') return () => {};

  const refreshApplications = () => { void refresh(); };
  eventTarget.addEventListener('focus', refreshApplications);

  return () => {
    eventTarget.removeEventListener('focus', refreshApplications);
  };
}

export const eventTypeForApplicationStatus = (
  status: ApplicationStatus,
): ApplicationEmailEventType => {
  if (status === 'pending') return 'NEW_APPLICATION';
  if (status === 'interview') return 'INTERVIEW_SCHEDULED';
  if (status === 'accepted') return 'ACCEPTED';
  return 'REJECTED';
};

export async function deliverApplicationEmailAfterCommit(
  send: (
    applicationId: string,
    eventType: ApplicationEmailEventType,
  ) => Promise<ApplicationEmailSendResult>,
  applicationId: string,
  eventType: ApplicationEmailEventType,
): Promise<{ emailWarning?: string }> {
  try {
    const result = await send(applicationId, eventType);
    return result.ok ? {} : { emailWarning: APPLICATION_EMAIL_DELAY_WARNING };
  } catch {
    return { emailWarning: APPLICATION_EMAIL_DELAY_WARNING };
  }
}
