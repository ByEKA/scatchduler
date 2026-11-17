/** A plain decimal number with `.` or `,` as its decimal mark (P3 core spec §6.5). */
const PLAIN_DECIMAL = /^-?\d+(?:[.,]\d+)?$/;
/** A plain decimal number written with a decimal point. */
const POINT_DECIMAL = /^-?\d+\.\d+$/;

/**
 * The coordinate typed in a Latitude or Longitude field, in decimal degrees: `null` for an empty
 * field, `NaN` for anything that isn't a plain decimal number (no exponents, signs other than a
 * leading `-`, or thousands separators).
 */
export function parseCoordinate(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!PLAIN_DECIMAL.test(trimmed)) return Number.NaN;
  return Number(trimmed.replace(',', '.'));
}

/** How many digits follow the decimal mark of a coordinate as typed; 0 without one. */
export function coordinateDecimals(text: string): number {
  return /[.,](\d+)$/.exec(text.trim())?.[1]?.length ?? 0;
}

/** The two parts when there are exactly two and `isNumber` accepts both, trimmed. */
function pairOf(parts: string[], isNumber: (part: string) => boolean): [string, string] | null {
  if (parts.length !== 2) return null;
  const first = parts[0]?.trim() ?? '';
  const second = parts[1]?.trim() ?? '';
  return isNumber(first) && isNumber(second) ? [first, second] : null;
}

const isPlainDecimal = (part: string) => PLAIN_DECIMAL.test(part);
const isPointDecimal = (part: string) => POINT_DECIMAL.test(part);

/**
 * A latitude and longitude pasted together, as maps and spreadsheets copy them: two numbers split
 * by `;`, by whitespace or by a comma and a space, or by a bare `,` when both numbers use `.` as
 * their decimal mark. A single number such as `41,0151` gives `null`.
 */
export function splitCoordinatePair(text: string): [string, string] | null {
  const trimmed = text.trim();
  return (
    pairOf(trimmed.split(/\s*;\s*/), isPlainDecimal) ??
    pairOf(trimmed.split(/\s*,\s+/), isPlainDecimal) ??
    pairOf(trimmed.split(/\s+/), isPlainDecimal) ??
    pairOf(trimmed.split(','), isPointDecimal)
  );
}
