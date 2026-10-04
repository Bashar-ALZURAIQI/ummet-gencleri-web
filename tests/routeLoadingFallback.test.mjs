import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fallbackPath = path.resolve(__dirname, '../src/components/RouteLoadingFallback.tsx');
const fallbackSource = fs.readFileSync(fallbackPath, 'utf8');

const arPath = path.resolve(__dirname, '../src/i18n/locales/ar.ts');
const trPath = path.resolve(__dirname, '../src/i18n/locales/tr.ts');
const enPath = path.resolve(__dirname, '../src/i18n/locales/en.ts');
const arSource = fs.readFileSync(arPath, 'utf8');
const trSource = fs.readFileSync(trPath, 'utf8');
const enSource = fs.readFileSync(enPath, 'utf8');

describe('Route Loading Fallback Contract', () => {
  it('RouteLoadingFallback exists and uses role="status"', () => {
    assert.ok(
      /role=["']status["']/.test(fallbackSource),
      'RouteLoadingFallback must have role="status"'
    );
  });

  it('uses common.loadingPage translation', () => {
    assert.ok(
      /t\(['"]loadingPage['"]\)/.test(fallbackSource),
      'RouteLoadingFallback must use t("loadingPage")'
    );
  });

  it('translation key loadingPage exists in AR/TR/EN', () => {
    assert.ok(/loadingPage:\s*['"]/.test(arSource), 'AR missing loadingPage');
    assert.ok(/loadingPage:\s*['"]/.test(trSource), 'TR missing loadingPage');
    assert.ok(/loadingPage:\s*['"]/.test(enSource), 'EN missing loadingPage');
  });
});
