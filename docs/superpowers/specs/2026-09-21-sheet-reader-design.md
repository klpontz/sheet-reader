# Sheet Reader — Design

Date: 2026-09-21
Status: Approved for planning
Supersedes: the OAuth and Picker design of the same date. See Revision history.

## Problem

Google Sheets organize data well. They read badly. When a cell holds a
paragraph, the grid truncates it. Reading a batch of long-form Google Form
responses in a spreadsheet is slow and unpleasant.

## Goal

The fewest possible steps between "I have a sheet of responses" and "I am
reading them comfortably." This goal outranks every other consideration in
this document.

The thing this app competes with is opening the sheet and squinting. That
costs two steps. Any design that costs more than a few steps loses to
squinting and should not be built.

## Solution

One HTML file. Double-click it. Paste your cells into it. Read.

No install. No sign-in. No Google Cloud console. No server. No config file.
No dependencies. No network request, unless the user pastes a link.

## Step count

First use:

1. Download `sheet-reader.html`.
2. Double-click it.
3. In the sheet: select the cells, copy.
4. Paste into the page.
5. Read.

Steady state is two steps: copy, paste.

## Privacy

Pasted and dragged data never leaves the machine. The app makes no network
request on those paths. The sheet's sharing settings never change, so form
responses containing personal names stay private.

This is a stronger privacy position than an authenticated design, which would
route the same data through Google's API.

The one exception is the pasted-link path, which fetches from Google. That
path only works on sheets that are already public, so it exposes nothing that
was not already exposed. The interface says so plainly.

## Scope

In scope:

- Paste cells as delimited text.
- Drag a downloaded CSV or TSV file onto the page.
- Paste a Google Sheets link, for sheets that are already public.
- Render each row as a card.
- Filter cards by typing.
- Choose which row holds the headers.

Out of scope for this version:

- Reading private sheets over the network. See "Later, not now."
- Grouping answers by column instead of by row. This is the next thing to
  build, ahead of everything else. It is a transpose of data the app already
  holds.
- Editing, writing, or commenting.
- Multiple tabs at once. A copy or a CSV export covers one tab, and the user
  chooses that tab in Sheets, where they already are.

## Architecture

One built file, `sheet-reader.html`, containing all markup, styles, and
script. It opens from `file://`.

The `file://` requirement drives a real constraint: ES module imports are
blocked from `file://` origins. So the shipped file inlines everything in a
single classic script tag.

Development does not suffer for it. Logic lives in separate ES modules that
unit tests import directly. A short build script inlines those modules into
the template to produce the shipped file. The build serves the developer. The
user never sees it.

### Files

```
sheet-reader.html     Built artifact. The thing you double-click. Committed.
build.js              Inlines src modules into the template.
src/template.html     Markup and styles, with one placeholder for script.
src/delimited.js      parseDelimited
src/sheetUrl.js       parseSheetUrl
src/records.js        toRecords, filterRecords
src/render.js         renderCards, linkify
src/main.js           Wiring and event handlers.
test/*.test.js        Unit tests.
```

`sheet-reader.html` is committed, not generated on demand, so that downloading
one file from the repo is genuinely all it takes.

### Data flow

Three inputs converge on one shape before rendering. The reading view does not
know or care where the data came from.

```
paste cells  ─┐
drag file    ─┼─> text ─> parseDelimited ─> string[][] ─┐
              │                                          │
paste link   ─┴─> parseSheetUrl ─> fetch CSV ─> text ────┘
                                                         │
                     string[][] ─> toRecords ─> Record[] ─> renderCards ─> DOM
                                                    │
                                          filterRecords (on keystroke)
```

`Record` is `{ index: number, fields: Array<{label: string, value: string}> }`.

### Input detection

One text box accepts all three pasted inputs. A URL is trivially
distinguishable from spreadsheet cells, so this costs no extra interface.

- Input matching a Google Sheets URL, after trimming, takes the link path.
- Anything else is treated as delimited text.
- A dropped file is read as text and treated as delimited text.

Delimiter is detected, not assumed. Clipboard content from Google Sheets is
tab-separated. A downloaded export is comma-separated. The detector counts
unquoted tabs and unquoted commas in the first line and picks the winner.
A tie, or neither, means one column.

