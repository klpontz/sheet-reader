# Sheet Reader — Design

Date: 2026-09-21
Status: Approved for planning

## Problem

Google Sheets organize data well. They read badly. When a cell holds a
paragraph, the grid truncates it. Reading a batch of long-form Google Form
responses in a spreadsheet is slow and unpleasant.

## Solution

A web app that reads a Google Sheet and renders each row as a readable text
block. One record per card. Typography tuned for reading prose, not for
scanning numbers.

## Scope

In scope:

- Read one sheet tab at a time.
- Render rows as cards.
- Two ways to supply a sheet: Google Picker, or a pasted link.
- Run on localhost.

Out of scope for this version:

- Search or filter.
- Grouping answers by column instead of by row.
- Editing, writing, or commenting.
- Public hosting and OAuth verification. These come later as separate work.

## Architecture

A static single-page app. No backend. No server-side secrets.

Three reasons this works:

1. The no-auth path uses the Google visualization CSV endpoint. It returns
   `access-control-allow-origin` matching the request origin. Verified by
   direct request on 2026-09-21.
2. The authenticated path uses Google Identity Services. The token client
   runs in the browser and returns an access token without a backend.
3. All rendering is client-side.

### Files

```
index.html          Markup and styles.
src/main.js         Wiring. Event handlers. No logic worth testing.
src/sheetUrl.js     parseSheetUrl
src/csv.js          parseCsv
src/records.js      toRecords
src/render.js       renderCards
src/googleAuth.js   Token client and Picker.
src/fetchCsv.js     No-auth CSV fetch.
src/fetchApi.js     Authenticated Sheets API fetch.
test/*.test.js      Unit tests.
```

### Data flow

Both ingest paths converge on the same shape before rendering. This keeps the
reading view ignorant of how the data arrived.

```
Picker path:   pick file -> fileId -> Sheets API -> string[][] ->
Paste path:    paste URL -> parseSheetUrl -> CSV endpoint -> parseCsv -> string[][] ->

  -> toRecords -> Record[] -> renderCards -> DOM
```

`Record` is `{ index: number, fields: Array<{label: string, value: string}> }`.

## Units

Each unit does one thing. Each is testable on its own.

### parseSheetUrl(input) -> {id, gid}

Accepts a full Google Sheets URL or a bare sheet ID.

- Extracts the ID from `/spreadsheets/d/{ID}/`.
- Extracts `gid` from either `#gid=N` or `?gid=N`.
- Defaults `gid` to `"0"` when absent.
- Throws `InvalidSheetUrl` on anything else.

### parseCsv(text) -> string[][]

An RFC 4180 parser. This unit matters more than its size suggests. Paragraph
answers contain commas, double quotes, and literal newlines inside quoted
fields. A naive split on commas destroys exactly the data this app exists to
show.

Rules:

- A field wrapped in double quotes may contain commas, newlines, and escaped
  double quotes written as `""`.
- Rows end at an unquoted `\n`. A `\r\n` ends a row the same way.
- A trailing newline at end of input does not create an empty final row.

### toRecords(rows) -> Record[]

- Row 0 supplies the field labels.
- Every later row becomes one record.
- A cell that is empty or whitespace-only is dropped from that record.
- A record whose cells are all empty is dropped entirely.
- A row with fewer cells than the header is padded with empty cells.
- A row with more cells than the header keeps the extras. Each extra takes
  the label `Column N`, where N is the one-based cell position.
- A duplicate header label is kept as written. Labels are not made unique.

### renderCards(records, container)

- One card per record.
- Each field renders a label and a value.
- The label is small, uppercase, and low contrast.
- The value is body text.
- Newlines inside a value become separate paragraphs.
- Values are inserted as text, never as HTML.

## Ingest paths

### Picker path (primary)

Scope: `https://www.googleapis.com/auth/drive.file`.

This scope grants access only to files the user selects in the Google Picker.
It is a non-sensitive scope. An app using only this scope can be shared
publicly without OAuth verification. The app can never read a sheet the user
did not explicitly choose.

