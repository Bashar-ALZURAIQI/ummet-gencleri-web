import { supabase } from '../lib/supabase.ts';
import {
  createInternalEconomyRepository,
  type InternalEconomyClient,
} from '../domain/internalEconomyRepository.ts';

const repository = createInternalEconomyRepository(supabase as unknown as InternalEconomyClient);

export const loadStudentActivityBoard = () => repository.loadStudentActivities();
export const loadStudentTaskBoard = () => repository.loadStudentTasks();
export const setOwnActivityDecision = repository.setOwnActivityDecision;
export const registerForInternalTask = repository.registerForTask;
export const cancelTaskEnrollment = repository.cancelTaskEnrollment;
export const upsertEventActivity = repository.upsertEventActivity;
export const createInternalTask = repository.createTask;
