import { supabase } from '../lib/supabase.ts';
import { type WorkloadCounts, mapWorkloadCounts } from '../domain/workloadValidation.ts';

export const fetchWorkloadCounts = async (): Promise<WorkloadCounts> => {
  const { data, error } = await supabase.rpc('get_current_user_workload_counts');
  if (error) throw error;
  return mapWorkloadCounts(data);
};
