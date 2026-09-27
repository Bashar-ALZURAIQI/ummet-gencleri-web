import { supabase } from '../lib/supabase.ts';

export interface WorkloadCounts {
  pendingGuideSuggestions: number;
  unreadContactMessages: number;
  newStudentSuggestions: number;
}

export const fetchWorkloadCounts = async (): Promise<WorkloadCounts> => {
  const { data, error } = await supabase.rpc('get_current_user_workload_counts');
  if (error) throw error;
  return data as WorkloadCounts;
};
