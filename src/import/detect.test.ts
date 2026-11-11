import { describe, expect, it } from 'vitest';
import { detectFormat } from '@/import/detect';
import { bytesOf, compoundFile, concatBytes, zip } from '@/import/testing';

const UNSUPPORTED =
  "This file type can't be imported. Use a P6 XER, a Microsoft Project XML, an Excel .xlsx or a CSV file.";
const NOT_MSPDI = "This XML file isn't a Microsoft Project XML file.";
const MPP =
  "MPP files can't be imported. In Microsoft Project, save the file as XML and import that.";

describe('detectFormat', () => {
  it.each([
    ['ERMHDR\t20.12\t2026-11-01', 'plan.xer', 'xer', false],
    ['ERMHDR\t20.12', 'plan.csv', 'xer', true],
    [
      '<?xml version="1.0"?>\n<!-- x --><Project xmlns="http://schemas.microsoft.com/project"><Name>A</Name></Project>',
      'plan.xml',
      'mspdi',
      false,
    ],
    ['<Project xmlns="http://schemas.microsoft.com/project"/>', 'plan.xer', 'mspdi', true],
    ['Kod;Ad\nA1;Kazı', 'list.csv', 'csv', false],
  ])('reads %j named %s as %s', (content, name, format, fromContent) => {
    expect(detectFormat(bytesOf(content), name)).toMatchObject({
      kind: 'format',
      format,
      fromContent,
    });
  });

  it('reads a workbook archive as xlsx, skips a byte-order mark and takes an empty file by its extension', () => {
    expect(
      detectFormat(
        zip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' }),
        'plan.xlsx',
      ),
    ).toMatchObject({ kind: 'format', format: 'xlsx', fromContent: false });
    expect(
      detectFormat(concatBytes([0xef, 0xbb, 0xbf], bytesOf('ERMHDR\t20.12')), 'p.xer'),
    ).toMatchObject({ kind: 'format', format: 'xer', bomLength: 3 });
    expect(detectFormat(new Uint8Array(), 'empty.xer')).toMatchObject({
      kind: 'format',
      format: 'xer',
      fromContent: false,
    });
  });

  it('reads a Project root in no namespace as MSPDI when it holds tasks or calendars (D52)', () => {
    expect(
      detectFormat(
        bytesOf(
          '<?xml version="1.0"?>\n<Project><Name>A</Name><Tasks><Task><UID>1</UID></Task></Tasks></Project>',
        ),
        'plan.xml',
      ),
    ).toMatchObject({ kind: 'format', format: 'mspdi', fromContent: false, noNamespace: true });
    expect(detectFormat(bytesOf('<Project><Calendars/></Project>'), 'plan.xml')).toMatchObject({
      kind: 'format',
      format: 'mspdi',
      noNamespace: true,
    });
    expect(
      detectFormat(
        bytesOf('<Project xmlns="http://schemas.microsoft.com/project"><Tasks/></Project>'),
        'plan.xml',
      ),
    ).toMatchObject({ kind: 'format', format: 'mspdi', noNamespace: false });
    expect(detectFormat(bytesOf('<Project><Name>A</Name></Project>'), 'plan.xml')).toEqual({
      kind: 'refused',
      message: NOT_MSPDI,
    });
    expect(
      detectFormat(bytesOf('<Project xmlns="urn:other"><Tasks/></Project>'), 'plan.xml'),
    ).toEqual({ kind: 'refused', message: NOT_MSPDI });
  });

  it('refuses what it cannot import, each with its message', () => {
    const refused = (bytes: Uint8Array, name: string) => detectFormat(bytes, name);
    expect(refused(bytesOf('<?xml version="1.0"?><APIBusinessObjects/>'), 'p6.xml')).toEqual({
      kind: 'refused',
      message: 'This is a Primavera P6 XML file. In P6, export the project as XER and import that.',
    });
    expect(refused(bytesOf('<?xml version="1.0"?><Workbook/>'), 'x.xml')).toEqual({
      kind: 'refused',
      message: NOT_MSPDI,
    });
    expect(
      refused(
        bytesOf(
          '<?xml version="1.0"?><!DOCTYPE Project [<!ENTITY a "b">]><Project xmlns="http://schemas.microsoft.com/project"/>',
        ),
        'x.xml',
      ),
    ).toEqual({ kind: 'refused', message: NOT_MSPDI });
    expect(refused(zip({ 'word/document.xml': 'x' }), 'x.xlsx')).toEqual({
      kind: 'refused',
      message: "This file isn't a readable Excel workbook.",
    });
    expect(refused(compoundFile(['EncryptionInfo', 'EncryptedPackage']), 'x.xlsx')).toEqual({
      kind: 'refused',
      message:
        'This workbook is protected with a password. Remove the password in Excel, save it and import it again.',
    });
    expect(refused(compoundFile(['   114', 'Props']), 'plan.dat')).toEqual({
      kind: 'refused',
      message: MPP,
    });
    expect(refused(compoundFile(['Workbook']), 'plan.mpp')).toEqual({
      kind: 'refused',
      message: MPP,
    });
    expect(refused(compoundFile(['Workbook']), 'old.xls')).toEqual({
      kind: 'refused',
      message:
        "Older Excel workbooks (.xls) can't be imported. In Excel, save the file as .xlsx and import that.",
    });
    expect(refused(bytesOf('SQLite format 3\0'), 'x.xer')).toEqual({
      kind: 'refused',
      message:
        'This is a database file, not a schedule export. Export the project as XER from P6 or as XML from Microsoft Project.',
    });
    expect(refused(bytesOf('just text'), 'notes.xer')).toEqual({
      kind: 'refused',
      message: UNSUPPORTED,
    });
    expect(refused(new Uint8Array([0x41, 0, 0x42]), 'bin.csv')).toEqual({
      kind: 'refused',
      message: UNSUPPORTED,
    });
  });
});
