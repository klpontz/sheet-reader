export function columnLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function buildLabels(header, width) {
  const raw = [];
  for (let i = 0; i < width; i += 1) {
    raw.push((header[i] ?? '').trim());
  }

  const counts = new Map();
  raw.forEach((label) => {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return raw.map((label, i) => {
    if (!label) return `Column ${columnLetter(i)}`;
    if (counts.get(label) > 1) return `${label} (${columnLetter(i)})`;
    return label;
  });
}

export function toRecords(rows, headerRowIndex = 0) {
  if (!rows || rows.length <= headerRowIndex + 1) return [];

  const header = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);

  let width = header.length;
  dataRows.forEach((row) => {
    if (row.length > width) width = row.length;
  });

  const labels = buildLabels(header, width);
  const records = [];

  dataRows.forEach((row) => {
    const fields = [];
    for (let i = 0; i < width; i += 1) {
      const value = (row[i] ?? '').trim();
      if (value) fields.push({ label: labels[i], value });
    }
    if (fields.length > 0) {
      records.push({ index: records.length + 1, fields });
    }
  });

  return records;
}

export function filterRecords(records, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return records;

  return records.filter((record) =>
    record.fields.some(
      (field) =>
        field.label.toLowerCase().includes(needle) ||
        field.value.toLowerCase().includes(needle),
    ),
  );
}
