export class InvalidSheetUrl extends Error {}

const ID_IN_URL = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const BARE_ID = /^[a-zA-Z0-9-_]{20,}$/;
const GID = /[#?&]gid=([0-9]+)/;
const WHOLE_URL = /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\S*$/;

export function parseSheetUrl(input) {
  const text = String(input ?? '').trim();

  let id;
  const match = text.match(ID_IN_URL);
  if (match) {
    id = match[1];
  } else if (BARE_ID.test(text)) {
    id = text;
  } else {
    throw new InvalidSheetUrl('That does not look like a Google Sheets link.');
  }

  const gidMatch = text.match(GID);
  return { id, gid: gidMatch ? gidMatch[1] : '0' };
}

export function isSheetUrl(text) {
  return WHOLE_URL.test(String(text ?? '').trim());
}

export function csvUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}
