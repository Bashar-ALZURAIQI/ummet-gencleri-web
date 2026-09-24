import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createIdentityRefreshPolling, IDENTITY_REFRESH_INTERVAL_MS } from '../src/domain/identityRefreshPolling.ts';

describe('Identity Refresh Polling Domain', () => {
    it('Default interval is exactly 5 * 60 * 1000 ms', () => {
        assert.strictEqual(IDENTITY_REFRESH_INTERVAL_MS, 300000);
    });

    it('Creating the poller does NOT immediately request a refresh', () => {
        let refreshCount = 0;
        const env = {
            isVisible: () => true,
            setInterval: () => 1,
            clearInterval: () => {},
            addVisibilityChangeListener: () => {},
            removeVisibilityChangeListener: () => {}
        };
        createIdentityRefreshPolling({
            requestRefresh: () => { refreshCount++; },
            environment: env
        });
        assert.strictEqual(refreshCount, 0);
    });

    it('While document/page is visible: an interval tick requests exactly one refresh', () => {
        let refreshCount = 0;
        let intervalCb = null;
        const env = {
            isVisible: () => true,
            setInterval: (cb) => { intervalCb = cb; return 1; },
            clearInterval: () => {},
            addVisibilityChangeListener: () => {},
            removeVisibilityChangeListener: () => {}
        };
        createIdentityRefreshPolling({
            requestRefresh: () => { refreshCount++; },
            environment: env
        });
        
        assert.ok(intervalCb);
        intervalCb(); // tick
        assert.strictEqual(refreshCount, 1);
        intervalCb(); // tick
        assert.strictEqual(refreshCount, 2);
    });

    it('While hidden: interval ticks produce NO refresh', () => {
        let refreshCount = 0;
        let intervalCb = null;
        let visible = false;
        const env = {
            isVisible: () => visible,
            setInterval: (cb) => { intervalCb = cb; return 1; },
            clearInterval: () => {},
            addVisibilityChangeListener: () => {},
            removeVisibilityChangeListener: () => {}
        };
        createIdentityRefreshPolling({
            requestRefresh: () => { refreshCount++; },
            environment: env
        });
        
        intervalCb(); // tick
        assert.strictEqual(refreshCount, 0);
    });

    it('When the page transitions from hidden -> visible: request exactly one immediate refresh', () => {
        let refreshCount = 0;
        let visListener = null;
        let visible = false;
        const env = {
            isVisible: () => visible,
            setInterval: () => 1,
            clearInterval: () => {},
            addVisibilityChangeListener: (l) => { visListener = l; },
            removeVisibilityChangeListener: () => {}
        };
        createIdentityRefreshPolling({
            requestRefresh: () => { refreshCount++; },
            environment: env
        });
        
        assert.ok(visListener);
        // still hidden, listener fires?
        visListener();
        assert.strictEqual(refreshCount, 0);

        // transition to visible
        visible = true;
        visListener();
        assert.strictEqual(refreshCount, 1);
        
        // multiple transitions to visible only fire if visible
        visListener();
        assert.strictEqual(refreshCount, 2);
    });

    it('Cleanup clears the interval, removes listener, is safe/idempotent, no callbacks can refresh after disposal', () => {
        let refreshCount = 0;
        let intervalCb = null;
        let visListener = null;
        let clearedInterval = false;
        let removedListener = false;

        const env = {
            isVisible: () => true,
            setInterval: (cb) => { intervalCb = cb; return 123; },
            clearInterval: (id) => { 
                if (id === 123) clearedInterval = true; 
            },
            addVisibilityChangeListener: (l) => { visListener = l; },
            removeVisibilityChangeListener: (l) => {
                if (l === visListener) removedListener = true;
            }
        };

        const cleanup = createIdentityRefreshPolling({
            requestRefresh: () => { refreshCount++; },
            environment: env
        });

        cleanup();
        assert.strictEqual(clearedInterval, true);
        assert.strictEqual(removedListener, true);

        // idempotent
        cleanup(); 

        // no callbacks can refresh after disposal
        intervalCb();
        visListener();
        assert.strictEqual(refreshCount, 0);
    });
});
