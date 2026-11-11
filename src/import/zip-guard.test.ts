import { deflateSync, Zip, ZipDeflate, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CFB } from 'xlsx';
import { checkZip, isOoxmlArchive } from '@/import/zip-guard';
import { bytesOf, concatBytes } from '@/import/testing';

const u16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value: number) => [...u16(value & 0xffff), ...u16(value >>> 16)];

interface Sizes {
  method: number;
  csz: number;
  usz: number;
  extra?: Uint8Array;
}

/**
 * An archive built by hand: one local header with `local`'s method and sizes, then `data`, then
 * `listed` central directory entries with `central`'s method and sizes, all pointing at it.
 */
function handmade(entry: {
  flags?: number;
  local: Sizes;
  central: Sizes;
  data: Uint8Array;
  listed?: number;
}): Uint8Array {
  const { flags = 0, local, central, data, listed = 1 } = entry;
  const name = bytesOf('xl/workbook.xml');
  const localExtra = local.extra ?? new Uint8Array(0);
  const centralExtra = central.extra ?? new Uint8Array(0);
  const header = concatBytes(
    [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(flags), ...u16(local.method), ...u32(0)],
    [...u32(0), ...u32(local.csz), ...u32(local.usz), ...u16(name.length)],
    [...u16(localExtra.length)],
    name,
    localExtra,
    data,
  );
  const record = concatBytes(
    [0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(flags), ...u16(central.method)],
    [...u32(0), ...u32(0), ...u32(central.csz), ...u32(central.usz), ...u16(name.length)],
    [...u16(centralExtra.length), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0)],
    name,
    centralExtra,
  );
  const directory = concatBytes(...Array.from({ length: listed }, () => record));
  return concatBytes(
    header,
    directory,
    [0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(listed), ...u16(listed)],
    [...u32(directory.length), ...u32(header.length), ...u16(0)],
  );
}

/** The bytes SheetJS's own zip reader holds for the handmade entries once it has read `bytes`. */
function heldBySheetJs(bytes: Uint8Array): number {
  const reader = CFB as {
    read(
      data: Uint8Array,
      options: { type: 'buffer' },
    ): {
      FileIndex: Array<{ name: string; content?: ArrayLike<number> | null }>;
    };
  };
  return reader
    .read(bytes, { type: 'buffer' })
    .FileIndex.filter((file) => file.name === 'workbook.xml')
    .reduce((total, file) => total + (file.content?.length ?? 0), 0);
}

