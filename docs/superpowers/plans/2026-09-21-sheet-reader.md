# Sheet Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one HTML file that a person double-clicks, pastes spreadsheet cells into, and reads as comfortable text blocks.

**Architecture:** Logic lives in plain ES modules under `src/`, unit tested with Vitest. A build script strips the module syntax and inlines every module into a single HTML template, producing `sheet-reader.html`. That built file opens from `file://` with no server, because ES module imports are blocked on `file://` origins. The user only ever sees the built file.

**Tech Stack:** Vanilla JavaScript, no runtime dependencies. Vitest and jsdom as dev dependencies only. Node 20.20.1 is installed.

**Spec:** `docs/superpowers/specs/2026-09-21-sheet-reader-design.md`

## Global Constraints

- The shipped file has **zero runtime dependencies**. Dev dependencies are fine; anything that ends up inside `sheet-reader.html` is not.
- `sheet-reader.html` must work when opened from `file://`. No ES module syntax, no `fetch` of local files, no server.
- `sheet-reader.html` is **committed to the repo**, not generated on demand. Downloading that one file is the whole install.
- Values from the sheet are inserted as **text nodes only**. Never `innerHTML`, never `insertAdjacentHTML`, never `document.write`.
- Every `localStorage` read and write is wrapped in `try`/`catch`. Storage throws in private windows.
- Render cap is **2,000 records**. Storage cap is **4 MB**.
- Blank column labels become `Column <letter>`. Duplicate labels get ` (<letter>)` appended.
- Every user-facing error message says what happened *and* what to do next. Copy the exact strings from the spec's error table.

---

### Task 1: Project scaffolding and the delimited-text parser

This task carries its own setup because nothing can be tested until Vitest runs.

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `src/delimited.js`
- Test: `test/delimited.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseDelimited(text: string, delimiter: string) -> string[][]`
  - `detectDelimiter(text: string) -> string` returning `"\t"` or `","`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sheet-reader",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "node build.js"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.js`**

jsdom is needed later by the render tests. Setting it globally now avoids a second config change.

```js
export default {
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
};
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` appears, no errors.

- [ ] **Step 4: Write the failing tests**

Create `test/delimited.test.js`. These fixtures mirror what Google actually emits: multi-line cells arrive wrapped in double quotes, exports use `\r\n`, and an escaped quote is doubled.

```js
import { describe, it, expect } from 'vitest';
import { parseDelimited, detectDelimiter } from '../src/delimited.js';

describe('parseDelimited', () => {
  it('splits a simple row', () => {
    expect(parseDelimited('a,b,c', ',')).toEqual([['a', 'b', 'c']]);
  });

  it('splits multiple rows', () => {
    expect(parseDelimited('a,b\nc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps a delimiter inside quotes', () => {
    expect(parseDelimited('"a,b",c', ',')).toEqual([['a,b', 'c']]);
  });

  it('keeps a newline inside quotes', () => {
    expect(parseDelimited('"line one\nline two",next', ',')).toEqual([
      ['line one\nline two', 'next'],
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseDelimited('"she said ""hi""",b', ',')).toEqual([
      ['she said "hi"', 'b'],
    ]);
  });

  it('handles CRLF row endings', () => {
    expect(parseDelimited('a,b\r\nc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles a lone CR row ending', () => {
    expect(parseDelimited('a,b\rc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('ignores a trailing newline', () => {
    expect(parseDelimited('a,b\n', ',')).toEqual([['a', 'b']]);
  });

  it('keeps empty fields', () => {
    expect(parseDelimited('a,,c', ',')).toEqual([['a', '', 'c']]);
  });

  it('handles a single column', () => {
    expect(parseDelimited('a\nb', ',')).toEqual([['a'], ['b']]);
  });

  it('closes an unbalanced quote at end of input', () => {
    expect(parseDelimited('"unterminated', ',')).toEqual([['unterminated']]);
  });

  it('parses tab-separated clipboard content', () => {
    const clipboard = 'Name\tAnswer\nDana\t"First para.\n\nSecond para."';
    expect(parseDelimited(clipboard, '\t')).toEqual([
      ['Name', 'Answer'],
      ['Dana', 'First para.\n\nSecond para.'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('detects tabs from clipboard content', () => {
    expect(detectDelimiter('Name\tAnswer\nDana\tHello')).toBe('\t');
  });

  it('detects commas from export content', () => {
    expect(detectDelimiter('Name,Answer\r\nDana,Hello')).toBe(',');
  });

  it('ignores commas inside a quoted first field', () => {
    expect(detectDelimiter('"a,b,c,d"\tsecond')).toBe('\t');
  });

  it('defaults to comma when neither appears', () => {
    expect(detectDelimiter('single column')).toBe(',');
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. Vitest cannot resolve `../src/delimited.js`.

- [ ] **Step 6: Write the implementation**

Create `src/delimited.js`. Note the guard `field === ''` on the opening quote: a quote only opens a quoted field at the start of a field, which is what keeps a stray mid-field quote from corrupting the rest of the parse.

```js
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function detectDelimiter(text) {
  let inQuotes = false;
  let tabs = 0;
  let commas = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) continue;
    if (ch === '\n' || ch === '\r') break;
    if (ch === '\t') tabs += 1;
    else if (ch === ',') commas += 1;
  }

  return tabs > 0 && tabs >= commas ? '\t' : ',';
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 15 tests.

