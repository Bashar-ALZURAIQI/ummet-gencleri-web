import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appTsxPath = path.resolve(__dirname, '../src/App.tsx');
const appTsx = fs.readFileSync(appTsxPath, 'utf8');

describe('Route Code Splitting Contract', () => {
  it('does not have eager static page imports', () => {
    const pages = [
      'HomePage', 'AboutPage', 'ProgramsPage', 'ContactPage',
      'MediaGallery', 'NewsPage', 'StudentGuide', 'FAQPage',
      'AuthPages', 'StudentDashboard', 'AdminDashboard',
      'BoardPage', 'CommitteePage'
    ];

    for (const page of pages) {
      // Matches: import HomePage from './pages/HomePage'
      // Or: import { LoginPage } from './pages/AuthPages'
      const eagerImportRegex = new RegExp(`import\\s+.*?\\b${page}\\b.*?\\s+from\\s+['"]\\.\\/pages\\/${page}['"]`);
      assert.ok(
        !eagerImportRegex.test(appTsx),
        `Found eager static import for ${page} in src/App.tsx`
      );
    }
  });

  it('uses React lazy for dynamic route declarations', () => {
    assert.ok(
      /lazy\s*\(/.test(appTsx),
      'Missing lazy() usage in src/App.tsx'
    );
  });

  it('uses dynamic imports for page components', () => {
    const pages = [
      'HomePage', 'AboutPage', 'ProgramsPage', 'ContactPage',
      'MediaGallery', 'NewsPage', 'StudentGuide', 'FAQPage',
      'AuthPages', 'StudentDashboard', 'AdminDashboard',
      'BoardPage', 'CommitteePage'
    ];

    for (const page of pages) {
      const dynamicImportRegex = new RegExp(`import\\(['"]\\.\\/pages\\/${page}['"]\\)`);
      assert.ok(
        dynamicImportRegex.test(appTsx),
        `Missing dynamic import for ${page} in src/App.tsx`
      );
    }
  });

  it('contains a Suspense boundary', () => {
    assert.ok(
      /<Suspense\s+fallback=/.test(appTsx),
      'Missing Suspense wrapper with fallback in src/App.tsx'
    );
  });

  it('does not wrap the entire AppProvider in Suspense', () => {
    assert.ok(
      !/<Suspense[^>]*>\s*<AppProvider>/i.test(appTsx),
      'AppProvider should not be wrapped by Suspense'
    );
  });
});
