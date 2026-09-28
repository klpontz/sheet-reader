export const RENDER_CAP = 2000;
export const SHORT_VALUE_LIMIT = 32;
export const LINK_TEXT_LIMIT = 48;
export const TALL_FIELD_LINES = 14;

// Rough characters per rendered line at the reading width. Used only to
// guess height, since a DOM that has not painted cannot be measured.
const CHARS_PER_LINE = 70;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

// The href keeps the whole URL. The visible text drops the scheme and the
// query, then cuts the middle, so a document link stops filling three lines.
export function shortLinkText(url) {
  const text = url.replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
  if (text.length <= LINK_TEXT_LIMIT) return text;
  const tail = text.slice(text.lastIndexOf('/', text.length - 2)).slice(-12);
  const head = text.slice(0, LINK_TEXT_LIMIT - tail.length - 1);
  return `${head}…${tail}`;
}

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
    anchor.title = url;
    anchor.textContent = shortLinkText(url);
    anchor.rel = 'noopener noreferrer';
    anchor.target = '_blank';
    fragment.appendChild(anchor);

    cursor = match.index + url.length;
  }

  fragment.appendChild(doc.createTextNode(text.slice(cursor)));
  return fragment;
}

// A blank line starts a paragraph. A single newline is a line break inside
// one, which is how hard-wrapped email text arrives.
function paragraphsOf(value) {
  return value
    .split(/\r?\n[ \t]*\r?\n\s*/)
    .map((block) => block.split(/\r?\n/).filter((line) => line.trim()))
    .filter((lines) => lines.length > 0);
}

function renderValue(value, doc) {
  const wrapper = doc.createElement('div');
  wrapper.className = 'value';

  paragraphsOf(value).forEach((lines) => {
    const paragraph = doc.createElement('p');
    paragraph.setAttribute('dir', 'auto');
    lines.forEach((line, i) => {
      if (i > 0) paragraph.appendChild(doc.createElement('br'));
      paragraph.appendChild(linkify(line, doc));
    });
    wrapper.appendChild(paragraph);
  });

  return wrapper;
}

function isTall(value) {
  const lines = value
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
  return lines > TALL_FIELD_LINES;
}

function addToggle(group, doc) {
  group.classList.add('collapsed');

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'more';
  button.textContent = 'Show more';
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const collapsed = group.classList.toggle('collapsed');
    button.textContent = collapsed ? 'Show more' : 'Show less';
    button.setAttribute('aria-expanded', String(!collapsed));
  });
  group.appendChild(button);
}

function renderField(field, doc) {
  const group = doc.createElement('div');
  group.className = 'field';

  const label = doc.createElement('div');
  label.className = 'label';
  label.textContent = field.label;
  group.appendChild(label);

  group.appendChild(renderValue(field.value, doc));
  if (isTall(field.value)) addToggle(group, doc);
  return group;
}

// A short, single-line value is metadata — an id, a timestamp, a row number.
// Runs of them pair up into a grid so they stop burying the prose underneath.
function isShort(field) {
  return !field.value.includes('\n') && field.value.length <= SHORT_VALUE_LIMIT;
}

function appendRun(card, run, doc) {
  if (run.length === 0) return;

  // One field on its own reads better full width than alone in a grid cell.
  if (run.length === 1) {
    card.appendChild(renderField(run[0], doc));
    return;
  }

  const block = doc.createElement('div');
  block.className = 'compact';
  run.forEach((field) => block.appendChild(renderField(field, doc)));
  card.appendChild(block);
}

function renderCard(record, total, doc) {
  const card = doc.createElement('article');
  card.className = 'card';

  const position = doc.createElement('div');
  position.className = 'card-index';
  position.textContent = `Response ${record.index} of ${total}`;
  card.appendChild(position);

  let run = [];

  record.fields.forEach((field) => {
    if (isShort(field)) {
      run.push(field);
      return;
    }
    appendRun(card, run, doc);
    run = [];
    card.appendChild(renderField(field, doc));
  });

  appendRun(card, run, doc);

  return card;
}

// With no filter, repeating the total ("24 of 24") reads as an error.
export function countLabel(shown, total, query) {
  if (total === 0) return '';
  if (!query.trim()) return total === 1 ? '1 response' : `${total} responses`;
  return `${shown} of ${total} match`;
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
