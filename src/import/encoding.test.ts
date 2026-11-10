import { describe, expect, it } from 'vitest';
import { decodeText, detectEncoding, encodingIssues } from '@/import/encoding';
import { bytesOf, concatBytes } from '@/import/testing';

describe('encoding', () => {
  it('lets a byte-order mark decide', () => {
    expect(detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toMatchObject({
      name: 'utf-8',
      detectedBy: 'bom',
      bomLength: 3,
    });
    expect(detectEncoding(new Uint8Array([0xff, 0xfe, 0x41, 0]))).toMatchObject({
      name: 'utf-16le',
      detectedBy: 'bom',
      bomLength: 2,
    });
    expect(detectEncoding(new Uint8Array([0xfe, 0xff, 0, 0x41]))).toMatchObject({
      name: 'utf-16be',
      detectedBy: 'bom',
      bomLength: 2,
    });
  });

  it('reads valid UTF-8 as UTF-8', () => {
    expect(detectEncoding(bytesOf('Kazı işleri'))).toEqual({
      name: 'utf-8',
      detectedBy: 'utf8',
      bomLength: 0,
      invalidBytes: 0,
    });
    expect(encodingIssues(detectEncoding(bytesOf('Kazı')))).toEqual([]);
  });

  it('keeps mostly valid UTF-8 and counts the invalid bytes', () => {
    const bytes = concatBytes(bytesOf('ş'.repeat(100)), [0xfd]);
    expect(detectEncoding(bytes)).toMatchObject({
      name: 'utf-8',
      detectedBy: 'utf8',
      invalidBytes: 1,
    });
    expect(decodeText(bytes, 'utf-8').endsWith('�')).toBe(true);
    expect(encodingIssues(detectEncoding(bytes))).toEqual([
      expect.objectContaining({
        code: 'ENCODING_INVALID_BYTES',
        message:
          "1 bytes aren't valid UTF-8 and were replaced with �. If letters look wrong, choose another encoding.",
      }),
    ]);
  });

  it('scores Turkish letters against Windows-1252 letters, defaulting to Windows-1254', () => {
    expect(detectEncoding(new Uint8Array([0x4b, 0x61, 0x7a, 0xfd]))).toMatchObject({
      name: 'windows-1254',
      detectedBy: 'byte-score',
    });
    expect(detectEncoding(new Uint8Array([0x8e, 0x9e, 0x41]))).toMatchObject({
      name: 'windows-1252',
      detectedBy: 'byte-score',
    });
    expect(detectEncoding(new Uint8Array([0xe9, 0x41]))).toMatchObject({
      name: 'windows-1254',
      detectedBy: 'byte-score',
    });
    expect(encodingIssues(detectEncoding(new Uint8Array([0xfd])))).toEqual([
      expect.objectContaining({
        code: 'ENCODING_GUESSED',
        message:
          'Text encoding detected as Turkish (Windows-1254). If letters look wrong, choose another encoding.',
      }),
    ]);
  });

  it('decodes with the encoding the user chose', () => {
    expect(decodeText(new Uint8Array([0xdd, 0xfe]), 'windows-1254')).toBe('İş');
    expect(decodeText(new Uint8Array([0xdd, 0xfe]), 'windows-1252')).toBe('Ýþ');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), 'utf-8', 3)).toBe('A');
  });
});
