# Sheet Reader

Spreadsheets are great. But they are terrible for reading. When a cell holds a
paragraph, the grid truncates it, and reading a batch of form responses turns
into squinting at a row of clipped text.

Solution: one HTML file that renders each row as a readable card. Hooray!

## Use it

1. Download [`sheet-reader.html`](sheet-reader.html).
2. Double-click it.
3. In your sheet, select the cells and copy.
4. Paste into the page.

No install, no sign-in, no server, no build step. Just the file.

You can also drag a downloaded CSV onto the page, or paste a link to a sheet
that is already public.

## Privacy

Pasting and dragging make no network request at all. The file has no external
references—the stylesheet and the font are embedded—so it works offline and
your data never leaves the machine. Your sheet's sharing settings never change.

The one exception is pasting a link, which fetches from Google. That path only
works on sheets that are already public, so it exposes nothing that was not
already exposed.

## What it handles

Real spreadsheet exports are messy. Sheet Reader deals with commas and line
breaks inside quoted cells, blank column headers, duplicate column names,
right-to-left text, and long unbroken strings like message IDs. Use the filter
box to narrow to matching records.

## Develop

```bash
npm install
npm test          # 110 unit tests
npm run build     # regenerates sheet-reader.html from src/
```

Logic lives in `src/` as ES modules so it can be unit tested. `build.js`
inlines those modules into `src/template.html` to produce the single
`sheet-reader.html`, which is the file people download. It is committed, so
rebuild and commit it whenever `src/` changes.

## License

MIT. The embedded Source Serif 4 is licensed separately under the
[SIL Open Font License](https://openfontlicense.org/).