Flow: click "Choose a sheet" -> Google Identity Services issues a token ->
Picker opens -> user selects a sheet -> app calls the Sheets API for that
file ID.

The app reads tab names with `spreadsheets.get` and cell values with
`spreadsheets.values.get`. When a sheet has more than one tab, the app shows a
tab selector.

### Paste path (fallback)

No authentication. For sheets that are published to the web or set to
anyone-with-link-can-view.

The app fetches:

```
https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&gid={GID}
```

This path exists because it needs no setup at all. It is the fastest way to
read a sheet that is already shared.

## Error handling

Every failure states what happened and what to do next. No raw stack traces.

| Condition | Detection | Message |
|---|---|---|
| Unparseable URL | `parseSheetUrl` throws | That does not look like a Google Sheets link. |
| Sheet not shared | Response body is HTML, not CSV | This sheet is not shared. Either set it to anyone-with-link-can-view, or use Choose a sheet to sign in. |
| Sheet has no rows | `rows.length < 2` | This sheet has a header row but no data. |
| Sheet is empty | `rows.length === 0` | This sheet is empty. |
| Token expired | API returns 401 | Session expired. Choose a sheet again. |
| Network failure | `fetch` rejects | Could not reach Google. Check your connection. |

The HTML-not-CSV check is the important one. Google answers an unauthorized
CSV request with a sign-in page and a 200 status. Without this check the
parser would happily turn a login page into gibberish cards.

## Reading view

- One centered column. Measure of roughly 65 characters.
- Serif body text. Generous line height.
- Field labels small, uppercase, letter-spaced, low contrast.
- Cards separated by whitespace and a hairline rule, not heavy borders.
- Light and dark mode, following the system setting.
- Readable on a phone. A 16px side gutter. No horizontal scroll.
- A record counter so the reader knows where they are.

## Persistence

`localStorage` holds the last pasted URL and the last selected tab. Every read
and write is wrapped in `try`/`catch`, because storage throws in private
windows.

## Testing

Test-driven. Tests come before implementation.

Unit tested with Vitest, because the pure functions carry the real risk:

- `parseSheetUrl`: edit URLs, `#gid`, `?gid`, bare IDs, garbage input.
- `parseCsv`: quoted commas, quoted newlines, escaped quotes, `\r\n`,
  trailing newline, empty fields, a single-column file.
- `toRecords`: ragged rows, empty cells, all-empty rows, duplicate headers.

Browser verified, because the reading view cannot be unit tested into
existence:

- Both ingest paths against a real sheet.
- Every error condition in the table above.
- Desktop and phone widths.
- Light and dark mode.

## Risks

**The main risk is the Picker path.** The design assumes `drive.file` grants
the Sheets API access to a picker-selected file. Confidence is moderate, not
high. Google documents per-file access for this scope, but the interaction
between `drive.file` and the Sheets API specifically must be confirmed.

Mitigation: the first implementation step is a throwaway probe that proves the
call works before any other Picker code is written. If it fails, the fallback
is the Drive API `files.export` endpoint with `mimeType=text/csv`, which is
known to work with `drive.file`. That fallback exports only the first tab, so
multi-tab support would be lost on the Picker path. The paste path is
unaffected either way.

**Secondary risk:** the CSV endpoint is undocumented. It has been stable for
many years, but Google could change it. The Picker path does not depend on it.

## Setup required from the user

One time, in the Google Cloud console:

1. Create a project.
2. Enable the Google Sheets API and the Google Picker API.
3. Configure the OAuth consent screen. External. Testing mode.
4. Add the user as a test user.
5. Create an OAuth client ID of type Web application.
6. Add `http://localhost:8000` as an authorized JavaScript origin.
7. Create an API key for the Picker.

The client ID and API key go in a local config file that is git-ignored.
Neither is a secret in the usual sense. Both are origin-restricted.
