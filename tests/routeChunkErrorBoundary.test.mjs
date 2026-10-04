import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const boundaryPath = path.resolve(__dirname, '../src/components/RouteChunkErrorBoundary.tsx');
const boundarySource = fs.readFileSync(boundaryPath, 'utf8');

const arPath = path.resolve(__dirname, '../src/i18n/locales/ar.ts');
const trPath = path.resolve(__dirname, '../src/i18n/locales/tr.ts');
const enPath = path.resolve(__dirname, '../src/i18n/locales/en.ts');
const arSource = fs.readFileSync(arPath, 'utf8');
const trSource = fs.readFileSync(trPath, 'utf8');
const enSource = fs.readFileSync(enPath, 'utf8');

describe('Route Chunk Error Boundary Contract', () => {
  it('error boundary exists and uses window.location.reload', () => {
    assert.ok(
      /window\.location\.reload\(\)/.test(boundarySource),
      'RouteChunkErrorBoundary must use window.location.reload()'
    );
  });

  it('no automatic retry or interval', () => {
    assert.ok(!/setInterval/.test(boundarySource), 'Should not use setInterval');
    assert.ok(!/setTimeout/.test(boundarySource), 'Should not use setTimeout');
  });

  it('translation keys exist in AR/TR/EN', () => {
    assert.ok(/routeLoadError:\s*['"]/.test(arSource), 'AR missing routeLoadError');
    assert.ok(/reloadPage:\s*['"]/.test(arSource), 'AR missing reloadPage');
    
    assert.ok(/routeLoadError:\s*['"]/.test(trSource), 'TR missing routeLoadError');
    assert.ok(/reloadPage:\s*['"]/.test(trSource), 'TR missing reloadPage');
    
    assert.ok(/routeLoadError:\s*['"]/.test(enSource), 'EN missing routeLoadError');
    assert.ok(/reloadPage:\s*['"]/.test(enSource), 'EN missing reloadPage');
  });
});
