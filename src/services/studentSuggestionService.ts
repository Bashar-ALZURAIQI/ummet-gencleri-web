import { supabase } from '../lib/supabase.js';
import {
  submitStudentSuggestion as gatewaySubmit,
  respondToStudentSuggestion as gatewayRespond,
  loadVisibleStudentSuggestions as gatewayLoad,
  SubmitStudentSuggestionParams,
  RespondToStudentSuggestionParams
} from '../domain/studentSuggestionGateway.js';

export const studentSuggestionService = {
  async submitStudentSuggestion(params: SubmitStudentSuggestionParams) {
    return gatewaySubmit(supabase, params);
  },

  async respondToStudentSuggestion(params: RespondToStudentSuggestionParams) {
    return gatewayRespond(supabase, params);
  },

  async loadVisibleStudentSuggestions() {
    return gatewayLoad(supabase);
  }
};

