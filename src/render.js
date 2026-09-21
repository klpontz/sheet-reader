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