## Units

Each unit does one thing. Each is testable on its own.

### parseDelimited(text, delimiter) -> string[][]

An RFC 4180 style parser, parameterized by delimiter.

This unit carries the real risk. Paragraph answers contain commas, tabs,
double quotes, and literal newlines inside quoted fields. A naive split
destroys exactly the data this app exists to show. Google quotes multi-line
cells on copy, so quoted newlines arrive on the paste path too, not only on
the file path.

Rules:

- A field wrapped in double quotes may contain the delimiter, newlines, and
  escaped double quotes written as `""`.
- A row ends at an unquoted `\n`, `\r\n`, or lone `\r`.
- A trailing newline at end of input does not create an empty final row.
- Unbalanced quotes at end of input close the field rather than throwing.

Google's output is not strictly RFC 4180. Tests use captured real Google
output, not hand-written RFC examples.

### parseSheetUrl(input) -> {id, gid}

- Extracts the ID from `/spreadsheets/d/{ID}/`.
- Extracts `gid` from `#gid=N` or `?gid=N`. Defaults to `"0"`.
- Throws `InvalidSheetUrl` on anything else.

### toRecords(rows, headerRowIndex) -> Record[]

- The row at `headerRowIndex` supplies the labels. Default 0.
- Every later row becomes one record. Rows above are ignored.
- A cell that is empty or whitespace-only is dropped from its record.
- A record whose cells are all empty is dropped.
- A row shorter than the header is padded with empty cells.
- A row longer than the header keeps the extras.
- **A blank label whose column holds a value is labeled with its spreadsheet
  column letter, for example `Column H`.** This rule is not decoration. The
  gviz endpoint pads every row out to the full grid width, so a six-column
  sheet can arrive with twenty-two columns and sixteen blank labels. A single
  note typed off to the side of a sheet lands in one of them.
- **Duplicate labels are disambiguated by appending the column letter**, for
  example `Your name (C)`. Google Forms sections routinely repeat identical
  question text, and two identical labels with different answers are
  unreadable.

### filterRecords(records, query) -> Record[]

Case-insensitive substring match against every label and value in a record.
Empty query returns everything. Roughly fifteen lines.

This is not deferred, despite being a feature. At two hundred responses it is
the difference between a usable app and a scroll bar.

### renderCards(records, container)

- One card per record.
- Each field renders a label and a value.
- Values are inserted as text nodes, never as HTML.
- Newlines inside a value become separate paragraphs.
- Runs matching `https?://` become links, built by appending an anchor element
  to a text node. Never by assigning `innerHTML`. Form responses are full of
  portfolio and document links, and dead link text is a real loss.
- Every value element carries `dir="auto"`, so answers in Arabic or Hebrew
  align correctly.
- Above 2,000 records the app renders the first 2,000 and says so. There is no
  virtualization. Ten thousand rows of twenty fields is several hundred
  thousand DOM nodes and would hang the tab.

## Reading view

- One centered column. Measure of roughly 65 characters.
- Serif body text. Generous line height.
- Field labels small, uppercase, letter-spaced, low contrast.
- Cards separated by whitespace and a hairline rule, not heavy borders.
- Light and dark mode, following the system setting.
- Readable on a phone. A 16px side gutter. No horizontal scroll.
- A record counter. While filtering it reads `12 of 200`.
- A value taller than roughly 60 lines collapses with an expand control. The
  Sheets per-cell ceiling is 50,000 characters, so one card can otherwise run
  for pages.

## Error handling

Every failure states what happened and what to do next.

| Condition | Detection | Message |
|---|---|---|
| Pasted text has one row | `rows.length < 2` after parse | That looks like a header row with no data under it. |
| Pasted text is not tabular | No delimiter found, one column, one row | That does not look like spreadsheet cells. Select the cells in your sheet and copy them. |
| Unparseable URL | `parseSheetUrl` throws | That does not look like a Google Sheets link. |
| Sheet not public | Response is HTML and status is 200 | This sheet is not public, so it cannot be read from a link. Copy the cells and paste them instead. |
| Sheet or tab missing | Status 404, or 400 from gviz | That sheet or tab does not exist. Check the link. |
| Network failure | `fetch` rejects | Could not reach Google. Check your connection, or paste the cells instead. |
| File is not text | Read fails or content is binary | That file is not a CSV. In your sheet use File, then Download, then Comma-separated values. |

