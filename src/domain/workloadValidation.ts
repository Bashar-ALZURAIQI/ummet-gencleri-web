export interface WorkloadCounts {
  pendingGuideSuggestions: number;
  unreadContactMessages: number;
  newStudentSuggestions: number;
}

export function mapWorkloadCounts(value: unknown): WorkloadCounts {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid workload counts response structure.');
  }
  
  const record = value as Record<string, unknown>;
  const keys = ['pendingGuideSuggestions', 'unreadContactMessages', 'newStudentSuggestions'] as const;

  for (const key of keys) {
    const val = record[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new Error(`Invalid workload count for ${key}`);
    }
  }

  return {
    pendingGuideSuggestions: record.pendingGuideSuggestions as number,
    unreadContactMessages: record.unreadContactMessages as number,
    newStudentSuggestions: record.newStudentSuggestions as number,
  };
}
