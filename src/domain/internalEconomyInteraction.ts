import type {
  ActivityDecision,
  ActivityType,
  SetOwnActivityEnrollmentRpcArgs,
  TaskStatus,
} from './internalEconomyTypes.ts';

export type InternalEconomyAccess =
  | 'loading'
  | 'pending'
  | 'interview'
  | 'accepted'
  | 'rejected'
  | 'removed';

type ActivityCloseReason = 'DEADLINE' | 'FULL';

export interface ActivityInteractionInput {
  hasStudent: boolean;
  access: InternalEconomyAccess;
  canParticipate?: boolean;
  economyExempt?: boolean;
  type: ActivityType;
  pointsValue: number;
  totalPoints: number;
  maxCapacity: number | null;
  joiningCount: number;
  deadline: string;
  currentDecision: ActivityDecision | null;
  now?: Date;
}

export interface ActivityInteractionState {
  mode: 'LOGIN' | 'LOCKED' | 'CLOSED' | 'INSUFFICIENT_POINTS' | 'READY';
  canJoin: boolean;
  canDecline: boolean;
  reason: ActivityCloseReason | 'POINTS' | null;
}

const deadlineHasPassed = (deadline: string, now = new Date()): boolean => {
  const milliseconds = Date.parse(deadline);
  return !Number.isFinite(milliseconds) || milliseconds <= now.getTime();
};

export function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function remainingCapacity(maxCapacity: number | null, joiningCount: number): number | null {
  if (maxCapacity === null) return null;
  return Math.max(0, maxCapacity - Math.max(0, joiningCount));
}

export function formatEnrollmentCount(
  currentEnrollments: number,
  maxCapacity: number | null,
  t?: (key: string, options?: Record<string, unknown>) => string,
): string {
  const current = Math.max(0, Math.trunc(currentEnrollments));
  if (t) {
    if (maxCapacity === null) {
      return t('events.enrolledCount', { count: current, current, defaultValue: `${current} مسجل` });
    }
    const max = Math.max(0, Math.trunc(maxCapacity));
    return t('events.enrolledCapacity', {
      current,
      max,
      count: current,
      capacity: max,
      defaultValue: `${current} / ${max} مسجل`,
    });
  }
  return maxCapacity === null
    ? `${current} مسجل`
    : `${current} / ${Math.max(0, Math.trunc(maxCapacity))} مسجل`;
}

export function resolveActivityInteraction(input: ActivityInteractionInput): ActivityInteractionState {
  if (!input.hasStudent) {
    return { mode: 'LOGIN', canJoin: false, canDecline: false, reason: null };
  }
  const canParticipate = input.canParticipate ?? input.access === 'accepted';
  if (!canParticipate) {
    return { mode: 'LOCKED', canJoin: false, canDecline: false, reason: null };
  }
  if (deadlineHasPassed(input.deadline, input.now)) {
    return { mode: 'CLOSED', canJoin: false, canDecline: false, reason: 'DEADLINE' };
  }

  const remaining = remainingCapacity(input.maxCapacity, input.joiningCount);
  const alreadyJoining = input.currentDecision === 'JOINING';
  if (remaining === 0 && !alreadyJoining) {
    return { mode: 'CLOSED', canJoin: false, canDecline: true, reason: 'FULL' };
  }

  if (!input.economyExempt
    && input.type === 'PAID'
    && input.totalPoints < Math.max(0, input.pointsValue)
    && !alreadyJoining) {
    return { mode: 'INSUFFICIENT_POINTS', canJoin: false, canDecline: true, reason: 'POINTS' };
  }

  return { mode: 'READY', canJoin: true, canDecline: true, reason: null };
}

type ActivityDecisionBuildResult =
  | { ok: true; value: SetOwnActivityEnrollmentRpcArgs }
  | { ok: false; error: string };

export function buildActivityDecisionRequest(input: {
  activityId: string;
  activityType: ActivityType;
  decision: Extract<ActivityDecision, 'JOINING' | 'DECLINING' | 'IGNORED'>;
  excuseText?: string | null;
}): ActivityDecisionBuildResult {
  const activityId = input.activityId.trim();
  if (!activityId) return { ok: false, error: 'معرّف النشاط غير صالح.' };

  if (input.decision === 'JOINING') {
    return {
      ok: true,
      value: {
        p_activity_id: activityId,
        p_decision: 'JOINING',
        p_excuse_text: null,
      },
    };
  }

  if (input.decision === 'IGNORED') {
    return {
      ok: true,
      value: {
        p_activity_id: activityId,
        p_decision: 'IGNORED',
        p_excuse_text: null,
      },
    };
  }

  const excuse = input.excuseText?.trim() || '';
  if (input.activityType === 'MANDATORY' && !excuse) {
    return { ok: false, error: 'الرجاء إدخال العذر.' };
  }

  return {
    ok: true,
    value: {
      p_activity_id: activityId,
      p_decision: 'DECLINING',
      p_excuse_text: input.activityType === 'MANDATORY' ? excuse : null,
    },
  };
}

export interface TaskInteractionInput {
  hasStudent: boolean;
  access: InternalEconomyAccess;
  deadline: string;
  status: TaskStatus;
  requiredStudents: number;
  enrollmentCount: number;
  isEnrolled: boolean;
  now?: Date;
}

export interface TaskInteractionState {
  mode: 'LOGIN' | 'LOCKED' | 'CLOSED' | 'ENROLLED' | 'READY';
  canRegister: boolean;
  reason: 'DEADLINE' | 'FULL' | null;
}

export function resolveTaskInteraction(input: TaskInteractionInput): TaskInteractionState {
  if (!input.hasStudent) return { mode: 'LOGIN', canRegister: false, reason: null };
  if (input.access !== 'accepted') return { mode: 'LOCKED', canRegister: false, reason: null };
  if (input.isEnrolled) return { mode: 'ENROLLED', canRegister: false, reason: null };
  if (deadlineHasPassed(input.deadline, input.now)) {
    return { mode: 'CLOSED', canRegister: false, reason: 'DEADLINE' };
  }
  if (input.status !== 'OPEN' || input.enrollmentCount >= input.requiredStudents) {
    return { mode: 'CLOSED', canRegister: false, reason: 'FULL' };
  }
  return { mode: 'READY', canRegister: true, reason: null };
}
