/*__IMPORTS__*/
import { parseDelimited, detectDelimiter } from './delimited.js';
import { parseSheetUrl, isSheetUrl, csvUrl, InvalidSheetUrl } from './sheetUrl.js';
import { toRecords, filterRecords } from './records.js';
import { renderCards } from './render.js';
/*__END_IMPORTS__*/

const STATE = {
  rows: [],
  records: [],
  headerRow: 0,
};

function classifyInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 'empty';
  if (isSheetUrl(trimmed)) return 'url';
  return 'cells';
}

function looksLikeSignInPage(text) {
  return /^\s*<(!doctype|html)\b/i.test(String(text ?? ''));
}

function rowsFromText(text) {
  return parseDelimited(text, detectDelimiter(text));
}

function messageForFetchFailure(status, body) {
  if (status === 404 || status === 400) {
    return 'That sheet or tab does not exist. Check the link.';
  }
  if (looksLikeSignInPage(body)) {
    return 'This sheet is not public, so it cannot be read from a link. Copy the cells and paste them instead.';
  }
  return 'Could not read that sheet. Copy the cells and paste them instead.';
}

function el(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const node = el('status');
  node.textContent = message;
  node.classList.toggle('error', Boolean(isError));
}

function populateHeaderChoices() {
  const select = el('header-row');
  select.textContent = '';
  const limit = Math.min(STATE.rows.length, 10);
  for (let i = 0; i < limit; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    const preview = (STATE.rows[i] ?? []).filter(Boolean).slice(0, 3).join(', ');
    option.textContent = `${i + 1}: ${preview.slice(0, 40) || '(empty)'}`;
    select.appendChild(option);
  }
  select.value = String(STATE.headerRow);
}

function draw() {
  const query = el('filter').value;
  const visible = filterRecords(STATE.records, query);
  renderCards(visible, el('cards'), STATE.records.length);
  el('count').textContent = STATE.records.length
    ? `${visible.length} of ${STATE.records.length} responses`
    : '';
}

function adopt(rows) {
  STATE.rows = rows;
  STATE.headerRow = Math.min(STATE.headerRow, Math.max(rows.length - 2, 0));
  STATE.records = toRecords(rows, STATE.headerRow);

  if (rows.length === 0) {
    setStatus('That does not look like spreadsheet cells. Select the cells in your sheet and copy them.', true);
    return;
  }
  if (STATE.records.length === 0) {
    setStatus('That looks like a header row with no data under it.', true);
    populateHeaderChoices();
    draw();
    return;
  }

  setStatus('');
  populateHeaderChoices();
  draw();
  persist();
}

async function loadFromUrl(text) {
  const { id, gid } = parseSheetUrl(text);
  setStatus('Reading the sheet...');

  let response;
  try {
    response = await fetch(csvUrl(id, gid));
  } catch {
    setStatus('Could not reach Google. Check your connection, or paste the cells instead.', true);
    return;
  }

  const body = await response.text();

  if (!response.ok || looksLikeSignInPage(body)) {
    setStatus(messageForFetchFailure(response.status, body), true);
    return;
  }

  adopt(parseDelimited(body, ','));
}

function load() {
  const text = el('input').value;

  switch (classifyInput(text)) {
    case 'empty':
      setStatus('Paste your cells above, then press Read.', true);
      return;
    case 'url':
      loadFromUrl(text).catch((error) => {
        if (error instanceof InvalidSheetUrl) {
          setStatus('That does not look like a Google Sheets link.', true);
        } else {
          setStatus('Could not reach Google. Check your connection, or paste the cells instead.', true);
        }
      });
      return;
    default:
      adopt(rowsFromText(text));
  }
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    if (looksLikeSignInPage(text)) {
      setStatus('That file is not a CSV. In your sheet use File, then Download, then Comma-separated values.', true);
      return;
    }
    el('input').value = '';
    adopt(rowsFromText(text));
  };
  reader.onerror = () => {
    setStatus('That file is not a CSV. In your sheet use File, then Download, then Comma-separated values.', true);
  };
  reader.readAsText(file);
}

const STORAGE_KEY = 'sheet-reader:v1';
const STORAGE_CAP = 4 * 1024 * 1024;

function save(state, store = localStorage) {
  let payload;
  try {
    payload = JSON.stringify(state);
  } catch {
    return false;
  }

  if (payload.length > STORAGE_CAP) return false;

  try {
    store.setItem(STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

function restore(store = localStorage) {
  try {
    const payload = store.getItem(STORAGE_KEY);
    if (!payload) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function forget(store = localStorage) {
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do. A private window has nothing to forget.
  }
}

function persist() {
  const stored = save({
    rows: STATE.rows,
    headerRow: STATE.headerRow,
    filter: el('filter').value,
    scroll: window.scrollY,
  });

  if (!stored && STATE.rows.length > 0) {
    setStatus('This data is too large to remember between visits. It will still read fine now.');
  }
}

function start() {
  el('load').addEventListener('click', load);

  el('input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) load();
  });

  el('filter').addEventListener('input', () => {
    draw();
    persist();
  });

  el('header-row').addEventListener('change', (event) => {
    STATE.headerRow = Number(event.target.value);
    STATE.records = toRecords(STATE.rows, STATE.headerRow);
    draw();
    persist();
  });

  el('clear').addEventListener('click', () => {
    STATE.rows = [];
    STATE.records = [];
    STATE.headerRow = 0;
    el('input').value = '';
    el('filter').value = '';
    el('header-row').textContent = '';
    setStatus('Cleared.');
    forget();
    draw();
  });

  ['dragenter', 'dragover'].forEach((name) => {
    document.addEventListener(name, (event) => {
      event.preventDefault();
      document.body.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    document.addEventListener(name, (event) => {
      event.preventDefault();
      if (name === 'dragleave' && event.relatedTarget) return;
      document.body.classList.remove('dragging');
    });
  });

  document.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });

  const saved = restore();
  if (saved && Array.isArray(saved.rows) && saved.rows.length > 0) {
    STATE.rows = saved.rows;
    STATE.headerRow = saved.headerRow ?? 0;
    STATE.records = toRecords(STATE.rows, STATE.headerRow);
    el('filter').value = saved.filter ?? '';
    populateHeaderChoices();
    draw();
    if (saved.scroll) window.scrollTo(0, saved.scroll);
  }

  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(persist, 400);
  });
}

if (typeof document !== 'undefined' && document.getElementById('load')) start();

export const helpers = { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure };
export const storage = { save, restore, forget, STORAGE_CAP };
