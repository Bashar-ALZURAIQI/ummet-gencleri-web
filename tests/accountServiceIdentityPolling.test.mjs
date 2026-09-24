import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Account Service Identity Polling Integration', async () => {
    let fileContent;

    it('loads the source code', async () => {
        const filePath = path.resolve('src/services/accountService.ts');
        fileContent = await fs.readFile(filePath, 'utf8');
        assert.ok(fileContent.length > 0);
    });

    it('uses createIdentityRefreshPolling', () => {
        assert.ok(fileContent.includes('createIdentityRefreshPolling'), 'Should import/use createIdentityRefreshPolling');
    });

    it('does NOT use createIdentitySubscription', () => {
        assert.ok(!fileContent.includes('createIdentitySubscription'), 'Should NOT use createIdentitySubscription');
    });

    it('does NOT use IdentityRealtimeClient', () => {
        assert.ok(!fileContent.includes('IdentityRealtimeClient'), 'Should NOT use IdentityRealtimeClient');
    });

    it('routes scheduled refreshes through requestConfirmedRefresh("profile")', () => {
        assert.ok(fileContent.includes("requestConfirmedRefresh('profile')") || fileContent.includes('requestConfirmedRefresh("profile")'), 'Should call requestConfirmedRefresh with profile');
    });

    it('preserves the public function: subscribeToOwnProfileAndAssignment', () => {
        assert.ok(fileContent.includes('subscribeToOwnProfileAndAssignment('), 'Should preserve subscribeToOwnProfileAndAssignment signature');
    });
});
