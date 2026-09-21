import { describe, it, expect } from 'vitest';
import { toRecords, filterRecords, columnLetter } from '../src/records.js';

describe('columnLetter', () => {
  it('maps the first column to A', () => {
    expect(columnLetter(0)).toBe('A');
  });

  it('maps the 26th column to Z', () => {
    expect(columnLetter(25)).toBe('Z');
  });

  it('maps the 27th column to AA', () => {
    expect(columnLetter(26)).toBe('AA');
  });
});

describe('toRecords', () => {
  it('uses row 0 as labels and later rows as records', () => {
    const rows = [['Name', 'Answer'], ['Dana', 'Yes'], ['Sam', 'No']];
    expect(toRecords(rows)).toEqual([
      { index: 1, fields: [{ label: 'Name', value: 'Dana' }, { label: 'Answer', value: 'Yes' }] },
      { index: 2, fields: [{ label: 'Name', value: 'Sam' }, { label: 'Answer', value: 'No' }] },
    ]);
  });

  it('honours a header row that is not row 0', () => {
    const rows = [['2026 Applications'], ['Name', 'Answer'], ['Dana', 'Yes']];
    expect(toRecords(rows, 1)).toEqual([
      { index: 1, fields: [{ label: 'Name', value: 'Dana' }, { label: 'Answer', value: 'Yes' }] },
    ]);
  });

  it('drops empty and whitespace-only cells', () => {
    const rows = [['Name', 'Answer'], ['Dana', '   ']];
    expect(toRecords(rows)).toEqual([
      { index: 1, fields: [{ label: 'Name', value: 'Dana' }] },
    ]);
  });

  it('drops a record whose cells are all empty', () => {
    const rows = [['Name', 'Answer'], ['', ''], ['Sam', 'No']];
    expect(toRecords(rows)).toEqual([
      { index: 1, fields: [{ label: 'Name', value: 'Sam' }, { label: 'Answer', value: 'No' }] },
    ]);
  });

  it('pads a row shorter than the header', () => {
    const rows = [['Name', 'Answer'], ['Dana']];
    expect(toRecords(rows)).toEqual([
      { index: 1, fields: [{ label: 'Name', value: 'Dana' }] },
    ]);
  });

  it('labels a blank header column with its column letter', () => {
    const rows = [['Name', '', ''], ['Dana', 'stray note', '']];
    expect(toRecords(rows)).toEqual([
      {
        index: 1,
        fields: [
          { label: 'Name', value: 'Dana' },
          { label: 'Column B', value: 'stray note' },
        ],
      },
    ]);
  });

  it('keeps a value in a column past the end of the header', () => {
    const rows = [['Name'], ['Dana', 'extra']];
    expect(toRecords(rows)).toEqual([
      {
        index: 1,
        fields: [
          { label: 'Name', value: 'Dana' },
          { label: 'Column B', value: 'extra' },
        ],
      },
    ]);
  });

  it('disambiguates duplicate labels with the column letter', () => {
    const rows = [['Notes', 'Notes'], ['first', 'second']];
    expect(toRecords(rows)).toEqual([
      {
        index: 1,
        fields: [
          { label: 'Notes (A)', value: 'first' },
          { label: 'Notes (B)', value: 'second' },
        ],
      },
    ]);
  });

  it('survives gviz width padding', () => {
    const header = ['Name', 'Answer', '', '', '', ''];
    const row = ['Dana', 'Yes', '', '', '', ''];
    expect(toRecords([header, row])).toEqual([
      { index: 1, fields: [{ label: 'Name', value: 'Dana' }, { label: 'Answer', value: 'Yes' }] },
    ]);
  });

  it('returns nothing for a header with no data', () => {
    expect(toRecords([['Name', 'Answer']])).toEqual([]);
  });

  it('returns nothing for no rows', () => {
    expect(toRecords([])).toEqual([]);
  });
});

describe('filterRecords', () => {
  const records = [
    { index: 1, fields: [{ label: 'Name', value: 'Dana' }] },
    { index: 2, fields: [{ label: 'Name', value: 'Sam' }] },
  ];

  it('returns everything for an empty query', () => {
    expect(filterRecords(records, '')).toEqual(records);
  });

  it('returns everything for a whitespace query', () => {
    expect(filterRecords(records, '   ')).toEqual(records);
  });

  it('matches a value without regard to case', () => {
    expect(filterRecords(records, 'dana')).toEqual([records[0]]);
  });

  it('matches a label', () => {
    expect(filterRecords(records, 'name')).toEqual(records);
  });

  it('returns nothing when no record matches', () => {
    expect(filterRecords(records, 'zzz')).toEqual([]);
  });
});