describe('checkZip', () => {
  it('accepts an ordinary workbook archive', () => {
    expect(checkZip(zipSync({ 'xl/workbook.xml': bytesOf('<workbook/>') }))).toBe(true);
  });

  it('measures the real inflated bytes: understated sizes, ratios and archives cut short', () => {
    const bomb = zipSync({
      'xl/workbook.xml': bytesOf('<workbook/>'),
      'xl/big.xml': bytesOf('a'.repeat(2_000_000)),
    });
    expect(checkZip(bomb)).toBe(false);
    const lying = zipSync({ 'xl/workbook.xml': bytesOf('a'.repeat(5000)) }, { level: 0 });
    // Claim 10 uncompressed bytes in the local header (offset 22) and the central directory entry.
    const view = new DataView(lying.buffer);
    view.setUint32(22, 10, true);
    const central = lying.findIndex(
      (_, i) => i <= lying.length - 4 && view.getUint32(i, true) === 0x02014b50,
    );
    view.setUint32(central + 24, 10, true);
    expect(checkZip(lying, { totalBytes: 1000, entryBytes: 1000, ratio: 100 })).toBe(false);
    expect(
      checkZip(zipSync({ 'xl/workbook.xml': bytesOf('<workbook/>'.repeat(50)) }).slice(0, 40)),
    ).toBe(false);
  });

  it('refuses an archive of more than 1,000 entries (D57)', () => {
    const parts = (entries: number) =>
      Object.fromEntries(
        Array.from({ length: entries }, (_, i) => [`xl/part${i}.xml`, bytesOf('<p/>')]),
      );
    expect(checkZip(zipSync(parts(1000)))).toBe(true);
    expect(checkZip(zipSync(parts(1001)))).toBe(false);
  });

  it('reads the method and sizes from the local header, as SheetJS does', () => {
    const limits = { totalBytes: 100_000, entryBytes: 100_000, ratio: 1000 };
    const text = bytesOf('a'.repeat(200_000));
    const deflated = deflateSync(text);
    // The central directory says stored; the local header, which SheetJS reads, says deflate.
    const disguised = (csz: number) =>
      handmade({
        local: { method: 8, csz, usz: 0 },
        central: { method: 0, csz, usz: 0 },
        data: deflated,
      });
    expect(heldBySheetJs(disguised(deflated.length))).toBe(200_000);
    expect(checkZip(disguised(deflated.length), limits)).toBe(false);
    expect(heldBySheetJs(disguised(10))).toBe(200_000);
    expect(checkZip(disguised(10), limits)).toBe(false);
    // SheetJS inflates the stream whatever size is stated, 0 too.
    const unsized = handmade({
      local: { method: 8, csz: 0, usz: 0 },
      central: { method: 8, csz: 0, usz: 0 },
      data: deflated,
    });
    expect(heldBySheetJs(unsized)).toBe(200_000);
    expect(checkZip(unsized, limits)).toBe(false);
    // SheetJS sizes its buffer from the local uncompressed size.
    const small = deflateSync(bytesOf('a'.repeat(50_000)));
    const declared = handmade({
      local: { method: 8, csz: small.length, usz: 150_000 },
      central: { method: 8, csz: small.length, usz: 150_000 },
      data: small,
    });
    expect(heldBySheetJs(declared)).toBe(150_000);
    expect(checkZip(declared, limits)).toBe(false);
    expect(checkZip(declared, { totalBytes: 150_000, entryBytes: 150_000, ratio: 10_000 })).toBe(
      true,
    );
  });

  it('accepts sizes that follow the data in descriptors, as streaming writers put them', () => {
    const parts: Uint8Array[] = [];
    const archive = new Zip((error, chunk) => {
      if (error) throw error;
      parts.push(chunk);
    });
    const entry = new ZipDeflate('xl/workbook.xml');
    archive.add(entry);
    const text = Array.from({ length: 1000 }, (_, row) => `<row r="${row * 7919}"/>`).join('');
    entry.push(bytesOf(text), true);
    archive.end();
    const streamed = concatBytes(...parts);
    expect(heldBySheetJs(streamed)).toBe(text.length);
    expect(checkZip(streamed)).toBe(true);
  });

  it('counts the stored bytes SheetJS slices for every central entry that lists them', () => {
    const limits = { totalBytes: 12_000, entryBytes: 6_000, ratio: 100 };
    // Data descriptor flag, then a signed descriptor whose sizes match the central directory:
    // SheetJS slices the local header's 5,000 bytes and only warns.
    const descriptor = [0x50, 0x4b, 0x07, 0x08, ...u32(0), ...u32(10), ...u32(10)];
    const listing = (listed: number, local: Sizes) =>
      handmade({
        flags: 8,
        local,
        central: { method: 0, csz: 10, usz: 10 },
        data: concatBytes(bytesOf('a'.repeat(5_000)), descriptor),
        listed,
      });
    const stored = { method: 0, csz: 5_000, usz: 5_000 };
    expect(heldBySheetJs(listing(3, stored))).toBe(15_000);
    expect(checkZip(listing(3, stored), limits)).toBe(false);
    expect(checkZip(listing(2, stored), limits)).toBe(true);
    // A Zip64 field in the local header gives the size SheetJS slices.
    const zip64 = { method: 0, csz: 10, usz: 10, extra: Uint8Array.from(zip64Field(5_000)) };
    expect(heldBySheetJs(listing(3, zip64))).toBe(15_000);
    expect(checkZip(listing(3, zip64), limits)).toBe(false);
  });
});

/** A Zip64 extended information field giving both sizes as `size`. */
function zip64Field(size: number): number[] {
  return [...u16(1), ...u16(16), ...u32(size), ...u32(0), ...u32(size), ...u32(0)];
}