The HTML-with-status-200 check matters. Google answers an unauthorized CSV
request with a sign-in page and a success status. Without the check, the
parser turns a login page into gibberish cards. A missing sheet is
distinguished from an unshared one, so the user is not sent to change sharing
settings that are not the problem.

## Persistence

`localStorage` holds the parsed records, the header row choice, the filter
query, and the scroll position, so closing and reopening the file resumes
where the reader left off. Reading two hundred responses is not one sitting.

- A visible "Clear data" control empties it. The interface states that the
  data is stored in the browser on this machine.
- If the dataset exceeds roughly 4 MB it is not stored, and the app says so
  rather than failing silently.
- Every read and write is wrapped in `try`/`catch`, because storage throws in
  private windows.

## Testing

Test-driven. Tests come before implementation.

Unit tested with Vitest, because the pure functions carry the real risk:

- `parseDelimited`: quoted delimiters, quoted newlines, escaped quotes,
  `\r\n`, lone `\r`, trailing newline, empty fields, one column, unbalanced
  quotes, and captured real Google clipboard and export output.
- `parseSheetUrl`: edit URLs, `#gid`, `?gid`, bare IDs, garbage.
- `toRecords`: ragged rows, blank labels, duplicate labels, all-empty rows,
  a header row that is not row 0, gviz width padding.
- `filterRecords`: case insensitivity, no match, empty query.
- `linkify`: a bare URL, a URL in a sentence, trailing punctuation, text that
  contains angle brackets, and text that looks like HTML.

Browser verified, because the reading view cannot be unit tested into
existence:

- Opened from `file://` by double-clicking. This is the primary path and is
  verified first.
- All three inputs against a real sheet of long-form responses.
- Every error condition in the table above.
- Desktop and phone widths. Light and dark mode.
- Reload resumes position.

## Risks

**The pasted-link path is the only genuine unknown.** The gviz CSV endpoint is
undocumented. Its CORS behavior was verified empirically on 2026-09-21 and its
width padding was observed directly. Its header and type-coercion semantics
are not documented and may change without notice.

This risk is contained by design. The link path is a convenience for sheets
that are already public. If Google breaks it, paste and drag still work, and
those are the paths the app is built around.

There is no risk in the paste and drag paths. They are a file read and a
string parse.

## Later, not now

If live reading of private sheets is ever wanted, the answer is **not** to ask
each user to create a Google Cloud project. That was the previous design and
it cost twenty-five steps.

The answer is a hosted build at a fixed origin, shipping one pre-registered
OAuth client ID, using the `drive.file` scope with the Google Picker. The user
clicks a link, clicks "Choose a sheet", and picks it. Four steps, no setup.

`drive.file` is a non-sensitive scope, so it avoids OAuth verification review
and the hundred-user cap. It also grants access only to the file the user
picked, never the whole account. The hosting, the privacy policy page, the
published consent screen, and the referrer-restricted API key are all
one-time costs borne once, by whoever ships it, rather than by every user.

That is a separate piece of work with its own design.

## Revision history

**2026-09-21, superseded design.** The first version of this spec required
each user to create a Google Cloud project, enable two APIs, configure an
OAuth consent screen in testing mode, add themselves as a test user, create a
client ID and an API key, write a local config file, and run a web server on
localhost. Twenty-five steps to first read, fourteen of them in a cloud
console. An adversarial review counted them against the stated goal and the
design failed.

Three specific errors in that version are worth recording so they are not
repeated:

1. It named `drive.file` with the Sheets API as the main technical risk and
   budgeted a probe to test it. It is documented behavior. The risk was never
   real, and the genuinely undocumented endpoint was rated a footnote.
2. It claimed both credentials were origin-restricted. An API key is not
   restricted unless a referrer restriction is added, which its setup steps
   omitted.
3. It described the properties of a published non-sensitive app while
   instructing the reader to build a testing-mode one. Testing mode shows an
   unverified-app warning and expires authorization every seven days.
