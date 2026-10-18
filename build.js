import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
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

const OUTPUTS = ['sheeet-reader.html', 'index.html'];

function sha256(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

function only(html, pattern, name) {
  const matches = [...html.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${name} block, found ${matches.length}.`);
  }
  return matches[0][1];
}

// The Content-Security-Policy allows only the exact inline script and style
// that this build writes. Hash them last, after every other substitution.
export function stampPolicy(html) {
  const script = only(html, /<script>([\s\S]*?)<\/script>/g, '<script>');
  const style = only(html, /<style>([\s\S]*?)<\/style>/g, '<style>');

  return html
    .replace('__SCRIPT_HASH__', sha256(script))
    .replace('__STYLE_HASH__', sha256(style));
}

function main() {
  const bundle = buildBundle();
  validateBundle(bundle);

  const template = readFileSync('src/template.html', 'utf8');

  for (const marker of ['/*__BUNDLE__*/', '<!--__LOGO__-->', '__FAVICON__', '__SCRIPT_HASH__', '__STYLE_HASH__']) {
    if (!template.includes(marker)) {
      throw new Error(`src/template.html is missing the ${marker} placeholder.`);
    }
  }

  const logo = readFileSync('src/logo.svg', 'utf8').trim();
  const faviconSvg = readFileSync('src/favicon.svg', 'utf8').trim();
  const favicon = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;
  const inlineLogo = logo.replace('<svg ', '<svg class="logo" aria-hidden="true" ');

  const html = stampPolicy(
    template
      .replace('__FAVICON__', favicon)
      .replace('<!--__LOGO__-->', inlineLogo)
      .replace('/*__BUNDLE__*/', () => bundle),
  );

  for (const path of OUTPUTS) writeFileSync(path, html, 'utf8');

  console.log(`Built ${OUTPUTS.join(' and ')} from ${MODULES.length} modules.`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
