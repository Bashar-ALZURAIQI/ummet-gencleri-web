import {
  ACTIVITY_DECISIONS,
  ACTIVITY_TYPES,
  TASK_COMPLETION_STATUSES,
  TASK_STATUSES,
  type ActivityEnrollment,
  type CreateInternalTaskInput,
  type SetOwnActivityEnrollmentRpcArgs,
  type StudentActivityBoardItem,
  type StudentTaskBoardItem,
  type TaskEnrollment,
  type UpsertEventActivityInput,
} from './internalEconomyTypes.ts';

export interface InternalEconomyError {
  code: string;
  message: string;
}

export type InternalEconomyResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: InternalEconomyError };

interface RpcErrorLike {
  code?: unknown;
  message?: unknown;
}

interface RpcResponse {
  data: unknown;
  error: RpcErrorLike | null;
}

export interface InternalEconomyClient {
  rpc(name: string, args?: Record<string, unknown>): Promise<RpcResponse>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isNonemptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isNonnegativeInteger = (value: unknown): value is number => (
  Number.isSafeInteger(value) && Number(value) >= 0
);

const isPositiveInteger = (value: unknown): value is number => (
  Number.isSafeInteger(value) && Number(value) > 0
);

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

const firstRecord = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isRecord(value[0])) return value[0];
  return null;
};

const fail = <T>(code: string, message: string): InternalEconomyResult<T> => ({
  ok: false,
  error: { code, message },
});

function serverFailure<T>(error: RpcErrorLike): InternalEconomyResult<T> {
  const code = typeof error.code === 'string' ? error.code : 'INTERNAL_ECONOMY_REQUEST_FAILED';
  const rawMessage = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (code === '42501') return fail(code, 'ليست لديك صلاحية استخدام هذه الميزة.');
  if (rawMessage.includes('points')) return fail(code, 'نقاطك غير كافية للانضمام إلى هذا النشاط.');
  if (rawMessage.includes('final excuse review')) {
    return fail(code, 'تم اعتماد نتيجة العذر، لذلك لم يعد من الممكن تغيير قرار المشاركة.');
  }
  if (rawMessage.includes('excuse') || rawMessage.includes('mandatory')) {
    return fail(code, 'يجب كتابة عذر الغياب للنشاط الإلزامي.');
  }
  if (rawMessage.includes('deadline') || rawMessage.includes('closed')) {
    return fail(code, 'انتهى وقت التسجيل ولم يعد تغيير القرار متاحاً.');
  }
  if (code === '23514' || rawMessage.includes('capacity') || rawMessage.includes('full')) {
    return fail(code, 'اكتمل العدد المتاح، حدّث الصفحة للاطلاع على الحالة الحالية.');
  }
  return fail(code, 'تعذر حفظ العملية في الخادم. تحقق من الاتصال ثم أعد المحاولة.');
}

