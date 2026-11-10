// Numbers in CSV and xlsx text cells (P3 core spec §5.4): the decimal separator is guessed per file
// and confirmed in the Columns step; the other separator is grouping and is removed; a % sign,
// written before (Turkish, "%50") or after the number, is dropped.

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** `null` for an empty cell, `NaN` for one that isn't a number. */
export function parseNumber(text: string, decimal: ',' | '.'): number | null {
  let value = text.trim();
  if (value === '') return null;
  value = value.replace(/^%\s*|\s*%$/g, '');
  const grouping = decimal === ',' ? '.' : ',';
  value = value.split(grouping).join('');
  if (decimal === ',') value = value.replace(',', '.');
  return NUMBER.test(value) ? Number(value) : NaN;
}

/** Each sample's last ',' or '.' votes; ',' wins only with more votes than '.'. */
export function guessDecimalSeparator(samples: readonly string[]): ',' | '.' {
  let commas = 0;
  let periods = 0;
  for (const sample of samples) {
    const comma = sample.lastIndexOf(',');
    const period = sample.lastIndexOf('.');
    if (comma < 0 && period < 0) continue;
    if (comma > period) commas += 1;
    else periods += 1;
  }
  return commas > periods ? ',' : '.';
}
