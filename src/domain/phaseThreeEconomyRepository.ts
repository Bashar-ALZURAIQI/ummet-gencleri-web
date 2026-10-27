import {
  ATTENDANCE_STATUSES,
  EXCUSE_REVIEW_STATUSES,
  TASK_COMPLETION_STATUSES,
  type ActivityEvaluationRow,
  type AttendanceStatus,
  type EconomySeason,
  type ExcuseReviewStatus,
  type FinalizationResult,
  type MemberPointsRow,
  type ManagedTaskSummary,
  type MonthlyStar,
  type OwnGamificationSummary,
  type PendingMandatoryExcuse,
  type PointsLedgerEntry,
  type PublicLeaderboardRow,
  type RecentPointsLedgerEntry,
  type TaskCompletionStatus,
  type TaskEvaluationRow,
} from './internalEconomyTypes.ts';
import type { InternalEconomyClient, InternalEconomyResult } from './internalEconomyRepository.ts';

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const integer = (value: unknown): value is number => Number.isSafeInteger(value);
const nullableText = (value: unknown): value is string | null => value === null || typeof value === 'string';
const nullableNonEmptyText = (value: unknown): value is string | null => value === null || text(value);
const one = (value: unknown): Row | null => record(value) ? value : Array.isArray(value) && value.length === 1 && record(value[0]) ? value[0] : null;
const ok = <T>(data: T): InternalEconomyResult<T> => ({ ok: true, data });
const fail = <T>(code: string, message: string): InternalEconomyResult<T> => ({ ok: false, error: { code, message } });

function serverError<T>(error: { code?: unknown; message?: unknown }): InternalEconomyResult<T> {
  const code = typeof error.code === 'string' ? error.code : 'PHASE_THREE_REQUEST_FAILED';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (code === '42501') return fail(code, 'ليست لديك صلاحية إدارة هذا القسم.');
  if (message.includes('every joining student')) return fail(code, 'يجب تقييم جميع الطلاب قبل إغلاق النشاط.');
  if (message.includes('every enrolled student')) return fail(code, 'يجب تقييم جميع الطلاب قبل إغلاق المهمة.');
  if (message.includes('closed')) return fail(code, 'أُغلق هذا التقييم بالفعل. حدّث الصفحة.');
  return fail(code, 'تعذر تنفيذ العملية في الخادم. تحقق من الاتصال ثم أعد المحاولة.');
}

async function rpc(client: InternalEconomyClient, name: string, args: Row = {}) {
  try { return await client.rpc(name, args); }
  catch { return { data: null, error: { code: 'PHASE_THREE_TRANSPORT_FAILED', message: 'Transport failed' } }; }
}

function mapExcuse(row: unknown): PendingMandatoryExcuse | null {
  if (!record(row) || !text(row.enrollment_id) || !text(row.activity_id) || !text(row.activity_title)
    || !text(row.student_id) || !text(row.student_name) || !nullableText(row.avatar_path)
    || !text(row.excuse_text) || !text(row.submitted_at)) return null;
  return { enrollmentId: row.enrollment_id, activityId: row.activity_id, activityTitle: row.activity_title,
    studentId: row.student_id, studentName: row.student_name, avatarPath: row.avatar_path,
    excuseText: row.excuse_text, submittedAt: row.submitted_at };
}

function mapActivity(row: unknown): ActivityEvaluationRow | null {
  if (
    !record(row) ||
    !text(row.activity_id) ||
    !text(row.activity_title) ||
    !['MANDATORY', 'OPTIONAL', 'PAID'].includes(String(row.activity_type)) ||
    !integer(row.points_value) ||
    !text(row.deadline) ||
    !nullableText(row.student_id) ||
    !nullableText(row.student_name) ||
    !nullableText(row.avatar_path) ||
    !(
      row.attendance_status === null ||
      row.attendance_status === undefined ||
      ATTENDANCE_STATUSES.includes(row.attendance_status as AttendanceStatus)
    )
  ) {
    return null;
  }

  const decision =
    row.decision === 'IGNORED' || row.decision === 'JOINING' || row.decision === 'DECLINING'
      ? row.decision
      : (row.student_id ? 'JOINING' : null);

  return {
    activityId: row.activity_id,
    activityTitle: row.activity_title,
    activityType: row.activity_type as ActivityEvaluationRow['activityType'],
    pointsValue: row.points_value,
    deadline: row.deadline,
    studentId: row.student_id ? String(row.student_id) : null,
    studentName: row.student_name ? String(row.student_name) : null,
    avatarPath: row.avatar_path ? String(row.avatar_path) : null,
    attendanceStatus: (row.attendance_status as AttendanceStatus) ?? null,
    decision,
  };
}

