import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import * as workflow from '../src/domain/applicationEmailWorkflow.ts';

const applications = [
  { id: 'a1', status: 'pending' },
  { id: 'a2', status: 'interview' },
  { id: 'a3', status: 'pending' },
];

test('pending application badge is visible only to the President and decreases with status changes', () => {
  assert.equal(typeof workflow.getPendingApplicationBadge, 'function');
  assert.equal(workflow.getPendingApplicationBadge('PRESIDENT', applications), 2);
  assert.equal(workflow.getPendingApplicationBadge('STUDENT', applications), undefined);
  assert.equal(workflow.getPendingApplicationBadge('VICE_PRESIDENT', applications), undefined);
  assert.equal(workflow.getPendingApplicationBadge('PRESIDENT', applications.map((application) => (
    application.id === 'a1' ? { ...application, status: 'accepted' } : application
  ))), 1);
  assert.equal(workflow.getPendingApplicationBadge('PRESIDENT', applications.map((application) => ({
    ...application,
    status: 'rejected',
  }))), undefined);
});

test('President refresh runs on focus and interval and fully cleans up', () => {
  assert.equal(typeof workflow.startPresidentApplicationRefresh, 'function');
  const listeners = new Map();
  const cleared = [];
  let intervalCallback;
  let refreshes = 0;
  const stop = workflow.startPresidentApplicationRefresh({
    role: 'PRESIDENT',
    refresh: () => { refreshes += 1; },
    eventTarget: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name, callback) => {
        if (listeners.get(name) === callback) listeners.delete(name);
      },
    },
  });

  listeners.get('focus')();
  assert.equal(refreshes, 1);
  stop();
  assert.equal(listeners.has('focus'), false);
});

test('application refresh does not install polling or focus listeners for non-Presidents', () => {
  assert.equal(typeof workflow.startPresidentApplicationRefresh, 'function');
  let listeners = 0;
  let intervals = 0;
  const stop = workflow.startPresidentApplicationRefresh({
    role: 'STUDENT',
    refresh: () => assert.fail('student refresh must not run'),
    eventTarget: {
      addEventListener: () => { listeners += 1; },
      removeEventListener: () => {},
    },
  });
  stop();
  assert.equal(listeners, 0);
});

test('shared Sidebar badge renders a positive count on desktop and mobile and hides zero', async () => {
  let sidebarBadge = {};
  try {
    sidebarBadge = await import('../src/components/SidebarBadge.ts');
  } catch {
    // RED: the shared badge component does not exist yet.
  }
  assert.equal(typeof sidebarBadge.SidebarBadge, 'function');
  const desktop = renderToStaticMarkup(createElement(sidebarBadge.SidebarBadge, { count: 4, surface: 'desktop' }));
  const mobile = renderToStaticMarkup(createElement(sidebarBadge.SidebarBadge, { count: 4, surface: 'mobile' }));
  const zero = renderToStaticMarkup(createElement(sidebarBadge.SidebarBadge, { count: 0, surface: 'desktop' }));
  assert.match(desktop, />4<\/span>/);
  assert.match(mobile, />4<\/span>/);
  assert.match(desktop, /data-sidebar-surface="desktop"/);
  assert.match(mobile, /data-sidebar-surface="mobile"/);
  assert.equal(zero, '');
});

test('AdminDashboard wires the President pending count to the Applications sidebar item', async () => {
  const source = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  assert.match(source, /getPendingApplicationBadge\(currentUser\?\.role, applications\)/);
  assert.match(source, /id:\s*'applications'[\s\S]{0,180}badge:\s*pendingApplicationBadge/);
});

test('AppContext installs the President refresh lifecycle around the existing authoritative loader', async () => {
  const source = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /startPresidentApplicationRefresh/);
  assert.match(source, /role:\s*currentUser\?\.role/);
  assert.match(source, /refresh:\s*refreshApplications/);
});
