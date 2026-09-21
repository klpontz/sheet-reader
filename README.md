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
