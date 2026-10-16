# Sheeet Reader

De-sheetify your sheets. Live at [sheeetreader.com](https://sheeetreader.com).

Spreadsheets are great. But they are terrible for reading. When a cell holds a
paragraph, the grid truncates it, and reading a batch of form responses turns
into squinting at a row of clipped text.

Solution: one HTML file that renders each row as a readable card. Hooray!

## Use it

Go to [sheeetreader.com](https://sheeetreader.com). In your sheet, select the
cells and copy. Paste into the page.

Or run it offline: download [`sheeet-reader.html`](sheeet-reader.html) and
double-click it. No install, no sign-in, no server. Just the file.

You can also drag a downloaded CSV onto the page, or paste a link to a sheet
that is already public.

## Privacy

Pasting and dragging make no network request at all. The file has no external
references—the stylesheet and the font are embedded—so it works offline and
your data never leaves the machine. Your sheet's sharing settings never change.

The one exception is pasting a link, which fetches from Google. That path only
works on sheets that are already public, so it exposes nothing that was not
already exposed.

The page carries a Content-Security-Policy. The browser blocks every network
request except to `docs.google.com`, and runs only the exact script and styles
that the build wrote. It also sends no referrer, so Google does not learn which
site asked for the sheet.

## What it handles

Real spreadsheet exports are messy. Sheeet Reader deals with commas and line
breaks inside quoted cells, blank column headers, duplicate column names,
right-to-left text, and long unbroken strings like message IDs. Use the filter
box to narrow to matching records.

## Develop

```bash
npm install
npm test
npm run build     # regenerates sheeet-reader.html and index.html from src/
```

Logic lives in `src/` as ES modules so it can be unit tested. `build.js`
inlines those modules into `src/template.html` to produce the single
`sheeet-reader.html`, which is the file people download. It writes the same
page to `index.html`, which GitHub Pages serves at sheeetreader.com. Both are
committed, so rebuild and commit them whenever `src/` changes. The build hashes
the final script and style into the Content-Security-Policy, so never edit the
built files by hand: the browser will refuse to run them.

## License

MIT. The embedded Source Serif 4 is licensed separately under the
[SIL Open Font License](https://openfontlicense.org/).