- [ ] **Step 8: Commit**

```bash
printf 'node_modules/\n' >> .gitignore
git add package.json package-lock.json vitest.config.js src/delimited.js test/delimited.test.js .gitignore
git commit -m "feat: add delimited text parser with delimiter detection"
```

---

### Task 2: Google Sheets URL parsing

**Files:**
- Create: `src/sheetUrl.js`
- Test: `test/sheetUrl.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseSheetUrl(input: string) -> {id: string, gid: string}`
  - `isSheetUrl(text: string) -> boolean`
  - `InvalidSheetUrl` error class
  - `csvUrl(id: string, gid: string) -> string`

- [ ] **Step 1: Write the failing tests**

Create `test/sheetUrl.test.js`.

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. Cannot resolve `../src/sheetUrl.js`.

- [ ] **Step 3: Write the implementation**

Create `src/sheetUrl.js`. `isSheetUrl` requires the whole trimmed input to be the URL, so a paragraph that happens to mention a sheet link is treated as cell text, not as a link to fetch.

```js
export class InvalidSheetUrl extends Error {}

const ID_IN_URL = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const BARE_ID = /^[a-zA-Z0-9-_]{20,}$/;
const GID = /[#?&]gid=([0-9]+)/;
const WHOLE_URL = /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\S*$/;

export function parseSheetUrl(input) {
  const text = String(input ?? '').trim();

  let id;
  const match = text.match(ID_IN_URL);
  if (match) {
    id = match[1];
  } else if (BARE_ID.test(text)) {
    id = text;
  } else {
    throw new InvalidSheetUrl('That does not look like a Google Sheets link.');
  }

  const gidMatch = text.match(GID);
  return { id, gid: gidMatch ? gidMatch[1] : '0' };
}

export function isSheetUrl(text) {
  return WHOLE_URL.test(String(text ?? '').trim());
}

export function csvUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 26 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/sheetUrl.js test/sheetUrl.test.js
git commit -m "feat: add Google Sheets URL parsing and detection"
```

---

### Task 3: Rows to records

This is where the spec's two hard-won rules live. Read the reasoning in the spec before implementing: the gviz endpoint pads every row out to the full grid width, so blank labels are the normal case rather than an edge case, and Google Forms sections routinely produce duplicate question text.

