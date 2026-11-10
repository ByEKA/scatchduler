// Test-only helpers: byte builders and small generated files for the parser's tests.
import { strToU8, zipSync } from 'fflate';

/** The UTF-8 bytes of `text`. */
export function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function concatBytes(...parts: Array<Uint8Array | number[]>): Uint8Array {
  const arrays = parts.map((part) => (Array.isArray(part) ? Uint8Array.from(part) : part));
  const result = new Uint8Array(arrays.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of arrays) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** A zip archive holding `entries` (text is written as UTF-8). */
export function zip(entries: Record<string, string | Uint8Array>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) {
    files[name] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(files);
}

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
const FAT_SECTOR = 0xfffffffd;

/**
 * A minimal compound file (version 3, 512-byte sectors) of 1,536 bytes: the header, sector 0 the
 * FAT and sector 1 the directory, holding "Root Entry" and one stream entry per name (at most 3).
 */
export function compoundFile(names: string[]): Uint8Array {
  if (names.length > 3) throw new Error('compoundFile holds at most 3 names');
  const bytes = new Uint8Array(1536);
  const view = new DataView(bytes.buffer);

  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  view.setUint16(24, 0x3e, true); // minor version
  view.setUint16(26, 3, true); // major version
  view.setUint16(28, 0xfffe, true); // byte order
  view.setUint16(30, 9, true); // sector shift: 512-byte sectors
  view.setUint16(32, 6, true); // mini sector shift
  view.setUint32(44, 1, true); // FAT sectors
  view.setUint32(48, 1, true); // first directory sector
  view.setUint32(56, 4096, true); // mini stream cutoff
  view.setUint32(60, END_OF_CHAIN, true); // first mini FAT sector
  view.setUint32(68, END_OF_CHAIN, true); // first DIFAT sector
  view.setUint32(76, 0, true); // DIFAT[0]: the FAT is sector 0
  for (let offset = 80; offset < 512; offset += 4) view.setUint32(offset, FREE_SECTOR, true);

  // Sector 0: the FAT.
  view.setUint32(512, FAT_SECTOR, true);
  view.setUint32(516, END_OF_CHAIN, true);
  for (let offset = 520; offset < 1024; offset += 4) view.setUint32(offset, FREE_SECTOR, true);

  // Sector 1: the directory.
  const entries: Array<[string, number]> = [
    ['Root Entry', 5],
    ...names.map((name): [string, number] => [name, 2]),
  ];
  entries.forEach(([name, type], index) => {
    const entry = 1024 + index * 128;
    for (let k = 0; k < name.length; k += 1)
      view.setUint16(entry + 2 * k, name.charCodeAt(k), true);
    view.setUint16(entry + 64, (name.length + 1) * 2, true);
    bytes[entry + 66] = type;
  });
  return bytes;
}
