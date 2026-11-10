import type { ImportIssue, TextEncodingName } from '@/data/types';
import { makeIssue } from './issues';

// Text encoding of XER and CSV files (P3 core spec §5.4). A byte-order mark decides and can't be
// overridden. Otherwise valid UTF-8 is UTF-8; mostly valid UTF-8 (at least one valid multi-byte
// sequence and at least 99 % of the bytes above 0x7F in valid sequences) is UTF-8 with the rest
// replaced by U+FFFD; anything else is a single-byte page chosen by scoring letters, Windows-1254
// unless Windows-1252's own letters are more frequent. Windows-1254 also reads ISO-8859-9.

export interface DetectedEncoding {
  name: TextEncodingName;
  detectedBy: 'bom' | 'utf8' | 'byte-score';
  bomLength: number;
  invalidBytes: number;
}

export const ENCODING_LABELS: Record<TextEncodingName, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'windows-1254': 'Turkish (Windows-1254)',
  'windows-1252': 'Western European (Windows-1252)',
};

/** The byte-order mark at the start of `bytes`, if any. */
export function byteOrderMark(
  bytes: Uint8Array,
): { name: TextEncodingName; length: number } | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { name: 'utf-8', length: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { name: 'utf-16le', length: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { name: 'utf-16be', length: 2 };
  return null;
}

/**
 * Walks the bytes the way the Encoding Standard's UTF-8 decoder does and counts the bytes above
 * 0x7F, the valid multi-byte sequences and the bytes they hold.
 */
function scanUtf8(bytes: Uint8Array, start: number) {
  let highBytes = 0;
  let sequences = 0;
  let sequenceBytes = 0;
  let i = start;
  while (i < bytes.length) {
    const lead = bytes[i] ?? 0;
    if (lead < 0x80) {
      i += 1;
      continue;
    }
    let needed = 0;
    let lower = 0x80;
    let upper = 0xbf;
    if (lead >= 0xc2 && lead <= 0xdf) needed = 1;
    else if (lead >= 0xe0 && lead <= 0xef) {
      needed = 2;
      if (lead === 0xe0) lower = 0xa0;
      if (lead === 0xed) upper = 0x9f;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      needed = 3;
      if (lead === 0xf0) lower = 0x90;
      if (lead === 0xf4) upper = 0x8f;
    }
    let valid = needed > 0;
    for (let k = 1; valid && k <= needed; k += 1) {
      const next = bytes[i + k];
      const [min, max] = k === 1 ? [lower, upper] : [0x80, 0xbf];
      if (next === undefined || next < min || next > max) valid = false;
    }
    if (valid) {
      highBytes += needed + 1;
      sequences += 1;
      sequenceBytes += needed + 1;
      i += needed + 1;
    } else {
      // Bytes after a broken lead are read again on their own, as the decoder does.
      highBytes += 1;
      i += 1;
    }
  }
  return { highBytes, sequences, invalidBytes: highBytes - sequenceBytes };
}

// +1 for Ğ İ Ş ğ ı ş in Windows-1254, -1 for Ž ž, which only Windows-1252 has.
const LETTER_SCORE = new Int8Array(256);
for (const byte of [0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe]) LETTER_SCORE[byte] = 1;
for (const byte of [0x8e, 0x9e]) LETTER_SCORE[byte] = -1;

export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  const bom = byteOrderMark(bytes);
  if (bom) {
    const invalidBytes = bom.name === 'utf-8' ? scanUtf8(bytes, bom.length).invalidBytes : 0;
    return { name: bom.name, detectedBy: 'bom', bomLength: bom.length, invalidBytes };
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { name: 'utf-8', detectedBy: 'utf8', bomLength: 0, invalidBytes: 0 };
  } catch {
    // Not valid UTF-8 throughout: see whether it is mostly valid.
  }
  const scan = scanUtf8(bytes, 0);
  if (scan.sequences > 0 && scan.highBytes - scan.invalidBytes >= 0.99 * scan.highBytes) {
    return { name: 'utf-8', detectedBy: 'utf8', bomLength: 0, invalidBytes: scan.invalidBytes };
  }
  let turkish = 0;
  let western = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const score = LETTER_SCORE[bytes[i] ?? 0] ?? 0;
    if (score > 0) turkish += 1;
    else if (score < 0) western += 1;
  }
  const name = western > turkish ? 'windows-1252' : 'windows-1254';
  return { name, detectedBy: 'byte-score', bomLength: 0, invalidBytes: 0 };
}

/** Decodes without failing: invalid bytes become U+FFFD. The first `bomLength` bytes are skipped. */
export function decodeText(bytes: Uint8Array, encoding: TextEncodingName, bomLength = 0): string {
  return new TextDecoder(encoding).decode(bytes.subarray(bomLength));
}

/** ENCODING_GUESSED for a scored single-byte page, ENCODING_INVALID_BYTES for replaced bytes. */
export function encodingIssues(detected: DetectedEncoding): ImportIssue[] {
  if (detected.detectedBy === 'byte-score') {
    return [makeIssue('ENCODING_GUESSED', { encoding: ENCODING_LABELS[detected.name] })];
  }
  if (detected.invalidBytes > 0) {
    return [makeIssue('ENCODING_INVALID_BYTES', { n: detected.invalidBytes })];
  }
  return [];
}
