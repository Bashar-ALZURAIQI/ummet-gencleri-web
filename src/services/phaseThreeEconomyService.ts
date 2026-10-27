import { supabase } from '../lib/supabase.ts';
import { createPhaseThreeEconomyRepository } from '../domain/phaseThreeEconomyRepository.ts';
import type { InternalEconomyClient } from '../domain/internalEconomyRepository.ts';

const repository = createPhaseThreeEconomyRepository(supabase as unknown as InternalEconomyClient);

export const loadPendingExcuses = repository.loadPendingExcuses;
export const reviewExcuse = repository.reviewExcuse;
export const loadActivityEvaluations = repository.loadActivityEvaluations;
export const saveActivityAttendance = repository.saveAttendance;
export const finalizeActivityEvaluation = repository.finalizeActivity;
export const cancelActivityEvaluation = repository.cancelActivity;
export const loadManagedTasks = repository.loadManagedTasks;
export const loadManagedTaskEnrollments = repository.loadManagedTaskEnrollments;
export const saveTaskCompletion = repository.saveTaskCompletion;
export const finalizeTaskEvaluation = repository.finalizeTask;
export const loadMemberPoints = repository.loadMemberPoints;
export const adjustMemberPoints = repository.adjustMemberPoints;
export const loadActiveEconomySeason = repository.loadActiveSeason;
export const endEconomySeason = repository.endSeason;
export const loadPublicLeaderboard = repository.loadPublicLeaderboard;
export const loadMonthlyStar = repository.loadMonthlyStar;
export const loadOwnGamificationSummary = repository.loadOwnGamificationSummary;
