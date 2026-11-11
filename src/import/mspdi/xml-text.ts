import { parseMspdiDate } from '../dates';
import type { WallClock } from '../model';

// Text values of Microsoft Project XML (P3 core spec §5.6). fast-xml-parser runs with entity
// processing off, so values arrive as written: decodeXmlText decodes the five predefined entities
// and character references, and the readers below convert values explicitly. `NA` is an empty
// value wherever a value that isn't free text is read (valueText, D52); names, notes and codes
// keep the text as written.

const REFERENCE = /&(?:(amp|lt|gt|quot|apos)|#([0-9]+)|#[xX]([0-9a-fA-F]+));/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const REPLACEMENT = '�';

/**
 * The five entities and decimal and hex character references decoded; a reference to U+0000, a
 * surrogate or a code point above U+10FFFF becomes U+FFFD and is listed as written. Other
 * ampersands stay as they are.
 */
export function decodeXmlText(text: string): { text: string; badCharacters: string[] } {
  const badCharacters: string[] = [];
  if (!text.includes('&')) return { text, badCharacters };
  const decoded = text.replace(
    REFERENCE,
    (
      reference,
      entity: string | undefined,
      decimal: string | undefined,
      hex: string | undefined,
    ) => {
      if (entity !== undefined) return ENTITIES[entity] ?? reference;
      const codePoint = decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? '', 16);
      const valid =
        Number.isSafeInteger(codePoint) &&
        codePoint > 0 &&
        codePoint <= 0x10ffff &&
        (codePoint < 0xd800 || codePoint > 0xdfff);
      if (valid) return String.fromCodePoint(codePoint);
      badCharacters.push(reference);
      return REPLACEMENT;
    },
  );
  return { text: decoded, badCharacters };
}

// ---- Parsed XML ----

/** An element parsed by fast-xml-parser: its children by name. */
export type XmlNode = Record<string, unknown>;

export function isXmlNode(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The child `key` of `node`, when `node` is an element that has one. */
export function childOf(node: unknown, key: string): unknown {
  return isXmlNode(node) && Object.hasOwn(node, key) ? node[key] : undefined;
}

/** A child that may be written once or repeated, as a list. */
export function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

/** The text of the child `key`, as written (trimmed by the parser); null when absent or empty. */
export function rawText(node: unknown, key: string): string | null {
  let value = childOf(node, key);
  if (Array.isArray(value)) value = value[0];
  if (isXmlNode(value)) value = value['#text'];
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/** A decoded value and the bad references it held, as written. */
export interface DecodedText {
  text: string;
  badCharacters: readonly string[];
}

/** The decoded text of the child `key`, trimmed; null when absent or empty. `NA` stays as written. */
export function decodedText(node: unknown, key: string): DecodedText | null {
  const raw = rawText(node, key);
  if (raw === null) return null;
  const decoded = decodeXmlText(raw);
  const text = decoded.text.trim();
  return text === '' ? null : { text, badCharacters: decoded.badCharacters };
}

/** decodedText of a value that isn't free text: null also for `NA` (D52). */
export function decodedValue(node: unknown, key: string): DecodedText | null {
  const decoded = decodedText(node, key);
  return decoded === null || /^na$/i.test(decoded.text) ? null : decoded;
}

/**
 * The decoded text of a value that isn't free text: a number, a date, a flag, a type or a
 * reference to a calendar. Null when absent, empty or `NA` (D52); bad characters aren't reported.
 */
export function valueText(node: unknown, key: string): string | null {
  return decodedValue(node, key)?.text ?? null;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A number; null when absent, empty, `NA` or not a number. */
export function readNumber(node: unknown, key: string): number | null {
  const text = valueText(node, key);
  if (text === null || !NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A boolean written `1`/`0` or `true`/`false` (D58); null otherwise. */
export function readBoolean(node: unknown, key: string): boolean | null {
  const text = valueText(node, key)?.toLowerCase();
  if (text === '1' || text === 'true') return true;
  if (text === '0' || text === 'false') return false;
  return null;
}

const ZONED_DATE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * A date `yyyy-MM-ddTHH:mm:ss` as wall-clock text. Fractional seconds and a zone (`Z`, `±hh:mm`)
 * are dropped and the time is read as written; `dropped` says so (D52). `NA`, empty or invalid
 * text is null.
 */
export function readDate(
  node: unknown,
  key: string,
): { value: WallClock | null; dropped: boolean } {
  const text = valueText(node, key);
  if (text === null) return { value: null, dropped: false };
  const match = ZONED_DATE.exec(text);
  const parsed = parseMspdiDate(match?.[1] ?? text);
  if (parsed === null || parsed === 'invalid') return { value: null, dropped: false };
  return { value: parsed, dropped: match?.[2] !== undefined || match?.[3] !== undefined };
}
