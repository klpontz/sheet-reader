import { describe, it, expect, beforeEach, vi } from 'vitest';
import { helpers, storage, testing } from '../src/main.js';

const { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure } = helpers;
const { STATE, adopt, persist, sanitizeRestored, debounce } = testing;

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

function setupDom() {
  document.body.innerHTML = `
    <textarea id="input"></textarea>
    <button id="load" type="button"></button>
    <select id="header-row"></select>
    <input id="filter" type="search" />
    <button id="clear" type="button"></button>
    <p id="status"></p>
    <p id="count"></p>
    <main id="cards"></main>
  `;
  STATE.rows = [];
  STATE.records = [];
  STATE.headerRow = 0;
  try {
    localStorage.clear();
  } catch {
    // no-op
  }
}

describe('classifyInput', () => {
  it('calls blank input empty', () => {
    expect(classifyInput('   ')).toBe('empty');
  });

  it('calls a sheets link a url', () => {
    expect(classifyInput(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBe('url');
  });

  it('calls pasted cells cells', () => {
    expect(classifyInput('Name\tAnswer\nDana\tHello')).toBe('cells');
  });

  it('calls a single word cells', () => {
    expect(classifyInput('hello')).toBe('cells');
  });
});

describe('looksLikeSignInPage', () => {
  it('detects an HTML document', () => {
    expect(looksLikeSignInPage('<!DOCTYPE html><html><head>')).toBe(true);
  });

  it('detects a bare html tag', () => {
    expect(looksLikeSignInPage('  <HTML lang="en">')).toBe(true);
  });

  it('passes ordinary CSV through', () => {
    expect(looksLikeSignInPage('Name,Answer\nDana,Hello')).toBe(false);
  });

  it('does not trip on a cell containing markup', () => {
    expect(looksLikeSignInPage('Name,Answer\nDana,"<b>hi</b>"')).toBe(false);
  });
});

describe('rowsFromText', () => {
  it('parses tab-separated text', () => {
    expect(rowsFromText('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('parses comma-separated text', () => {
    expect(rowsFromText('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('messageForFetchFailure', () => {
  it('explains an unshared sheet', () => {
    expect(messageForFetchFailure(200, '<!DOCTYPE html>')).toBe(
      'This sheet is not public, so it cannot be read from a link. Copy the cells and paste them instead.',
    );
  });

  it('explains a missing sheet', () => {
    expect(messageForFetchFailure(404, '')).toBe(
      'That sheet or tab does not exist. Check the link.',
    );
  });

  it('explains a bad gid', () => {
    expect(messageForFetchFailure(400, '')).toBe(
      'That sheet or tab does not exist. Check the link.',
    );
  });
});

describe('persist (finding 2)', () => {
  it('does not overwrite a stored dataset when STATE has no records', () => {
    setupDom();
    STATE.rows = [['Name'], ['Dana']];
    STATE.records = [{ index: 1, fields: [{ label: 'Name', value: 'Dana' }] }];
    persist();
    const before = storage.restore();
    expect(before).not.toBeNull();

    STATE.rows = [['Header only']];
    STATE.records = [];
    persist();

    expect(storage.restore()).toEqual(before);
  });
});

describe('adopt (finding 3): headerRow reset between datasets', () => {
  it('resets STATE.headerRow to 0 before clamping for a newly adopted dataset', () => {
    setupDom();
    STATE.headerRow = 3;
    adopt([
      ['Name', 'Answer'],
      ['Dana', 'Hi'],
    ]);
    expect(STATE.headerRow).toBe(0);
  });
});

describe('adopt (finding 5): not-tabular vs header-only messages', () => {
  it('shows the not-tabular message for a single cell of prose', () => {
    setupDom();
    const rows = rowsFromText('I love reading these responses every single week and it is lovely.');
    adopt(rows);
    expect(document.getElementById('status').textContent).toBe(
      'That does not look like spreadsheet cells. Select the cells in your sheet and copy them.',
    );
  });

  it('shows the header-only message for one row of multiple columns and no data', () => {
    setupDom();
    const rows = rowsFromText('Name\tAnswer');
    adopt(rows);
    expect(document.getElementById('status').textContent).toBe(
      'That looks like a header row with no data under it.',
    );
  });
});

describe('sanitizeRestored (finding 8)', () => {
  it('rejects a payload whose rows are not an array of arrays', () => {
    expect(sanitizeRestored({ rows: 'nope' })).toBeNull();
  });

  it('rejects a payload whose rows contain a non-array entry', () => {
    expect(sanitizeRestored({ rows: [['a', 'b'], 'not a row'] })).toBeNull();
  });

  it('coerces a string headerRow to an integer and clamps it to a valid range', () => {
    const result = sanitizeRestored({
      rows: [['h'], ['a'], ['b']],
      headerRow: '3',
      filter: '',
      scroll: 0,
    });
    expect(result.headerRow).toBe(1);
    expect(Number.isInteger(result.headerRow)).toBe(true);
  });
});

describe('debounce (finding 9)', () => {
  it('delays invocation and coalesces rapid calls into one', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
