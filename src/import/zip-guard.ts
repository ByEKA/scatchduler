import { Inflate } from 'fflate';

// The xlsx archive guard (P3 core spec §5.10, §5.11, D57). Before SheetJS reads a workbook, every
// entry it will inflate is inflated here through fflate in small chunks: the real inflated bytes
// are counted and discarded, and the archive is refused past a limit, when it ends early, when an
// entry can't be inflated, or when its central directory lists more than 1,000 entries.
//
// The guard reads the archive the way SheetJS does: the entries are the ones the central
// directory lists, found from the last end-of-central-directory record in the file, and each
// entry's flags, compression method and sizes come from its local header, with a Zip64 field's
// sizes replacing the 32-bit ones as SheetJS applies them. A stored entry counts the bytes SheetJS
// slices; a deflated one the bytes its stream inflates to, and at least the local uncompressed
// size, which SheetJS allocates. A walk over the local headers instead could miss an entry the
// central directory points into the middle of another one, and the central directory's own
// method and sizes are not what SheetJS reads.
//
// The guard measures what SheetJS's OOXML reader inflates; `isOoxmlArchive` keeps SheetJS on that
// reader. Before it looks for [Content_Types].xml, SheetJS reads an archive naming
// META-INF/manifest.xml or objectdata.xml as OpenDocument (whose repeated rows ignore sheetRows)
// and one naming Index/Document.iwa as Numbers (Snappy streams the guard never sees); without
// [Content_Types].xml it reads a nested Index.zip, unmeasured, as a file of its own.

export interface ZipLimits {
  totalBytes: number; // every entry, inflated
  entryBytes: number; // any one entry, inflated
  ratio: number; // inflated bytes per compressed byte, per entry
  entries?: number; // central directory entries (D57); 1,000 when left out
}

const MB = 1024 * 1024;
const MAX_ENTRIES = 1000;

export const ZIP_LIMITS: ZipLimits = {
  totalBytes: 200 * MB,
  entryBytes: 100 * MB,
  ratio: 100,
  entries: MAX_ENTRIES,
};

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_FIELD = 0x0001;
// Encryption flags (encrypted, strong encryption, masked headers): SheetJS refuses them.
const ENCRYPTED = 0x2041;
const STORED = 0;
const DEFLATED = 8;
// Compressed bytes per push: a chunk inflates to at most about 1,032 times its size, so a limit
// is noticed before much memory is used.
const CHUNK = 4096;
// SheetJS's root folder: an entry's path is this plus its name (CFB's cfb_add).
const ROOT = 'Root Entry/';
// Parts that send SheetJS to the OpenDocument, UOF and Numbers readers.
const OTHER_FORMAT_PARTS = ['META-INF/manifest.xml', 'objectdata.xml', 'Index/Document.iwa'];

/** True when the archive can be inflated within `limits`; never throws. */
export function checkZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): boolean {
  try {
    return measure(bytes, limits);
  } catch {
    return false;
  }
}

/**
 * True when SheetJS reads the bytes as an OOXML package, the only reader the guard measures and
 * sheetRows bounds: a zip archive whose entries, under the names their local headers give, hold
 * [Content_Types].xml, none of OTHER_FORMAT_PARTS and nothing named index.zip. Names compare as
 * SheetJS compares them. Never throws.
 */
export function isOoxmlArchive(bytes: Uint8Array): boolean {
  try {
    if (!ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)) return false;
    const entries = directory(bytes, 0xffff); // any count; checkZip applies D57's cap
    if (entries === null) return false;
    const paths: string[] = [];
    for (const { local } of entries) {
      const nameLength = bytes[local + 26]! + bytes[local + 27]! * 0x100;
      if (local + 30 + nameLength > bytes.length) return false;
      // One character per byte, as SheetJS reads the name; its path drops the first '//'.
      const name = String.fromCharCode(...bytes.subarray(local + 30, local + 30 + nameLength));
      paths.push(name.startsWith(ROOT) ? name : (ROOT + name).replace('//', '/'));
    }
    return (
      hasPart(paths, '[Content_Types].xml') &&
      !OTHER_FORMAT_PARTS.some((part) => hasPart(paths, part)) &&
      !paths.some(isIndexZip)
    );
  } catch {
    return false;
  }
}