function mapTask(row: unknown): TaskEvaluationRow | null {
  if (!record(row) || !text(row.task_id) || !text(row.task_title) || !integer(row.points_reward)
    || !text(row.deadline) || !text(row.student_id) || !text(row.student_name) || !nullableText(row.avatar_path)
    || !TASK_COMPLETION_STATUSES.includes(row.completion_status as TaskCompletionStatus)) return null;
  return { taskId: row.task_id, taskTitle: row.task_title, pointsReward: row.points_reward,
    deadline: row.deadline, studentId: row.student_id, studentName: row.student_name,
    avatarPath: row.avatar_path, completionStatus: row.completion_status as TaskCompletionStatus };
}

function mapManagedTask(row: unknown): ManagedTaskSummary | null {
  if (!record(row) || !text(row.task_id) || !text(row.task_title) || !text(row.task_description)
    || !integer(row.points_reward) || !integer(row.required_students) || !text(row.deadline)
    || !(row.task_status === 'OPEN' || row.task_status === 'FULL') || !integer(row.enrollment_count)
    || !text(row.created_by) || !text(row.created_by_name)) return null;
  return {
    taskId: row.task_id,
    title: row.task_title,
    description: row.task_description,
    pointsReward: row.points_reward,
    requiredStudents: row.required_students,
    deadline: row.deadline,
    status: row.task_status,
    enrollmentCount: row.enrollment_count,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
  };
}

function mapMember(row: unknown): MemberPointsRow | null {
  if (!record(row) || !text(row.student_id) || !text(row.student_name) || !nullableText(row.avatar_path)
    || !integer(row.total_points) || !text(row.current_tier) || typeof row.needs_warning !== 'boolean') return null;
  return { studentId: row.student_id, studentName: row.student_name, avatarPath: row.avatar_path,
    totalPoints: row.total_points, currentTier: row.current_tier, needsWarning: row.needs_warning };
}

function mapLeaderboard(row: unknown): PublicLeaderboardRow | null {
  if (!record(row) || !integer(row.rank) || Number(row.rank) < 1 || !text(row.student_id) || !text(row.student_name)
    || !nullableText(row.avatar_path) || !integer(row.total_points) || !text(row.current_tier)) return null;
  return { rank: row.rank, studentId: row.student_id, studentName: row.student_name,
    avatarPath: row.avatar_path, totalPoints: row.total_points, currentTier: row.current_tier };
}

const EXECUTIVE_POSITION_KEYS = [
  'PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD',
  'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD',
] as const;

function mapRecentLedgerEntry(row: unknown): RecentPointsLedgerEntry | null {
  if (!record(row) || !text(row.id) || !integer(row.amount) || !text(row.reason) || !text(row.createdAt)
    || !nullableNonEmptyText(row.createdByName)
    || !(row.createdByRole === null || EXECUTIVE_POSITION_KEYS.includes(row.createdByRole as typeof EXECUTIVE_POSITION_KEYS[number]))
    || typeof row.createdByIsSelf !== 'boolean') return null;
  return {
    id: row.id,
    amount: row.amount,
    reason: row.reason,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
    createdByRole: row.createdByRole as string | null,
    createdByIsSelf: row.createdByIsSelf,
  };
}

function mapList<T>(value: unknown, mapper: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.map(mapper);
  return rows.some((row) => row === null) ? null : rows as T[];
}

function mapFinalization(value: unknown, key: 'activityId' | 'taskId'): FinalizationResult | null {
  const row = one(value);
  if (!row || !text(row[key]) || typeof row.alreadyFinalized !== 'boolean' || !integer(row.ledgerEntries)) return null;
  return { entityId: row[key], alreadyFinalized: row.alreadyFinalized, ledgerEntries: row.ledgerEntries };
}

