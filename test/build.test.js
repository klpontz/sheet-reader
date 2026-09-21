import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateBundle } from '../build.js';

describe('validateBundle (finding 4)', () => {
  it('rejects a bundle that is not valid JavaScript, such as a leftover named export', () => {
    expect(() => validateBundle('export { a as b };')).toThrow();
  });

  it('rejects a bundle with a duplicate top-level const declaration', () => {
    expect(() => validateBundle('const ID_IN_URL = 1;\nconst ID_IN_URL = 2;')).toThrow();
  });

  it('accepts a bundle that parses as valid JavaScript', () => {
    expect(() => validateBundle('const a = 1;\nfunction b() { return a; }')).not.toThrow();
  });
});

describe('build', () => {
  let html;

  beforeAll(() => {
    execFileSync('node', ['build.js'], { cwd: process.cwd() });
    html = readFileSync('sheet-reader.html', 'utf8');
  });

  it('inlines the bundle in place of the placeholder', () => {
    expect(html).not.toContain('__BUNDLE__');
  });

  it('contains no export statements', () => {
    expect(html).not.toMatch(/^\s*export\s/m);
  });

  it('contains no import statements', () => {
    expect(html).not.toMatch(/^\s*import\s/m);
  });

  it('includes code from every module', () => {
    expect(html).toContain('function parseDelimited');
    expect(html).toContain('function parseSheetUrl');
    expect(html).toContain('function toRecords');
    expect(html).toContain('function renderCards');
  });

  it('references no external resources', () => {
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
  });
});