/** SheetJS's safegetzipfile: lower-cased, the part's slashes all '/' or all '\'. */
function hasPart(paths: readonly string[], part: string): boolean {
  const backslashed = part.toLowerCase().replace(/\//g, '\\');
  const slashed = backslashed.replace(/\\/g, '/');
  return paths.some((path) => {
    const name = path.slice(ROOT.length).toLowerCase();
    return name === backslashed || name === slashed;
  });
}

/** SheetJS's CFB.find(zip, 'Index.zip'): the last path segment, upper-cased, without NULs. */
function isIndexZip(path: string): boolean {
  const segments = path.toUpperCase().split('/');
  const last = segments[segments.length - (path.endsWith('/') ? 2 : 1)] ?? '';
  return last.replace(/\0/g, '') === 'INDEX.ZIP';
}

interface DirectoryEntry {
  central: number; // the central directory record
  local: number; // the local header it points at
}

/**
 * The entries the central directory lists, as SheetJS finds them: from the last
 * end-of-central-directory signature in the file. Null when the directory or a local header it
 * points at can't be read, or it lists more than `maxEntries`.
 */
function directory(bytes: Uint8Array, maxEntries: number): DirectoryEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (offset: number, length: number) => offset >= 0 && offset + length <= bytes.length;
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);

  let end = bytes.length - 4;
  while (end >= 0 && u32(end) !== END_OF_CENTRAL_DIRECTORY) end -= 1;
  if (end < 0 || !fits(end, 22)) return null;
  const count = u16(end + 8);
  if (count !== u16(end + 10) || count > maxEntries) return null;

  const found: DirectoryEntry[] = [];
  let central = u32(end + 16);
  for (let entry = 0; entry < count; entry += 1) {
    if (!fits(central, 46) || u32(central) !== CENTRAL_HEADER) return null;
    const nameLength = u16(central + 28);
    const extraLength = u16(central + 30);
    const local = u32(central + 42);
    if (!fits(central + 46, nameLength + extraLength)) return null;
    if (!fits(local, 30) || u32(local) !== LOCAL_HEADER) return null;
    found.push({ central, local });
    central += 46 + nameLength + extraLength + u16(central + 32);
  }
  return found;
}

function measure(bytes: Uint8Array, limits: ZipLimits): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (offset: number, length: number) => offset >= 0 && offset + length <= bytes.length;
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);

  const entries = directory(bytes, limits.entries ?? MAX_ENTRIES);
  if (entries === null) return false;
  let total = 0;
  for (const { central, local } of entries) {
    const centralZip64 = zip64Sizes(bytes, central + 46 + u16(central + 28), u16(central + 30));
    // The compressed size the deflate stream must end within.
    const compressed = centralZip64.compressed || u32(central + 20);

    const flags = u16(local + 6);
    const method = u16(local + 8);
    const localNameLength = u16(local + 26);
    const localExtraLength = u16(local + 28);
    let localCompressed = u32(local + 18);
    let localInflated = u32(local + 22);
    // As SheetJS: with a local extra field, its Zip64 sizes and then the central one's replace
    // the 32-bit sizes.
    if (localExtraLength > 0) {
      const localZip64 = zip64Sizes(bytes, local + 30 + localNameLength, localExtraLength);
      localCompressed = centralZip64.compressed || localZip64.compressed || localCompressed;
      localInflated = centralZip64.inflated || localZip64.inflated || localInflated;
    }
    const dataStart = local + 30 + localNameLength + localExtraLength;
    if ((flags & ENCRYPTED) !== 0 || !fits(dataStart, 0)) return false;

    const limit = Math.min(limits.entryBytes, limits.totalBytes - total);
    let held: number | null = null;
    if (method === STORED) {
      // SheetJS keeps the local compressed size's bytes from the data start.
      if (fits(dataStart, localCompressed) && localCompressed <= limit) held = localCompressed;
    } else if (method === DEFLATED && fits(dataStart, compressed) && localInflated <= limit) {
      // SheetJS inflates the stream from the data start to its end, into a buffer of the local
      // uncompressed size when that isn't 0. A stream that doesn't end within the central
      // compressed size is refused.
      const inflated = inflatedBytes(
        bytes.subarray(dataStart, dataStart + compressed),
        Math.min(limit, limits.ratio * compressed),
      );
      if (inflated !== null) held = Math.max(inflated, localInflated);
    }
    if (held === null) return false;
    total += held;
  }
  return true;
}

/**
 * The sizes in an extra field's Zip64 record (usz, then csz), read as SheetJS reads them: the
 * last such record wins, bytes past the field read as 0, and 0 means no size.
 */
function zip64Sizes(
  bytes: Uint8Array,
  start: number,
  length: number,
): { compressed: number; inflated: number } {
  const field = bytes.subarray(start, Math.min(start + length, bytes.length));
  const byte = (offset: number) => field[offset] ?? 0;
  const u16 = (offset: number) => byte(offset) + byte(offset + 1) * 0x100;
  const u32 = (offset: number) => u16(offset) + u16(offset + 2) * 0x10000;
  const u64 = (offset: number) => u32(offset) + u32(offset + 4) * 2 ** 32;
  let sizes = { compressed: 0, inflated: 0 };
  for (let offset = 0; offset + 4 <= field.length; offset += 4 + u16(offset + 2)) {
    if (u16(offset) === ZIP64_FIELD) {
      sizes = { inflated: u64(offset + 4), compressed: u64(offset + 12) };
    }
  }
  return sizes;
}

/**
 * The bytes a deflate stream inflates to, counted chunk by chunk and discarded; null past `limit`
 * and for a stream that ends early or can't be inflated. No bytes is no stream: fflate would
 * accept it, while SheetJS inflates whatever follows.
 */
function inflatedBytes(data: Uint8Array, limit: number): number | null {
  if (data.length === 0) return null;
  let inflated = 0;
  const inflate = new Inflate((chunk) => {
    inflated += chunk.length;
    // Stops the push at once; the catch below turns it into a refusal.
    if (inflated > limit) throw new RangeError('Inflated past the limit');
  });
  try {
    for (let offset = 0; offset < data.length; offset += CHUNK) {
      inflate.push(data.subarray(offset, offset + CHUNK), offset + CHUNK >= data.length);
    }
  } catch {
    return null;
  }
  return inflated;
}