export function createPhaseThreeEconomyRepository(client: InternalEconomyClient) {
  const list = async <T>(name: string, mapper: (row: unknown) => T | null, code: string, message: string, args: Row = {}): Promise<InternalEconomyResult<T[]>> => {
    const response = await rpc(client, name, args);
    if (response.error) return serverError(response.error);
    const rows = mapList(response.data, mapper);
    return rows ? ok(rows) : fail(code, message);
  };
  return {
    loadPendingExcuses: () => list('list_pending_mandatory_excuses', mapExcuse, 'EXCUSES_RESPONSE_INVALID', 'تعذر التحقق من بيانات الأعذار.'),
    async reviewExcuse(enrollmentId: string, status: Exclude<ExcuseReviewStatus, 'PENDING'>): Promise<InternalEconomyResult<void>> {
      const response = await rpc(client, 'review_activity_excuse', { p_enrollment_id: enrollmentId, p_status: status });
      return response.error ? serverError(response.error) : record(one(response.data)) ? ok(undefined) : fail('EXCUSE_REVIEW_RESPONSE_INVALID', 'لم يؤكد الخادم تقييم العذر.');
    },
    loadActivityEvaluations: () => list('list_activity_evaluations', mapActivity, 'ACTIVITY_EVALUATIONS_INVALID', 'تعذر التحقق من بيانات التحضير.'),
    async saveAttendance(activityId: string, studentId: string, status: AttendanceStatus): Promise<InternalEconomyResult<void>> {
      const response = await rpc(client, 'save_activity_attendance', { p_activity_id: activityId, p_student_id: studentId, p_status: status });
      return response.error ? serverError(response.error) : one(response.data) ? ok(undefined) : fail('ATTENDANCE_RESPONSE_INVALID', 'لم يؤكد الخادم التقييم.');
    },
    async cancelActivity(activityId: string): Promise<InternalEconomyResult<void>> {
      const response = await rpc(client, 'cancel_activity_evaluation', { p_activity_id: activityId });
      if (response.error) return serverError(response.error);
      const row = one(response.data);
      return row && row.activityId === activityId && row.attendanceDeleted === true
        ? ok(undefined) : fail('ACTIVITY_CANCEL_INVALID', 'لم يؤكد الخادم حذف التحضير.');
    },
    async finalizeActivity(activityId: string): Promise<InternalEconomyResult<FinalizationResult>> {
      const response = await rpc(client, 'finalize_activity_evaluation', { p_activity_id: activityId });
      if (response.error) return serverError(response.error);
      const result = mapFinalization(response.data, 'activityId');
      return result ? ok(result) : fail('ACTIVITY_FINALIZATION_INVALID', 'لم يؤكد الخادم إغلاق النشاط.');
    },
    loadManagedTasks: () => list('list_managed_tasks', mapManagedTask, 'MANAGED_TASKS_INVALID', 'تعذر التحقق من قائمة المهام.'),
    loadManagedTaskEnrollments: (taskId: string) => list(
      'list_managed_task_enrollments',
      mapTask,
      'MANAGED_TASK_ENROLLMENTS_INVALID',
      'تعذر التحقق من المسجلين في المهمة.',
      { p_task_id: taskId },
    ),
    async saveTaskCompletion(taskId: string, studentId: string, status: Exclude<TaskCompletionStatus, 'PENDING'>): Promise<InternalEconomyResult<void>> {
      const response = await rpc(client, 'save_task_completion', { p_task_id: taskId, p_student_id: studentId, p_status: status });
      return response.error ? serverError(response.error) : one(response.data) ? ok(undefined) : fail('TASK_COMPLETION_RESPONSE_INVALID', 'لم يؤكد الخادم التقييم.');
    },
    async finalizeTask(taskId: string): Promise<InternalEconomyResult<FinalizationResult>> {
      const response = await rpc(client, 'finalize_task_evaluation', { p_task_id: taskId });
      if (response.error) return serverError(response.error);
      const result = mapFinalization(response.data, 'taskId');
      return result ? ok(result) : fail('TASK_FINALIZATION_INVALID', 'لم يؤكد الخادم إغلاق المهمة.');
    },
    loadMemberPoints: () => list('list_member_points', mapMember, 'MEMBER_POINTS_INVALID', 'تعذر التحقق من أرصدة الأعضاء.'),
    async adjustMemberPoints(input: { studentId: string; amount: number; reason: string; requestId: string }): Promise<InternalEconomyResult<PointsLedgerEntry>> {
      const response = await rpc(client, 'adjust_member_points', { p_student_id: input.studentId, p_amount: input.amount, p_reason: input.reason, p_request_id: input.requestId });
      if (response.error) return serverError(response.error);
      const row = one(response.data);
      return row && text(row.id) && text(row.student_id) && integer(row.amount) && text(row.reason) && text(row.created_by) && text(row.source_key) && text(row.created_at)
        ? ok(row as unknown as PointsLedgerEntry) : fail('POINT_ADJUSTMENT_INVALID', 'لم يؤكد الخادم حركة النقاط.');
    },
    async loadActiveSeason(): Promise<InternalEconomyResult<EconomySeason>> {
      const response = await rpc(client, 'get_active_economy_season'); const row = one(response.data);
      if (response.error) return serverError(response.error);
      return row && text(row.id) && text(row.label) && text(row.started_at) && nullableText(row.ended_at)
        ? ok({ id: row.id, label: row.label, startedAt: row.started_at, endedAt: row.ended_at })
        : fail('SEASON_RESPONSE_INVALID', 'تعذر التحقق من الموسم الحالي.');
    },
    async endSeason(seasonId: string, nextLabel: string): Promise<InternalEconomyResult<EconomySeason>> {
      const response = await rpc(client, 'end_economy_season', { p_season_id: seasonId, p_next_label: nextLabel }); const row = one(response.data);
      if (response.error) return serverError(response.error);
      return row && text(row.id) && text(row.label) && text(row.started_at) && nullableText(row.ended_at)
        ? ok({ id: row.id, label: row.label, startedAt: row.started_at, endedAt: row.ended_at })
        : fail('SEASON_RESPONSE_INVALID', 'لم يؤكد الخادم بدء الموسم الجديد.');
    },
    loadPublicLeaderboard: () => list('list_public_top_ten', mapLeaderboard, 'LEADERBOARD_RESPONSE_INVALID', 'تعذر التحقق من بيانات لوحة الشرف.'),
    async loadMonthlyStar(): Promise<InternalEconomyResult<MonthlyStar | null>> {
      const response = await rpc(client, 'get_public_monthly_star'); if (response.error) return serverError(response.error);
      if (Array.isArray(response.data) && response.data.length === 0) return ok(null);
      const row = one(response.data);
      return row && text(row.student_id) && text(row.student_name) && nullableText(row.avatar_path) && integer(Number(row.points_last_30_days))
        ? ok({ studentId: row.student_id, studentName: row.student_name, avatarPath: row.avatar_path, pointsLast30Days: Number(row.points_last_30_days) })
        : fail('MONTHLY_STAR_RESPONSE_INVALID', 'تعذر التحقق من بيانات نجم الشهر.');
    },
    async loadOwnGamificationSummary(): Promise<InternalEconomyResult<OwnGamificationSummary>> {
      const response = await rpc(client, 'get_own_gamification_summary'); if (response.error) return serverError(response.error);
      const row = one(response.data);
      const recentLedger = row ? mapList(row.recentLedger, mapRecentLedgerEntry) : null;
      if (!row || !text(row.studentId) || !integer(row.totalPoints) || !text(row.currentTier)
        || !integer(row.rank) || typeof row.isTopTen !== 'boolean' || !recentLedger)
        return fail('GAMIFICATION_RESPONSE_INVALID', 'تعذر التحقق من بيانات نقاطك.');
      return ok({
        studentId: row.studentId,
        totalPoints: row.totalPoints,
        currentTier: row.currentTier,
        rank: row.rank,
        isTopTen: row.isTopTen,
        recentLedger,
      });
    },
  };
}

export { EXCUSE_REVIEW_STATUSES };
