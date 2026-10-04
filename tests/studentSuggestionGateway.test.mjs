import assert from 'node:assert/strict';
import test from 'node:test';

const {
  submitStudentSuggestion,
  respondToStudentSuggestion,
  loadVisibleStudentSuggestions
} = await import('../src/domain/studentSuggestionGateway.ts');

test('submitStudentSuggestion calls submit_student_suggestion RPC with trimmed arguments', async () => {
  let rpcCalled = false;
  let passedArgs = null;
  const mockSupabase = {
    rpc: async (name, args) => {
      rpcCalled = true;
      assert.equal(name, 'submit_student_suggestion');
      passedArgs = args;
      return { error: null, data: 'fake-uuid' };
    }
  };

  const result = await submitStudentSuggestion(mockSupabase, {
    targetRole: 'PRESIDENT',
    category: '  Test Category  ',
    title: '  Test Title  ',
    content: '  Test Content  '
  });

  assert.ok(rpcCalled);
  assert.equal(result.ok, true);
  assert.equal(passedArgs.p_target_role, 'PRESIDENT');
  assert.equal(passedArgs.p_category, 'Test Category');
  assert.equal(passedArgs.p_title, 'Test Title');
  assert.equal(passedArgs.p_content, 'Test Content');
});

test('submitStudentSuggestion normalizes errors to StudentSuggestionErrorCode', async () => {
  const mockSupabase = {
    rpc: async () => {
      return { error: { message: 'Membership required' } };
    }
  };

  const result = await submitStudentSuggestion(mockSupabase, {
    targetRole: 'PRESIDENT',
    category: 'C',
    title: 'T',
    content: 'C'
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'MEMBERSHIP_REQUIRED');
});

test('respondToStudentSuggestion calls respond_to_student_suggestion RPC', async () => {
  let rpcCalled = false;
  const mockSupabase = {
    rpc: async (name, args) => {
      rpcCalled = true;
      assert.equal(name, 'respond_to_student_suggestion');
      assert.equal(args.p_suggestion_id, 'uuid-123');
      assert.equal(args.p_response_text, 'Trimmed response');
      assert.equal(args.p_new_status, 'reviewing');
      return { error: null };
    }
  };

  const result = await respondToStudentSuggestion(mockSupabase, {
    suggestionId: 'uuid-123',
    responseText: '  Trimmed response  ',
    newStatus: 'reviewing'
  });

  assert.ok(rpcCalled);
  assert.equal(result.ok, true);
});

test('loadVisibleStudentSuggestions maps database format and prevents realtime', async () => {
  let rpcCalled = false;
  const mockSupabase = {
    rpc: async (name) => {
      rpcCalled = true;
      assert.equal(name, 'list_visible_student_suggestions_v2');
      return {
        error: null,
        data: [{
          id: 's-123',
          student_user_id: 'u-999',
          student_name: 'Test Student',
          target_role: 'PRESIDENT',
          category: 'C',
          title: 'T',
          content: 'C',
          status: 'new',
          created_at: '2026-09-26T00:00:00Z',
          updated_at: '2026-09-26T00:00:00Z',
          responses: [{
            id: 'r-123',
            responder_user_id: 'u-123',
            by: 'Exec Name',
            byRole: 'PRESIDENT',
            response_text: 'Hello',
            created_at: '2026-09-26T01:00:00Z'
          }]
        }]
      };
    }
  };

  const result = await loadVisibleStudentSuggestions(mockSupabase);
  assert.ok(rpcCalled);
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, 's-123');
  assert.equal(result.data[0].studentUserId, 'u-999');
  assert.equal(result.data[0].studentName, 'Test Student');
  assert.equal(result.data[0].targetRole, 'PRESIDENT');
  assert.equal(result.data[0].responses.length, 1);
  assert.equal(result.data[0].responses[0].responderUserId, 'u-123');
  assert.equal(result.data[0].responses[0].responderName, 'Exec Name');
  assert.equal(result.data[0].responses[0].responderRole, 'PRESIDENT');
  assert.equal(result.data[0].responses[0].responseText, 'Hello');
});