/** The paths SheetJS's own zip reader (CFB) files the entries of `bytes` under. */
function sheetJsPaths(bytes: Uint8Array): string[] {
  const reader = CFB as {
    read(data: Uint8Array, options: { type: 'buffer' }): { FullPaths: string[] };
  };
  return reader.read(bytes, { type: 'buffer' }).FullPaths;
}

/** The offset of the first central directory record of an archive fflate wrote (no comment). */
function centralDirectory(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(bytes.length - 22 + 16, true);
}

/** `archive` behind `prefix`, with the central directory's offsets moved to match. */
function prefixed(prefix: Uint8Array, archive: Uint8Array): Uint8Array {
  const bytes = concatBytes(prefix, archive);
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  let central = view.getUint32(end + 16, true) + prefix.length;
  view.setUint32(end + 16, central, true);
  for (let entry = 0; entry < view.getUint16(end + 10, true); entry += 1) {
    view.setUint32(central + 42, view.getUint32(central + 42, true) + prefix.length, true);
    central +=
      46 +
      view.getUint16(central + 28, true) +
      view.getUint16(central + 30, true) +
      view.getUint16(central + 32, true);
  }
  return bytes;
}

describe('isOoxmlArchive', () => {
  const ooxml = {
    '[Content_Types].xml': bytesOf('<Types/>'),
    'xl/workbook.xml': bytesOf('<workbook/>'),
  };

  it('accepts an archive SheetJS reads as an OOXML package', () => {
    expect(isOoxmlArchive(zipSync(ooxml))).toBe(true);
    // SheetJS compares names lower-cased and drops a leading slash.
    expect(
      isOoxmlArchive(
        zipSync({
          '/[CONTENT_TYPES].XML': bytesOf('<Types/>'),
          'xl/workbook.xml': bytesOf('<w/>'),
        }),
      ),
    ).toBe(true);
  });

  // Each of these sends SheetJS to another reader, which the guard and sheetRows don't bound.
  it.each([
    ['lacks [Content_Types].xml', { 'xl/workbook.xml': bytesOf('<workbook/>') }],
    [
      'names META-INF/manifest.xml (OpenDocument)',
      { ...ooxml, 'META-INF/manifest.xml': bytesOf('<m/>') },
    ],
    ['names objectdata.xml (UOF)', { ...ooxml, 'objectdata.xml': bytesOf('<o/>') }],
    ['names Index/Document.iwa (Numbers)', { ...ooxml, 'Index/Document.iwa': bytesOf('iwa') }],
    ['holds an entry named index.zip', { ...ooxml, 'docs/INDEX.ZIP': bytesOf('PK') }],
    ['names them in another case', { ...ooxml, 'meta-inf/MANIFEST.XML': bytesOf('<m/>') }],
    ['names them with backslashes', { ...ooxml, 'Index\\Document.iwa': bytesOf('iwa') }],
    ['names them with a leading slash', { ...ooxml, '/ObjectData.xml': bytesOf('<o/>') }],
    ['names index.zip as a folder', { ...ooxml, 'docs/Index.zip/': new Uint8Array(0) }],
  ])('refuses an archive that %s', (_, entries) => {
    expect(isOoxmlArchive(zipSync(entries))).toBe(false);
  });

  it('takes the names from the local headers, as SheetJS does', () => {
    const bytes = zipSync({ ...ooxml, 'objectdata.xml': bytesOf('<o/>') });
    // Rename the third central directory entry (same length); its local header keeps the name.
    const view = new DataView(bytes.buffer);
    let record = centralDirectory(bytes);
    for (let entry = 0; entry < 2; entry += 1) record += 46 + view.getUint16(record + 28, true);
    bytes.set(bytesOf('xl/abcdefg.xml'), record + 46);
    expect(sheetJsPaths(bytes)).toContain('Root Entry/objectdata.xml');
    expect(isOoxmlArchive(bytes)).toBe(false);
  });

  it('refuses bytes SheetJS would not open as a zip archive', () => {
    // Behind a byte-order mark, SheetJS reads the bytes as text; the guard alone accepts them.
    const bytes = prefixed(new Uint8Array([0xef, 0xbb, 0xbf]), zipSync(ooxml));
    expect(checkZip(bytes)).toBe(true);
    expect(isOoxmlArchive(bytes)).toBe(false);
  });
});
