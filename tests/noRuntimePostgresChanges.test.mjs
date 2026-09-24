import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

async function findFiles(dir, filter) {
    let results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(await findFiles(fullPath, filter));
        } else if (filter(fullPath)) {
            results.push(fullPath);
        }
    }
    return results;
}

describe('Audit: No Runtime Postgres Changes Channels', async () => {
    let tsxFiles = [];

    it('collects all src files', async () => {
        tsxFiles = await findFiles('src', (name) => name.endsWith('.ts') || name.endsWith('.tsx'));
        assert.ok(tsxFiles.length > 0);
    });

    it('contains no postgres_changes in any file other than realtimeIdentitySubscription.ts', async () => {
        const failingFiles = [];
        for (const file of tsxFiles) {
            // Ignore the known compatibility module
            if (file.replace(/\\/g, '/').includes('src/domain/realtimeIdentitySubscription.ts')) {
                continue;
            }

            const content = await fs.readFile(file, 'utf8');
            if (content.includes(".on('postgres_changes'") || content.includes('.on("postgres_changes"')) {
                failingFiles.push(file);
            }
            if (content.includes("postgres_changes")) {
               failingFiles.push(file); 
            }
        }
        
        if (failingFiles.length > 0) {
            assert.fail(`Found postgres_changes in: ${failingFiles.join(', ')}`);
        }
    });

    it('verifies accountService uses bounded polling and not createIdentitySubscription', async () => {
        const accountServiceFile = tsxFiles.find(f => f.replace(/\\/g, '/').includes('src/services/accountService.ts'));
        assert.ok(accountServiceFile, 'accountService.ts should exist');
        const content = await fs.readFile(accountServiceFile, 'utf8');
        assert.ok(content.includes('createIdentityRefreshPolling'), 'Should use createIdentityRefreshPolling');
        assert.ok(!content.includes('createIdentitySubscription'), 'Should NOT use createIdentitySubscription');
    });
});
