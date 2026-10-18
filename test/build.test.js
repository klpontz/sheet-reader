import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    html = readFileSync('sheeet-reader.html', 'utf8');
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

  it('writes an identical index.html for the hosted site', () => {
    expect(readFileSync('index.html', 'utf8')).toBe(html);
  });

  it('uses the Sheeet Reader name', () => {
    expect(html).toContain('<title>Sheeet Reader</title>');
    expect(html).toMatch(/<h1>[\s\S]*Sheeet Reader[\s\S]*<\/h1>/);
  });

  it('inlines the logo in the header and as an SVG favicon', () => {
    expect(html).not.toContain('__LOGO__');
    expect(html).toMatch(/<h1>\s*<svg[^>]+class="logo"/);
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/);
  });

  it('uses the app-tile icon as the favicon and the cell stack as the logo', () => {
    const favicon = decodeURIComponent(html.match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)">/)[1]);
    expect(favicon).toBe(readFileSync('src/favicon.svg', 'utf8').trim());
    expect(html).toContain(readFileSync('src/logo.svg', 'utf8').trim().replace('<svg ', '<svg class="logo" aria-hidden="true" '));
  });

  it('sends no referrer', () => {
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });

  describe('Content-Security-Policy', () => {
    const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
    let policy;

    beforeAll(() => {
      const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
      policy = Object.fromEntries(
        match[1].split(';').map((part) => part.trim().split(/\s+/)).map(([k, ...v]) => [k, v]),
      );
    });

    it('blocks everything by default', () => {
      expect(policy['default-src']).toEqual(["'none'"]);
      expect(policy['base-uri']).toEqual(["'none'"]);
      expect(policy['form-action']).toEqual(["'none'"]);
    });

    it('allows network requests only to Google Sheets', () => {
      expect(policy['connect-src']).toEqual(['https://docs.google.com']);
    });

    it('allows only the exact inline script and style', () => {
      const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
      const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
      expect(policy['script-src']).toEqual([sha(script)]);
      expect(policy['style-src']).toEqual([sha(style)]);
    });

    it('has one inline script, one style block, and no style attributes', () => {
      expect(html.match(/<script/g)).toHaveLength(1);
      expect(html.match(/<style/g)).toHaveLength(1);
      expect(html).not.toMatch(/\sstyle="/);
    });
  });
});
