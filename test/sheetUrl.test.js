import { describe, it, expect } from 'vitest';
import {
  parseSheetUrl,
  isSheetUrl,
  csvUrl,
  InvalidSheetUrl,
} from '../src/sheetUrl.js';

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

describe('parseSheetUrl', () => {
  it('reads an edit URL', () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit`))
      .toEqual({ id: ID, gid: '0' });
  });

  it('reads a gid from the fragment', () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=1234`))
      .toEqual({ id: ID, gid: '1234' });
  });

  it('reads a gid from the query string', () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=99`))
      .toEqual({ id: ID, gid: '99' });
  });

  it('accepts a bare id', () => {
    expect(parseSheetUrl(ID)).toEqual({ id: ID, gid: '0' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseSheetUrl(`  https://docs.google.com/spreadsheets/d/${ID}/edit  `))
      .toEqual({ id: ID, gid: '0' });
  });

  it('throws on garbage', () => {
    expect(() => parseSheetUrl('hello there')).toThrow(InvalidSheetUrl);
  });

  it('throws on a non-sheets Google URL', () => {
    expect(() => parseSheetUrl('https://docs.google.com/document/d/abc/edit'))
      .toThrow(InvalidSheetUrl);
  });
});

describe('isSheetUrl', () => {
  it('is true for a sheets link', () => {
    expect(isSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBe(true);
  });

  it('is false for pasted cells', () => {
    expect(isSheetUrl('Name\tAnswer\nDana\tHello')).toBe(false);
  });

  it('is false for text that merely mentions a link', () => {
    expect(isSheetUrl(`see https://docs.google.com/spreadsheets/d/${ID}/edit for details`))
      .toBe(false);
  });
});

describe('csvUrl', () => {
  it('builds the gviz CSV endpoint', () => {
    expect(csvUrl(ID, '7')).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=7`,
    );
  });
});
