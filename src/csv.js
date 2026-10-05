// The findings as CSV, written as RFC 4180 describes it: a header line, records ended by CRLF, and a field that holds a
// comma, a double quote or a line break put in double quotes with every double quote inside written twice. One record
// per finding, in the order of the report. A field that starts with =, +, -, @, a tab or a carriage return gets a
// single quote in front, so a spreadsheet does not read a name, a path or a version from the input as a formula;
// docs/threat-model.md says why that is a help and not a guarantee.

export const CSV_COLUMNS = ['level', 'rule', 'file', 'line', 'column', 'found', 'fix'];

const FORMULA = /^[=+\-@\t\r]/;

// One field: text with a leading formula character neutralized, quoted when it must be.
export function csvField(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const record = (cells) => cells.map(csvField).join(',');

// The findings as CSV. The texts come from the report object, where safeText cleaned them.
export function toCsv(r) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const f of r.findings) rows.push(record([f.level, f.rule, f.file, f.line, f.column, f.found, f.fix]));
  return `${rows.join('\r\n')}\r\n`;
}
