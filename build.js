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
