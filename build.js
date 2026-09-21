import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const MODULES = [
  'src/delimited.js',
  'src/sheetUrl.js',
  'src/records.js',
  'src/render.js',
  'src/main.js',
];

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

export function buildBundle() {
  return MODULES.map(
    (path) => `// ---- ${path} ----\n${strip(path)}`,
  ).join('\n\n');
}

export function validateBundle(bundle) {
  try {
    // eslint-disable-next-line no-new
    new vm.Script(bundle);
  } catch (error) {
    throw new Error(
      `Built bundle is not valid JavaScript and would fail silently as a classic script: ${error.message}`,
    );
  }
}

function main() {
  const bundle = buildBundle();
  validateBundle(bundle);

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
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