async function safeRpc(
  client: InternalEconomyClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResponse> {
  try {
    return await client.rpc(name, args);
  } catch {
    return {
      data: null,
      error: {
        code: 'INTERNAL_ECONOMY_TRANSPORT_FAILED',
        message: 'Transport request failed',
      },
    };
  }
}

function mapActivityBoardRow(value: unknown): StudentActivityBoardItem | null {
  if (!isRecord(value)
    || !isNonemptyString(value.activity_id)
    || !isNonemptyString(value.public_event_id)
    || !isNonemptyString(value.title)
    || !isNonemptyString(value.description)
    || !ACTIVITY_TYPES.includes(value.type as (typeof ACTIVITY_TYPES)[number])
    || !isNonnegativeInteger(value.points_value)
    || !(value.max_capacity === null || isPositiveInteger(value.max_capacity))
    || !isNonemptyString(value.deadline)
    || !isNonnegativeInteger(value.joining_count)
    || !(value.remaining_capacity === null || isNonnegativeInteger(value.remaining_capacity))
    || !(value.decision === null || ACTIVITY_DECISIONS.includes(value.decision as (typeof ACTIVITY_DECISIONS)[number]))
    || !(value.excuse_text === null || typeof value.excuse_text === 'string')
    || !isInteger(value.total_points)
    || typeof value.can_participate !== 'boolean'
    || typeof value.economy_exempt !== 'boolean') {
    return null;
  }
  return {
    activityId: value.activity_id,
    publicEventId: value.public_event_id,
    title: value.title,
    description: value.description,
    type: value.type as StudentActivityBoardItem['type'],
    pointsValue: value.points_value,
    maxCapacity: value.max_capacity,
    deadline: value.deadline,
    joiningCount: value.joining_count,
    remainingCapacity: value.remaining_capacity,
    decision: value.decision as StudentActivityBoardItem['decision'],
    excuseText: value.excuse_text,
    totalPoints: value.total_points,
    canParticipate: value.can_participate,
    economyExempt: value.economy_exempt,
  };
}

function mapTaskBoardRow(value: unknown): StudentTaskBoardItem | null {
  if (!isRecord(value)
    || !isNonemptyString(value.task_id)
    || !isNonemptyString(value.title)
    || !isNonemptyString(value.description)
    || !isPositiveInteger(value.points_reward)
    || !isPositiveInteger(value.required_students)
    || !isNonemptyString(value.deadline)
    || !TASK_STATUSES.includes(value.status as (typeof TASK_STATUSES)[number])
    || !isNonnegativeInteger(value.enrollment_count)
    || typeof value.is_enrolled !== 'boolean'
    || !(value.completion_status === null
      || TASK_COMPLETION_STATUSES.includes(value.completion_status as (typeof TASK_COMPLETION_STATUSES)[number]))) {
    return null;
  }
  return {
    taskId: value.task_id,
    title: value.title,
    description: value.description,
    pointsReward: value.points_reward,
    requiredStudents: value.required_students,
    deadline: value.deadline,
    status: value.status as StudentTaskBoardItem['status'],
    enrollmentCount: value.enrollment_count,
    isEnrolled: value.is_enrolled,
    completionStatus: value.completion_status as StudentTaskBoardItem['completionStatus'],
  };
}

function mapActivityEnrollment(value: unknown): ActivityEnrollment | null {
  const row = firstRecord(value);
  if (!row
    || !isNonemptyString(row.activity_id)
    || !isNonemptyString(row.student_id)
    || !ACTIVITY_DECISIONS.includes(row.decision as (typeof ACTIVITY_DECISIONS)[number])
    || !(row.excuse_text === null || typeof row.excuse_text === 'string')
    || !isNonemptyString(row.created_at)
    || !isNonemptyString(row.updated_at)) return null;
  return row as unknown as ActivityEnrollment;
}

function mapTaskEnrollment(value: unknown): TaskEnrollment | null {
  const row = firstRecord(value);
  if (!row
    || !isNonemptyString(row.task_id)
    || !isNonemptyString(row.student_id)
    || !TASK_COMPLETION_STATUSES.includes(row.completion_status as (typeof TASK_COMPLETION_STATUSES)[number])
    || !isNonemptyString(row.created_at)
    || !isNonemptyString(row.updated_at)) return null;
  return row as unknown as TaskEnrollment;
}

export function createInternalEconomyRepository(client: InternalEconomyClient) {
  return {
    async loadStudentActivities(): Promise<InternalEconomyResult<StudentActivityBoardItem[]>> {
      const response = await safeRpc(client, 'list_activity_program_board', {});
      if (response.error) return serverFailure(response.error);
      if (!Array.isArray(response.data)) return fail('ACTIVITY_BOARD_RESPONSE_INVALID', 'أعاد الخادم بيانات أنشطة غير صالحة.');
      const rows = response.data.map(mapActivityBoardRow);
      if (rows.some((row) => row === null)) return fail('ACTIVITY_BOARD_RESPONSE_INVALID', 'أعاد الخادم بيانات أنشطة غير صالحة.');
      return { ok: true, data: rows as StudentActivityBoardItem[] };
    },

    async loadStudentTasks(): Promise<InternalEconomyResult<StudentTaskBoardItem[]>> {
      const response = await safeRpc(client, 'list_student_task_board', {});
      if (response.error) return serverFailure(response.error);
      if (!Array.isArray(response.data)) return fail('TASK_BOARD_RESPONSE_INVALID', 'أعاد الخادم بيانات مهام غير صالحة.');
      const rows = response.data.map(mapTaskBoardRow);
      if (rows.some((row) => row === null)) return fail('TASK_BOARD_RESPONSE_INVALID', 'أعاد الخادم بيانات مهام غير صالحة.');
      return { ok: true, data: rows as StudentTaskBoardItem[] };
    },

    async setOwnActivityDecision(args: SetOwnActivityEnrollmentRpcArgs): Promise<InternalEconomyResult<ActivityEnrollment>> {
      const response = await safeRpc(client, 'set_own_activity_enrollment', args as unknown as Record<string, unknown>);
      if (response.error) return serverFailure(response.error);
      const row = mapActivityEnrollment(response.data);
      return row ? { ok: true, data: row } : fail('ACTIVITY_ENROLLMENT_RESPONSE_INVALID', 'لم يؤكد الخادم قرار النشاط.');
    },

    async registerForTask(taskId: string): Promise<InternalEconomyResult<TaskEnrollment>> {
      const response = await safeRpc(client, 'register_for_task', { p_task_id: taskId });
      if (response.error) return serverFailure(response.error);
      const row = mapTaskEnrollment(response.data);
      return row ? { ok: true, data: row } : fail('TASK_ENROLLMENT_RESPONSE_INVALID', 'لم يؤكد الخادم حجز المهمة.');
    },

    async upsertEventActivity(input: UpsertEventActivityInput): Promise<InternalEconomyResult<{ id: string; publicEventId: string }>> {
      const response = await safeRpc(client, 'upsert_event_activity', {
        p_public_event_id: input.publicEventId,
        p_title: input.title,
        p_description: input.description,
        p_type: input.type,
        p_points_value: input.pointsValue,
        p_max_capacity: input.maxCapacity,
        p_deadline: input.deadline,
      });
      if (response.error) return serverFailure(response.error);
      const row = firstRecord(response.data);
      if (!row || !isNonemptyString(row.id) || !isNonemptyString(row.public_event_id)) {
        return fail('ACTIVITY_UPSERT_RESPONSE_INVALID', 'لم يؤكد الخادم حفظ إعدادات النشاط.');
      }
      return { ok: true, data: { id: row.id, publicEventId: row.public_event_id } };
    },

    async createTask(input: CreateInternalTaskInput): Promise<InternalEconomyResult<{ id: string; title: string }>> {
      const response = await safeRpc(client, 'create_internal_task', {
        p_title: input.title,
        p_description: input.description,
        p_points_reward: input.pointsReward,
        p_required_students: input.requiredStudents,
        p_deadline: input.deadline,
      });
      if (response.error) return serverFailure(response.error);
      const row = firstRecord(response.data);
      if (!row || !isNonemptyString(row.id) || !isNonemptyString(row.title)) {
        return fail('TASK_CREATE_RESPONSE_INVALID', 'لم يؤكد الخادم إنشاء المهمة.');
      }
      return { ok: true, data: { id: row.id, title: row.title } };
    },
  };
}
