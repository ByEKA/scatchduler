import type { ImportFormat, TextEncodingName } from '@/data/types';
import { byteOrderMark } from './encoding';

// Format detection from the content (P3 core spec §5.2): the table's checks in its order, on the
// bytes after any byte-order mark. Compound files are recognized from their header and directory
// entry names only, and XML with a DOCTYPE is refused before anything parses it (§5.11).

export type Detection =
  | { kind: 'format'; format: ImportFormat; fromContent: boolean; bomLength: number }
  | { kind: 'refused'; message: string };

export const REFUSAL_MESSAGES = {
  p6Xml: 'This is a Primavera P6 XML file. In P6, export the project as XER and import that.',
  otherXml: "This XML file isn't a Microsoft Project XML file.",
  notWorkbook: "This file isn't a readable Excel workbook.",
  protectedWorkbook:
    'This workbook is protected with a password. Remove the password in Excel, save it and import it again.',
  mpp: "MPP files can't be imported. In Microsoft Project, save the file as XML and import that.",
  xls: "Older Excel workbooks (.xls) can't be imported. In Excel, save the file as .xlsx and import that.",
  database:
    'This is a database file, not a schedule export. Export the project as XER from P6 or as XML from Microsoft Project.',
  unsupported:
    "This file type can't be imported. Use a P6 XER, a Microsoft Project XML, an Excel .xlsx or a CSV file.",
} as const;

const MSPDI_NAMESPACE = 'http://schemas.microsoft.com/project';
const XML_SCAN_BYTES = 64 * 1024;
const CSV_SCAN_BYTES = 4096;
const MAX_DIRECTORY_SECTORS = 1000;
const MAX_ZIP_ENTRIES = 100_000;

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const COMPOUND_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const SQLITE_SIGNATURE = Array.from('SQLite format 3', (char) => char.charCodeAt(0));

/** The file name's extension, lower-cased and without the dot; '' when it has none. */
export function extensionOf(fileName: string): string {
  const base = fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export function formatOfExtension(extension: string): ImportFormat | null {
  switch (extension) {
    case 'xer':
      return 'xer';
    case 'xml':
      return 'mspdi';
    case 'xlsx':
      return 'xlsx';
    case 'csv':
      return 'csv';
    default:
      return null;
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** One character per byte: enough for the ASCII names and markers detection looks for. */
function byteText(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text;
}

function headText(content: Uint8Array, encoding: TextEncodingName | null): string {
  const head = content.subarray(0, XML_SCAN_BYTES);
  return encoding === 'utf-16le' || encoding === 'utf-16be'
    ? new TextDecoder(encoding).decode(head)
    : byteText(head);
}

// ---- XML ----

function endOfTag(text: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return i;
  }
  return -1;
}

/**
 * The first element after `<?…?>` declarations, comments and whitespace, with its namespace;
 * null when there is none in the text, or a DOCTYPE (or any other `<!`) comes first.
 */
function rootElement(text: string): { localName: string; namespace: string | null } | null {
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      i += 1;
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) return null;
      i = end + 2;
    } else if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) return null;
      i = end + 3;
    } else if (char === '<' && text[i + 1] !== '!') {
      const end = endOfTag(text, i + 1);
      if (end < 0) return null;
      const tag = text.slice(i + 1, end);
      const name = /^[^\s/>]+/.exec(tag)?.[0];
      if (name === undefined) return null;
      const colon = name.indexOf(':');
      const prefix = colon < 0 ? null : name.slice(0, colon);
      const localName = colon < 0 ? name : name.slice(colon + 1);
      const wanted = prefix === null ? 'xmlns' : `xmlns:${prefix}`;
      let namespace: string | null = null;
      for (const match of tag
        .slice(name.length)
        .matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (match[1] === wanted) namespace = match[2] ?? match[3] ?? null;
      }
      return { localName, namespace };
    } else {
      return null;
    }
  }
  return null;
}

/** null for Microsoft Project XML, else the refusal message. */
function xmlRefusal(text: string): string | null {
  const root = rootElement(text);
  if (root?.localName === 'Project' && root.namespace === MSPDI_NAMESPACE) return null;
  if (root?.localName === 'APIBusinessObjects') return REFUSAL_MESSAGES.p6Xml;
  return REFUSAL_MESSAGES.otherXml;
}

// ---- Zip ----

function isWorkbookPart(name: string): boolean {
  return name.replace(/\\/g, '/').replace(/^\//, '').toLowerCase() === 'xl/workbook.xml';
}

/** True when a local file header or the central directory names `xl/workbook.xml`. */
function zipHasWorkbook(bytes: Uint8Array): boolean {
  const view = viewOf(bytes);
  const fits = (offset: number, length: number) => offset >= 0 && offset + length <= bytes.length;

  // Local file headers from the start, as long as each entry's size is known.
  let offset = 0;
  for (let entry = 0; entry < MAX_ZIP_ENTRIES && fits(offset, 30); entry += 1) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (!fits(offset + 30, nameLength)) break;
    const name = byteText(bytes.subarray(offset + 30, offset + 30 + nameLength));
    if (isWorkbookPart(name)) return true;
    // A size written after the data (flag bit 3) or in a Zip64 field: the central directory decides.
    const sizeUnknown = (flags & 0x08) !== 0 && compressedSize === 0;
    if (sizeUnknown || compressedSize === 0xffffffff) break;
    offset += 30 + nameLength + extraLength + compressedSize;
  }

  // The central directory, found from the end-of-central-directory record.
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let end = bytes.length - 22; end >= lowest; end -= 1) {
    if (view.getUint32(end, true) !== 0x06054b50) continue;
    const entries = view.getUint16(end + 10, true);
    let entryOffset = view.getUint32(end + 16, true);
    for (let entry = 0; entry < entries && fits(entryOffset, 46); entry += 1) {
      if (view.getUint32(entryOffset, true) !== 0x02014b50) break;
      const nameLength = view.getUint16(entryOffset + 28, true);
      const extraLength = view.getUint16(entryOffset + 30, true);
      const commentLength = view.getUint16(entryOffset + 32, true);
      if (!fits(entryOffset + 46, nameLength)) break;
      const name = byteText(bytes.subarray(entryOffset + 46, entryOffset + 46 + nameLength));
      if (isWorkbookPart(name)) return true;
      entryOffset += 46 + nameLength + extraLength + commentLength;
    }
    break;
  }
  return false;
}