**Files:**
- Create: `src/records.js`
- Test: `test/records.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `columnLetter(index: number) -> string` where `0` is `"A"` and `26` is `"AA"`
  - `toRecords(rows: string[][], headerRowIndex?: number) -> Record[]`
  - `filterRecords(records: Record[], query: string) -> Record[]`
  - `Record` is `{index: number, fields: Array<{label: string, value: string}>}` and `index` is 1-based among kept records

- [ ] **Step 1: Write the failing tests**

Create `test/records.test.js`.

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. Cannot resolve `../src/records.js`.

- [ ] **Step 3: Write the implementation**

Create `src/records.js`.

```js
export function columnLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function buildLabels(header, width) {
  const raw = [];
  for (let i = 0; i < width; i += 1) {
    raw.push((header[i] ?? '').trim());
  }

  const counts = new Map();
  raw.forEach((label) => {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return raw.map((label, i) => {
    if (!label) return `Column ${columnLetter(i)}`;
    if (counts.get(label) > 1) return `${label} (${columnLetter(i)})`;
    return label;
  });
}

export function toRecords(rows, headerRowIndex = 0) {
  if (!rows || rows.length <= headerRowIndex + 1) return [];

  const header = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);

  let width = header.length;
  dataRows.forEach((row) => {
    if (row.length > width) width = row.length;
  });

  const labels = buildLabels(header, width);
  const records = [];

  dataRows.forEach((row) => {
    const fields = [];
    for (let i = 0; i < width; i += 1) {
      const value = (row[i] ?? '').trim();
      if (value) fields.push({ label: labels[i], value });
    }
    if (fields.length > 0) {
      records.push({ index: records.length + 1, fields });
    }
  });

  return records;
}

export function filterRecords(records, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return records;

  return records.filter((record) =>
    record.fields.some(
      (field) =>
        field.label.toLowerCase().includes(needle) ||
        field.value.toLowerCase().includes(needle),
    ),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 45 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/records.js test/records.test.js
git commit -m "feat: convert rows to records with blank and duplicate label rules"
```

---

### Task 4: Rendering

**Files:**
- Create: `src/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `Record` from Task 3.
- Produces:
  - `linkify(text: string, doc?: Document) -> DocumentFragment`
  - `renderCards(records: Record[], container: Element, total: number, doc?: Document) -> void`
  - `RENDER_CAP` constant equal to `2000`

- [ ] **Step 1: Write the failing tests**

Create `test/render.test.js`. The security tests matter most: a sheet is untrusted input, and a cell containing markup must never become markup.

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { linkify, renderCards, RENDER_CAP } from '../src/render.js';

function textOf(node) {
  return node.textContent;
}

describe('linkify', () => {
  it('leaves plain text alone', () => {
    const frag = linkify('no links here');
    expect(frag.querySelectorAll('a')).toHaveLength(0);
    expect(textOf(frag)).toBe('no links here');
  });

  it('turns a bare URL into a link', () => {
    const frag = linkify('https://example.com');
    const links = frag.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links[0].textContent).toBe('https://example.com');
  });

  it('links a URL inside a sentence and keeps the surrounding text', () => {
    const frag = linkify('see https://example.com now');
    expect(frag.querySelectorAll('a')).toHaveLength(1);
    expect(textOf(frag)).toBe('see https://example.com now');
  });

  it('excludes trailing sentence punctuation from the link', () => {
    const frag = linkify('go to https://example.com.');
    expect(frag.querySelector('a').getAttribute('href')).toBe('https://example.com');
    expect(textOf(frag)).toBe('go to https://example.com.');
  });

  it('links more than one URL', () => {
    const frag = linkify('https://a.com and https://b.com');
    expect(frag.querySelectorAll('a')).toHaveLength(2);
  });

  it('adds rel and target to links', () => {
    const link = linkify('https://example.com').querySelector('a');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('treats markup as literal text', () => {
    const frag = linkify('<script>alert(1)</script>');
    expect(frag.querySelectorAll('script')).toHaveLength(0);
    expect(textOf(frag)).toBe('<script>alert(1)</script>');
  });
});

describe('renderCards', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders one card per record', () => {
    renderCards(
      [
        { index: 1, fields: [{ label: 'Name', value: 'Dana' }] },
        { index: 2, fields: [{ label: 'Name', value: 'Sam' }] },
      ],
      container,
      2,
    );
    expect(container.querySelectorAll('.card')).toHaveLength(2);
  });

  it('replaces previous content on a second render', () => {
    const records = [{ index: 1, fields: [{ label: 'Name', value: 'Dana' }] }];
    renderCards(records, container, 1);
    renderCards(records, container, 1);
    expect(container.querySelectorAll('.card')).toHaveLength(1);
  });

  it('renders a label and a value for each field', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'Name', value: 'Dana' }] }],
      container,
      1,
    );
    expect(container.querySelector('.label').textContent).toBe('Name');
    expect(container.querySelector('.value').textContent).toBe('Dana');
  });

  it('shows the record position against the total', () => {
    renderCards(
      [{ index: 3, fields: [{ label: 'Name', value: 'Dana' }] }],
      container,
      47,
    );
    expect(container.querySelector('.card-index').textContent).toBe('Response 3 of 47');
  });

  it('splits a value on newlines into paragraphs', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: 'one\n\ntwo' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.value p')).toHaveLength(2);
  });

  it('marks values with dir auto', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: 'مرحبا' }] }],
      container,
      1,
    );
    expect(container.querySelector('.value p').getAttribute('dir')).toBe('auto');
  });

  it('never turns a cell into markup', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: '<img src=x onerror=alert(1)>' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('.value').textContent)
      .toBe('<img src=x onerror=alert(1)>');
  });

  it('never turns a label into markup', () => {
    renderCards(
      [{ index: 1, fields: [{ label: '<b>bold</b>', value: 'x' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('b')).toHaveLength(0);
  });

  it('links a URL inside a value', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: 'see https://example.com' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.value a')).toHaveLength(1);
  });

  it('caps rendering and says so', () => {
    const records = Array.from({ length: RENDER_CAP + 5 }, (_, i) => ({
      index: i + 1,
      fields: [{ label: 'A', value: String(i) }],
    }));
    renderCards(records, container, records.length);
    expect(container.querySelectorAll('.card')).toHaveLength(RENDER_CAP);
    expect(container.querySelector('.cap-notice')).not.toBeNull();
  });

  it('shows an empty-state message when there is nothing to render', () => {
    renderCards([], container, 0);
    expect(container.querySelector('.empty')).not.toBeNull();
    expect(container.querySelectorAll('.card')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. Cannot resolve `../src/render.js`.

- [ ] **Step 3: Write the implementation**

Create `src/render.js`. Every string from the sheet goes through `createTextNode` or `textContent`. There is no path in this file that assigns HTML.

```js
export const RENDER_CAP = 2000;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

export function linkify(text, doc = document) {
  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const match of String(text).matchAll(URL_PATTERN)) {
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCTUATION);
    if (trailing) url = url.slice(0, url.length - trailing[0].length);

    fragment.appendChild(doc.createTextNode(text.slice(cursor, match.index)));

    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.textContent = url;
    anchor.rel = 'noopener noreferrer';
    anchor.target = '_blank';
    fragment.appendChild(anchor);

    cursor = match.index + url.length;
  }

  fragment.appendChild(doc.createTextNode(text.slice(cursor)));
  return fragment;
}

function renderValue(value, doc) {
  const wrapper = doc.createElement('div');
  wrapper.className = 'value';

  value.split('\n').forEach((line) => {
    if (!line.trim()) return;
    const paragraph = doc.createElement('p');
    paragraph.setAttribute('dir', 'auto');
    paragraph.appendChild(linkify(line, doc));
    wrapper.appendChild(paragraph);
  });

  return wrapper;
}

function renderCard(record, total, doc) {
  const card = doc.createElement('article');
  card.className = 'card';

  const position = doc.createElement('div');
  position.className = 'card-index';
  position.textContent = `Response ${record.index} of ${total}`;
  card.appendChild(position);

  record.fields.forEach((field) => {
    const group = doc.createElement('div');
    group.className = 'field';

    const label = doc.createElement('div');
    label.className = 'label';
    label.textContent = field.label;
    group.appendChild(label);

    group.appendChild(renderValue(field.value, doc));
    card.appendChild(group);
  });

  return card;
}

export function renderCards(records, container, total, doc = document) {
  container.textContent = '';

  if (records.length === 0) {
    const empty = doc.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing to show.';
    container.appendChild(empty);
    return;
  }

  const shown = records.slice(0, RENDER_CAP);

  if (records.length > RENDER_CAP) {
    const notice = doc.createElement('p');
    notice.className = 'cap-notice';
    notice.textContent =
      `Showing the first ${RENDER_CAP} of ${records.length} responses.`;
    container.appendChild(notice);
  }

  const batch = doc.createDocumentFragment();
  shown.forEach((record) => batch.appendChild(renderCard(record, total, doc)));
  container.appendChild(batch);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 63 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "feat: render records as cards with safe text and linkification"
```

---

### Task 5: Page template and build script

This task produces the first shippable artifact. After it, `sheet-reader.html` exists and opens, even though it does nothing yet.

**Files:**
- Create: `src/template.html`
- Create: `build.js`
- Create: `src/main.js` (a stub, filled in by Task 6)
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: all `src/*.js` modules.
- Produces: `sheet-reader.html`, a single file with no module syntax. Element IDs that Task 6 depends on: `input`, `load`, `filter`, `header-row`, `clear`, `cards`, `status`, `count`, `drop-zone`.

- [ ] **Step 1: Create the stub `src/main.js`**

```js
function start() {
  // Task 6 fills this in.
}

if (typeof document !== 'undefined') {
  start();
}
```

- [ ] **Step 2: Create `src/template.html`**

The placeholder comment `/*__BUNDLE__*/` is the single injection point. Styles use a `color-scheme` aware palette so the page follows the system setting without JavaScript.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sheet Reader</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #fbfaf8;
  --fg: #1c1b19;
  --muted: #6b6862;
  --rule: #e2ded7;
  --card: #ffffff;
  --accent: #3a6b52;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17171a;
    --fg: #e8e6e1;
    --muted: #97938c;
    --rule: #2e2e33;
    --card: #1e1e22;
    --accent: #8fc3a8;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0 16px 6rem;
  background: var(--bg);
  color: var(--fg);
  font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  line-height: 1.65;
}
.wrap { max-width: 42rem; margin: 0 auto; }
header.site { padding: 2.5rem 0 1.25rem; }
h1 {
  font-size: 1.05rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin: 0 0 0.75rem;
}
.hint { color: var(--muted); font-size: 0.95rem; margin: 0 0 1rem; }
textarea {
  width: 100%;
  min-height: 7rem;
  padding: 0.75rem;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: var(--card);
  color: var(--fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  resize: vertical;
}
textarea:focus-visible, input:focus-visible, button:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin: 0.75rem 0 0;
}
button, select, input[type="search"] {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: var(--card);
  color: var(--fg);
}
button { cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
input[type="search"] { flex: 1 1 12rem; }
#status { margin: 1rem 0 0; color: var(--muted); font-size: 0.95rem; min-height: 1.4em; }
#status.error { color: #b3261e; }
@media (prefers-color-scheme: dark) { #status.error { color: #f2b8b5; } }
#count { color: var(--muted); font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; }
.reading { padding-top: 1.5rem; }
.card { border-top: 1px solid var(--rule); padding: 2rem 0; }
.card-index {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 1.25rem;
}
.field { margin-bottom: 1.5rem; }
.label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.value { font-size: 1.08rem; }
.value p { margin: 0 0 0.85rem; }
.value p:last-child { margin-bottom: 0; }
.value a { color: var(--accent); }
.empty, .cap-notice { color: var(--muted); font-style: italic; }
body.dragging { outline: 3px dashed var(--accent); outline-offset: -10px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <h1>Sheet Reader</h1>
    <p class="hint">
      In your sheet select the cells and copy them, then paste below.
      You can also drag a downloaded CSV onto this page, or paste a link
      to a sheet that is already public.
    </p>
    <textarea id="input" aria-label="Paste spreadsheet cells or a sheet link"
      placeholder="Paste cells here"></textarea>
    <div class="controls">
      <button id="load" class="primary" type="button">Read</button>
      <label for="header-row" class="hint" style="margin:0">Header row</label>
      <select id="header-row" aria-label="Which row holds the headers"></select>
      <input id="filter" type="search" placeholder="Filter responses" aria-label="Filter responses">
      <button id="clear" type="button">Clear data</button>
    </div>
    <p id="status" role="status"></p>
    <p id="count"></p>
  </header>
  <main id="cards" class="reading"></main>
</div>
<script>
/*__BUNDLE__*/
</script>
</body>
</html>
```

- [ ] **Step 3: Write the failing test**

Create `test/build.test.js`.

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. `build.js` does not exist.

- [ ] **Step 5: Write `build.js`**

The strip is deliberately crude and that is safe here, because every module is authored to use only top-level named exports and no imports. The build asserts that assumption rather than trusting it.

```js
import { readFileSync, writeFileSync } from 'node:fs';

const MODULES = [
  'src/delimited.js',
  'src/sheetUrl.js',
  'src/records.js',
  'src/render.js',
  'src/main.js',
];

function strip(path) {
  const source = readFileSync(path, 'utf8');

  if (/^\s*import\s/m.test(source)) {
    throw new Error(`${path} uses import, which the bundler cannot inline.`);
  }
  if (/^\s*export\s+(default|\*)/m.test(source)) {
    throw new Error(`${path} uses a default or star export, which is unsupported.`);
  }

  return source.replace(/^export\s+/gm, '').trimEnd();
}

const bundle = MODULES.map(
  (path) => `// ---- ${path} ----\n${strip(path)}`,
).join('\n\n');

const template = readFileSync('src/template.html', 'utf8');

if (!template.includes('/*__BUNDLE__*/')) {
  throw new Error('src/template.html is missing the /*__BUNDLE__*/ placeholder.');
}

writeFileSync(
  'sheet-reader.html',
  template.replace('/*__BUNDLE__*/', bundle),
  'utf8',
);

console.log(`Built sheet-reader.html from ${MODULES.length} modules.`);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 68 tests total.

- [ ] **Step 7: Commit**

```bash
git add src/template.html src/main.js build.js test/build.test.js sheet-reader.html
git commit -m "feat: add page template and single-file build"
```

---

### Task 6: Wiring the three inputs

**Files:**
- Modify: `src/main.js` (replace the stub entirely)
- Test: `test/main.test.js`

**Interfaces:**
- Consumes: `parseDelimited`, `detectDelimiter`, `parseSheetUrl`, `isSheetUrl`, `csvUrl`, `InvalidSheetUrl`, `toRecords`, `filterRecords`, `renderCards`.
- Produces:
  - `classifyInput(text: string) -> 'empty' | 'url' | 'cells'`
  - `looksLikeSignInPage(text: string) -> boolean`
  - `rowsFromText(text: string) -> string[][]`
  - `messageForFetchFailure(status: number, body: string) -> string`

The pure helpers are exported so they can be tested without a browser. The event wiring is verified in Task 8 against a real browser.

- [ ] **Step 1: Write the failing tests**

Create `test/main.test.js`.

```js
import { describe, it, expect } from 'vitest';
import {
  classifyInput,
  looksLikeSignInPage,
  rowsFromText,
  messageForFetchFailure,
} from '../src/main.js';

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The named exports do not exist in `src/main.js`.

- [ ] **Step 3: Write the implementation**

Replace `src/main.js` entirely. Note the `typeof document` guard at the bottom: it lets Vitest import the pure helpers without the wiring running, and it lets the bundled file start itself in a browser.

```js
const STATE = {
  rows: [],
  records: [],
  headerRow: 0,
};

function classifyInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 'empty';
  if (isSheetUrl(trimmed)) return 'url';
  return 'cells';
}

function looksLikeSignInPage(text) {
  return /^\s*<(!doctype|html)\b/i.test(String(text ?? ''));
}

function rowsFromText(text) {
  return parseDelimited(text, detectDelimiter(text));
}

function messageForFetchFailure(status, body) {
  if (status === 404 || status === 400) {
    return 'That sheet or tab does not exist. Check the link.';
  }
  if (looksLikeSignInPage(body)) {
    return 'This sheet is not public, so it cannot be read from a link. Copy the cells and paste them instead.';
  }
  return 'Could not read that sheet. Copy the cells and paste them instead.';
}

function el(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const node = el('status');
  node.textContent = message;
  node.classList.toggle('error', Boolean(isError));
}

function populateHeaderChoices() {
  const select = el('header-row');
  select.textContent = '';
  const limit = Math.min(STATE.rows.length, 10);
  for (let i = 0; i < limit; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    const preview = (STATE.rows[i] ?? []).filter(Boolean).slice(0, 3).join(', ');
    option.textContent = `${i + 1}: ${preview.slice(0, 40) || '(empty)'}`;
    select.appendChild(option);
  }
  select.value = String(STATE.headerRow);
}

function draw() {
  const query = el('filter').value;
  const visible = filterRecords(STATE.records, query);
  renderCards(visible, el('cards'), STATE.records.length);
  el('count').textContent = STATE.records.length
    ? `${visible.length} of ${STATE.records.length} responses`
    : '';
}

function adopt(rows) {
  STATE.rows = rows;
  STATE.headerRow = Math.min(STATE.headerRow, Math.max(rows.length - 2, 0));
  STATE.records = toRecords(rows, STATE.headerRow);

  if (rows.length === 0) {
    setStatus('That does not look like spreadsheet cells. Select the cells in your sheet and copy them.', true);
    return;
  }
  if (STATE.records.length === 0) {
    setStatus('That looks like a header row with no data under it.', true);
    populateHeaderChoices();
    draw();
    return;
  }

  setStatus('');
  populateHeaderChoices();
  draw();
}

async function loadFromUrl(text) {
  const { id, gid } = parseSheetUrl(text);
  setStatus('Reading the sheet...');

  let response;
  try {
    response = await fetch(csvUrl(id, gid));
  } catch {
    setStatus('Could not reach Google. Check your connection, or paste the cells instead.', true);
    return;
  }

  const body = await response.text();

  if (!response.ok || looksLikeSignInPage(body)) {
    setStatus(messageForFetchFailure(response.status, body), true);
    return;
  }

  adopt(parseDelimited(body, ','));
}

function load() {
  const text = el('input').value;

  switch (classifyInput(text)) {
    case 'empty':
      setStatus('Paste your cells above, then press Read.', true);
      return;
    case 'url':
      try {
        loadFromUrl(text);
      } catch (error) {
        if (error instanceof InvalidSheetUrl) {
          setStatus('That does not look like a Google Sheets link.', true);
        } else {
          throw error;
        }
      }
      return;
    default:
      adopt(rowsFromText(text));
  }
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    if (looksLikeSignInPage(text)) {
      setStatus('That file is not a CSV. In your sheet use File, then Download, then Comma-separated values.', true);
      return;
    }
    el('input').value = '';
    adopt(rowsFromText(text));
  };
  reader.onerror = () => {
    setStatus('That file is not a CSV. In your sheet use File, then Download, then Comma-separated values.', true);
  };
  reader.readAsText(file);
}

function start() {
  el('load').addEventListener('click', load);

  el('input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) load();
  });

  el('filter').addEventListener('input', draw);

  el('header-row').addEventListener('change', (event) => {
    STATE.headerRow = Number(event.target.value);
    STATE.records = toRecords(STATE.rows, STATE.headerRow);
    draw();
  });

  el('clear').addEventListener('click', () => {
    STATE.rows = [];
    STATE.records = [];
    STATE.headerRow = 0;
    el('input').value = '';
    el('filter').value = '';
    el('header-row').textContent = '';
    setStatus('Cleared.');
    draw();
  });

  ['dragenter', 'dragover'].forEach((name) => {
    document.addEventListener(name, (event) => {
      event.preventDefault();
      document.body.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    document.addEventListener(name, (event) => {
      event.preventDefault();
      if (name === 'dragleave' && event.relatedTarget) return;
      document.body.classList.remove('dragging');
    });
  });

  document.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.name !== 'vitest') {
  start();
}

export { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure };
```

- [ ] **Step 4: Add the module imports for test resolution**

Vitest imports `src/main.js` directly, so it needs real imports. The build script rejects `import` statements, so they cannot stay. Resolve this by adding the imports behind a marker that `build.js` strips.

Add to the very top of `src/main.js`:

```js
/*__IMPORTS__*/
import { parseDelimited, detectDelimiter } from './delimited.js';
import { parseSheetUrl, isSheetUrl, csvUrl, InvalidSheetUrl } from './sheetUrl.js';
import { toRecords, filterRecords } from './records.js';
import { renderCards } from './render.js';
/*__END_IMPORTS__*/
```

Then update `strip()` in `build.js` to remove that block before the import check runs:

```js
function strip(path) {
  let source = readFileSync(path, 'utf8');

  source = source.replace(
    /\/\*__IMPORTS__\*\/[\s\S]*?\/\*__END_IMPORTS__\*\//,
    '',
  );

  if (/^\s*import\s/m.test(source)) {
    throw new Error(`${path} uses import, which the bundler cannot inline.`);
  }
  if (/^\s*export\s+(default|\*)/m.test(source)) {
    throw new Error(`${path} uses a default or star export, which is unsupported.`);
  }

  return source.replace(/^export\s+/gm, '').trimEnd();
}
```

Also change the final line of `src/main.js` from a re-export to inline exports, so the `export` strip leaves valid code:

```js
export const helpers = { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure };
```

and update `test/main.test.js` to import `{ helpers }` and destructure it:

```js
import { helpers } from '../src/main.js';
const { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure } = helpers;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 82 tests total.

- [ ] **Step 6: Rebuild and confirm the bundle is still clean**

Run: `npm run build && npm test`
Expected: Build prints its summary. All tests pass, including the build tests that assert no `import` or `export` survives.

- [ ] **Step 7: Commit**

```bash
git add src/main.js build.js test/main.test.js sheet-reader.html
git commit -m "feat: wire paste, drag-drop, and link inputs"
```

---

### Task 7: Persistence

**Files:**
- Modify: `src/main.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: the `STATE` object and `adopt` from Task 6.
- Produces:
  - `save(state: object, storage?: Storage) -> boolean` returning `false` when the payload is too large or storage throws
  - `restore(storage?: Storage) -> object | null`
  - `STORAGE_CAP` constant equal to `4 * 1024 * 1024`

- [ ] **Step 1: Write the failing tests**

Create `test/storage.test.js`. The fake storage classes exercise the two failure modes that actually happen: a private window where every call throws, and a payload over the cap.

```js
import { describe, it, expect } from 'vitest';
import { storage as api } from '../src/main.js';

const { save, restore, STORAGE_CAP } = api;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

function throwingStorage() {
  return {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
}

describe('save and restore', () => {
  it('round-trips state', () => {
    const store = fakeStorage();
    const state = { rows: [['a', 'b']], headerRow: 0, filter: 'x', scroll: 120 };
    expect(save(state, store)).toBe(true);
    expect(restore(store)).toEqual(state);
  });

  it('returns null when nothing is stored', () => {
    expect(restore(fakeStorage())).toBeNull();
  });

  it('returns false rather than throwing in a private window', () => {
    expect(save({ rows: [], headerRow: 0, filter: '', scroll: 0 }, throwingStorage()))
      .toBe(false);
  });

  it('returns null rather than throwing when reading fails', () => {
    expect(restore(throwingStorage())).toBeNull();
  });

  it('refuses a payload over the cap', () => {
    const huge = { rows: [[ 'x'.repeat(STORAGE_CAP + 10) ]], headerRow: 0, filter: '', scroll: 0 };
    expect(save(huge, fakeStorage())).toBe(false);
  });

  it('returns null on corrupt stored data', () => {
    const store = fakeStorage();
    store.setItem('sheet-reader:v1', 'not json');
    expect(restore(store)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. `storage` is not exported from `src/main.js`.

- [ ] **Step 3: Add the storage functions to `src/main.js`**

Insert above `function start()`:

```js
const STORAGE_KEY = 'sheet-reader:v1';
const STORAGE_CAP = 4 * 1024 * 1024;

function save(state, store = localStorage) {
  let payload;
  try {
    payload = JSON.stringify(state);
  } catch {
    return false;
  }

  if (payload.length > STORAGE_CAP) return false;

  try {
    store.setItem(STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

function restore(store = localStorage) {
  try {
    const payload = store.getItem(STORAGE_KEY);
    if (!payload) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function forget(store = localStorage) {
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do. A private window has nothing to forget.
  }
}

function persist() {
  const stored = save({
    rows: STATE.rows,
    headerRow: STATE.headerRow,
    filter: el('filter').value,
    scroll: window.scrollY,
  });

  if (!stored && STATE.rows.length > 0) {
    setStatus('This data is too large to remember between visits. It will still read fine now.');
  }
}
```

- [ ] **Step 4: Call the storage functions from the wiring**

In `adopt()`, add `persist();` as the last line of the success path, immediately after `draw();`.

In the `filter` input handler, change it to call both:

```js
  el('filter').addEventListener('input', () => {
    draw();
    persist();
  });
```

In the `header-row` change handler, add `persist();` after `draw();`.

In the `clear` handler, add `forget();` after `setStatus('Cleared.');`.

At the end of `start()`, add the restore path and the scroll saver:

```js
  const saved = restore();
  if (saved && Array.isArray(saved.rows) && saved.rows.length > 0) {
    STATE.rows = saved.rows;
    STATE.headerRow = saved.headerRow ?? 0;
    STATE.records = toRecords(STATE.rows, STATE.headerRow);
    el('filter').value = saved.filter ?? '';
    populateHeaderChoices();
    draw();
    if (saved.scroll) window.scrollTo(0, saved.scroll);
  }

  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(persist, 400);
  });
```

- [ ] **Step 5: Export the storage helpers**

Change the export line at the bottom of `src/main.js`:

```js
export const helpers = { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure };
export const storage = { save, restore, forget, STORAGE_CAP };
```

- [ ] **Step 6: Add the storage note to the template**

In `src/template.html`, immediately after the `<p id="count"></p>` line, add:

```html
    <p class="hint" style="font-size:0.8rem">
      Your data stays in this browser on this machine. Nothing is uploaded.
      Use Clear data to remove it.
    </p>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run build && npm test`
Expected: PASS, 88 tests total.

- [ ] **Step 8: Commit**

```bash
git add src/main.js src/template.html test/storage.test.js sheet-reader.html
git commit -m "feat: remember data, filter, and scroll position between visits"
```

---

### Task 8: Browser verification

Unit tests cannot prove that a file opens from `file://` and reads pleasantly. This task is the spec's verification section, executed.

**Files:**
- Create: `README.md`
- Create: `test/fixtures/sample-responses.csv`

**Interfaces:**
- Consumes: the built `sheet-reader.html`.
- Produces: evidence, and a README.

- [ ] **Step 1: Create the fixture**

Create `test/fixtures/sample-responses.csv`. It deliberately contains a quoted multi-line answer, an embedded comma, a URL, a duplicate header, a blank header with a stray value, and a right-to-left answer.

```csv
Timestamp,Name,What went well this term?,Notes,Notes,
2026-09-14 08:22,Dana Ruiz,"The cohort model finally clicked once we stopped splitting groups by grade level.

Families noticed it too, and re-enrollment went up about nine points.",first note,second note,
2026-09-14 09:01,Sam Okafor,"Attendance held steady through the December dip. Full write-up at https://example.com/report.",,,stray
2026-09-14 09:40,ليلى حسن,"كان الفصل جيدا هذا العام.",,,
```

- [ ] **Step 2: Build and open the file**

Run: `npm run build`
Then open `sheet-reader.html` from the filesystem. Use the claude-in-chrome tools and navigate to the `file://` path, or instruct the user to double-click it.

**This is the primary path. If it does not work here, nothing else matters.**

- [ ] **Step 3: Verify the drag-drop path**

Drop `test/fixtures/sample-responses.csv` onto the page.

Confirm each of these:
- Four cards render, one per response.
- Dana's long answer shows two paragraphs, not one run-on block.
- The comma inside "it too, and re-enrollment" did not split a column.
- Sam's URL is a working link.
- The two `Notes` columns read `Notes (D)` and `Notes (E)`.
- Sam's stray value appears under `Column F`.
- The Arabic answer aligns right.

- [ ] **Step 4: Verify the paste path**

Paste the same CSV text into the box and press Read. Confirm the output matches Step 3.

Then verify tab-separated input by pasting real copied cells from a Google Sheet, which is the actual primary workflow.

- [ ] **Step 5: Verify the filter**

Type `cohort` into the filter. Confirm one card remains and the counter reads `1 of 4`. Clear it and confirm all four return.

- [ ] **Step 6: Verify the header row picker**

Confirm the dropdown lists the first rows. Change it to row 2 and confirm the cards change shape. Change it back.

- [ ] **Step 7: Verify persistence**

Reload the page. Confirm the cards, the filter text, and the scroll position all come back. Press Clear data and confirm everything empties and stays empty after a reload.

- [ ] **Step 8: Verify the error messages**

Trigger each and confirm the exact wording from the spec's error table:
- Press Read with an empty box.
- Paste `hello there` and press Read.
- Paste a link to a sheet that is not shared.
- Paste a link with a nonsense sheet ID.

- [ ] **Step 9: Verify the reading experience at both widths and themes**

- Desktop width. Confirm the measure stays near 65 characters rather than spanning the window.
- Phone width, roughly 390px. Confirm a 16px gutter and no horizontal scroll.
- Light and dark mode. Confirm text contrast is comfortable in both.

- [ ] **Step 10: Write `README.md`**

```markdown
# Sheet Reader

Read long-form spreadsheet answers as text instead of squinting at a grid.

## Use it

1. Download `sheet-reader.html`.
2. Double-click it.
3. In your sheet, select the cells and copy them.
4. Paste into the page.

You can also drag a downloaded CSV onto the page, or paste a link to a
sheet that is already public.

Your data stays in your browser on your machine. Pasting and dragging make
no network request at all.

## Develop

```bash
npm install
npm test          # unit tests
npm run build     # regenerates sheet-reader.html from src/
```

Logic lives in `src/` as ES modules so it can be unit tested. `build.js`
inlines those modules into `src/template.html` to produce the single
`sheet-reader.html`, which is what people download. Rebuild and commit that
file whenever `src/` changes.

Design notes are in `docs/superpowers/specs/`.
```

- [ ] **Step 11: Commit**

```bash
git add README.md test/fixtures/sample-responses.csv
git commit -m "docs: add README and verification fixture"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: step count and privacy are properties of the architecture Task 5 establishes; the three inputs are Task 6; `parseDelimited` is Task 1; `parseSheetUrl` is Task 2; `toRecords` and `filterRecords` are Task 3; `renderCards`, `linkify`, `dir="auto"`, and the render cap are Task 4; the reading view is Task 5's stylesheet; the error table is Task 6; persistence is Task 7; browser verification is Task 8.

**Two deliberate gaps, both minor and both recorded here rather than hidden.** The spec's collapse control for values over roughly 60 lines is not implemented. The 50,000-character cell that motivates it is rare, and the feature adds interaction state to a task that is otherwise pure rendering. Add it if Task 8 shows it matters. The spec also mentions a `drop-zone` element ID, which the implementation does not need, because drag events are bound to the document and the visual cue is a `body.dragging` outline.

**Type consistency.** `Record` has the same shape in Tasks 3, 4, 6, and 7. `renderCards(records, container, total, doc)` is called with three arguments everywhere, the fourth defaulting to `document`. `STATE.headerRow` is a number in every reference, and the `select` value is coerced with `Number()` at the one place it enters.

**One known wrinkle, handled in Task 6 Step 4.** `src/main.js` must import for Vitest and must not import for the browser bundle. The marker block plus the build-time strip resolves it, and the build tests in Task 5 assert that no `import` or `export` survives into the shipped file.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-21-sheet-reader.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
