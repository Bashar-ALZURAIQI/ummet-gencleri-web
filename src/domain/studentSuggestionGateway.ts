import type { SupabaseClient } from '@supabase/supabase-js';

export type StudentSuggestionErrorCode =
  | 'UNAUTHENTICATED'
  | 'MEMBERSHIP_REQUIRED'
  | 'INVALID_TARGET_ROLE'
  | 'INVALID_INPUT'
  | 'SUGGESTION_NOT_FOUND'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: StudentSuggestionErrorCode };

export interface SubmitStudentSuggestionParams {
  targetRole: string;
  category: string;
  title: string;
  content: string;
}

export interface RespondToStudentSuggestionParams {
  suggestionId: string;
  responseText: string;
  newStatus: string;
}

export interface SuggestionResponseDto {
  id: string;
  responder_user_id: string;
  by: string;
  byRole: string;
  response_text: string;
  created_at: string;
}

export interface StudentSuggestionDto {
  id: string;
  student_user_id: string;
  student_name: string;
  target_role: string;
  category: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  responses: SuggestionResponseDto[];
}

export interface SuggestionResponse {
  id: string;
  responderUserId: string;
  responderName: string;
  responderRole: string;
  responseText: string;
  createdAt: string;
}

export interface StudentSuggestion {
  id: string;
  studentUserId: string;
  studentName: string;
  targetRole: string;
  category: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  responses: SuggestionResponse[];
}

function normalizeError(error: any): StudentSuggestionErrorCode {
  if (!error) return 'UNKNOWN_ERROR';
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('unauthenticated') || error.code === 'PGRST301') return 'UNAUTHENTICATED';
  if (msg.includes('membership required')) return 'MEMBERSHIP_REQUIRED';
  if (msg.includes('forbidden') || error.code === '42501') return 'FORBIDDEN';
  if (msg.includes('suggestion not found')) return 'SUGGESTION_NOT_FOUND';
  if (msg.includes('invalid_target_role')) return 'INVALID_TARGET_ROLE';
  if (msg.includes('check_violation') || msg.includes('invalid')) return 'INVALID_INPUT';
  if (error.message?.includes('fetch') || error.message?.includes('network')) return 'NETWORK_ERROR';
  return 'UNKNOWN_ERROR';
}

function mapSuggestion(dto: StudentSuggestionDto): StudentSuggestion {
  return {
    id: dto.id,
    studentUserId: dto.student_user_id,
    studentName: dto.student_name,
    targetRole: dto.target_role,
    category: dto.category,
    title: dto.title,
    content: dto.content,
    status: dto.status,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    responses: (dto.responses || []).map(r => ({
      id: r.id,
      responderUserId: r.responder_user_id,
      responderName: r.by,
      responderRole: r.byRole,
      responseText: r.response_text,
      createdAt: r.created_at,
    }))
  };
}

export async function submitStudentSuggestion(
  supabase: SupabaseClient,
  params: SubmitStudentSuggestionParams
): Promise<ServiceResult<string>> {
  try {
    const { data, error } = await supabase.rpc('submit_student_suggestion', {
      p_target_role: params.targetRole,
      p_category: params.category.trim(),
      p_title: params.title.trim(),
      p_content: params.content.trim(),
    });

    if (error) {
      return { ok: false, error: normalizeError(error) };
    }

    return { ok: true, data: data as string };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}

export async function respondToStudentSuggestion(
  supabase: SupabaseClient,
  params: RespondToStudentSuggestionParams
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.rpc('respond_to_student_suggestion', {
      p_suggestion_id: params.suggestionId,
      p_response_text: params.responseText.trim(),
      p_new_status: params.newStatus,
    });

    if (error) {
      return { ok: false, error: normalizeError(error) };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}

export async function loadVisibleStudentSuggestions(
  supabase: SupabaseClient
): Promise<ServiceResult<StudentSuggestion[]>> {
  try {
    const { data, error } = await supabase.rpc('list_visible_student_suggestions_v2');

    if (error) {
      return { ok: false, error: normalizeError(error) };
    }

    return { ok: true, data: (data || []).map(mapSuggestion) };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}