// ---- Compound files ----

const MAX_REGULAR_SECTOR = 0xfffffff9;

/**
 * The storage and stream names in a compound file's directory: the directory sector chain from
 * the header's first directory sector (offset 48), followed through the FAT sectors the header's
 * DIFAT lists (offset 76), at most 1,000 sectors. Nothing else in the file is read.
 */
function compoundEntryNames(bytes: Uint8Array): string[] {
  if (bytes.length < 512) return [];
  const view = viewOf(bytes);
  const shift = view.getUint16(30, true);
  if (shift < 7 || shift > 16) return [];
  const sectorSize = 2 ** shift;
  const fatEntriesPerSector = sectorSize / 4;
  const sectorStart = (sector: number) => (sector + 1) * sectorSize;

  const nextSector = (sector: number): number => {
    const fatIndex = Math.floor(sector / fatEntriesPerSector);
    if (fatIndex >= 109) return -1;
    const fatSector = view.getUint32(76 + 4 * fatIndex, true);
    if (fatSector > MAX_REGULAR_SECTOR) return -1;
    const offset = sectorStart(fatSector) + 4 * (sector % fatEntriesPerSector);
    return offset + 4 <= bytes.length ? view.getUint32(offset, true) : -1;
  };

  const names: string[] = [];
  const seen = new Set<number>();
  let sector = view.getUint32(48, true);
  while (sector >= 0 && sector <= MAX_REGULAR_SECTOR && !seen.has(sector)) {
    // A chain longer than the cap, or one that loops, ends here with the names read so far.
    if (seen.size >= MAX_DIRECTORY_SECTORS) break;
    seen.add(sector);
    const start = sectorStart(sector);
    const end = Math.min(start + sectorSize, bytes.length);
    for (let entry = start; entry + 128 <= end; entry += 128) {
      const type = bytes[entry + 66];
      if (type !== 1 && type !== 2) continue; // storages and streams
      const characters = Math.max(
        0,
        Math.floor(Math.min(view.getUint16(entry + 64, true), 64) / 2) - 1,
      );
      let name = '';
      for (let k = 0; k < characters; k += 1)
        name += String.fromCharCode(view.getUint16(entry + 2 * k, true));
      names.push(name);
    }
    sector = nextSector(sector);
  }
  return names;
}

function detectCompound(bytes: Uint8Array, extension: string): string {
  const names = compoundEntryNames(bytes);
  if (names.includes('EncryptionInfo')) return REFUSAL_MESSAGES.protectedWorkbook;
  if (extension === 'mpp' || names.some((name) => /^ {3}\d{3}$/.test(name))) {
    return REFUSAL_MESSAGES.mpp;
  }
  return REFUSAL_MESSAGES.xls;
}

// ---- Detection ----

export function detectFormat(bytes: Uint8Array, fileName: string): Detection {
  const extension = extensionOf(fileName);
  const named = formatOfExtension(extension);
  const bom = byteOrderMark(bytes);
  const bomLength = bom?.length ?? 0;
  const content = bytes.subarray(bomLength);
  const found = (format: ImportFormat): Detection => ({
    kind: 'format',
    format,
    fromContent: format !== named,
    bomLength,
  });
  const refused = (message: string): Detection => ({ kind: 'refused', message });

  // An empty file (or only a byte-order mark) is what its name says; FILE_EMPTY comes later.
  if (content.length === 0) {
    if (extension === 'mpp') return refused(REFUSAL_MESSAGES.mpp);
    if (extension === 'xls') return refused(REFUSAL_MESSAGES.xls);
    return named === null ? refused(REFUSAL_MESSAGES.unsupported) : found(named);
  }

  const utf16 = bom?.name === 'utf-16le' || bom?.name === 'utf-16be';
  const text = headText(content, bom?.name ?? null);
  if (text.startsWith('ERMHDR')) return found('xer');
  if (/^[ \t\r\n]*</.test(text)) {
    const refusal = xmlRefusal(text);
    return refusal === null ? found('mspdi') : refused(refusal);
  }
  if (startsWith(content, ZIP_SIGNATURE)) {
    return zipHasWorkbook(content) ? found('xlsx') : refused(REFUSAL_MESSAGES.notWorkbook);
  }
  if (startsWith(content, COMPOUND_SIGNATURE)) return refused(detectCompound(content, extension));
  if (startsWith(content, SQLITE_SIGNATURE)) return refused(REFUSAL_MESSAGES.database);
  if (extension === 'csv' && (utf16 || !content.subarray(0, CSV_SCAN_BYTES).includes(0))) {
    return found('csv');
  }
  return refused(REFUSAL_MESSAGES.unsupported);
}
