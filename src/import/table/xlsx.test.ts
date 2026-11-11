import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import workbook1900 from '@/import/__fixtures__/dates-1900.xlsx?bytes';
import workbook1904 from '@/import/__fixtures__/dates-1904.xlsx?bytes';
import { xlsxSource } from '@/import/table/xlsx';
import { defaultTableMapping, readTable, type TableSource } from '@/import/table/normalize';
import { bytesOf } from '@/import/testing';

describe('xlsx', () => {
  it('reads the chosen sheet with date and percent cells in both date systems', () => {
    const a = xlsxSource(workbook1900, null) as TableSource;
    const b = xlsxSource(workbook1904, 'Plan') as TableSource;
    expect(a).toMatchObject({ sheets: ['Plan', 'Notes'], sheet: 'Plan', date1904: false });
    expect(b.date1904).toBe(true);
    expect(a.rows[1]![3]).toEqual({ kind: 'date', serial: 46083 });
    expect(b.rows[1]![3]).toEqual({ kind: 'date', serial: 44621 });
    expect(a.rows[2]![5]).toEqual({ kind: 'number', value: 0.5, percent: true });
    expect((xlsxSource(workbook1900, 'Notes') as TableSource).rows).toHaveLength(1);
  });

  it('refuses a damaged workbook with the workbook message', () => {
    expect(xlsxSource(workbook1900.slice(0, workbook1900.length / 2), null)).toEqual({
      refused: "This file isn't a readable Excel workbook.",
    });
    expect(xlsxSource(workbook1900, 'Missing')).toEqual({
      refused: "This file isn't a readable Excel workbook.",
    });
  });

  it('refuses a workbook of more than 1,000 archive entries with the workbook message (D57)', () => {
    const padded = (entries: number) => {
      const parts: Record<string, Uint8Array> = unzipSync(workbook1900);
      for (let i = Object.keys(parts).length; i < entries; i += 1)
        parts[`docProps/pad${i}.xml`] = bytesOf('<pad/>');
      return zipSync(parts);
    };
    expect(xlsxSource(padded(1000), null)).toMatchObject({ sheet: 'Plan' });
    expect(xlsxSource(padded(1001), null)).toEqual({
      refused: "This file isn't a readable Excel workbook.",
    });
  });

  // SheetJS reads these with other readers, outside the guard: OpenDocument ignores sheetRows for
  // repeated rows, and a nested Index.zip is inflated without being measured (§5.10, §5.11).
  describe('refuses an archive SheetJS would not read as an OOXML workbook', () => {
    const parts = unzipSync(workbook1900);
    const openDocument = {
      'styles.xml': bytesOf('<office:document-styles/>'),
      'content.xml': bytesOf(
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
          ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
          ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body>' +
          '<office:spreadsheet><table:table table:name="Plan">' +
          '<table:table-row table:number-rows-repeated="30000"><table:table-cell' +
          ' office:value-type="string"><text:p>x</text:p></table:table-cell></table:table-row>' +
          '</table:table></office:spreadsheet></office:body></office:document-content>',
      ),
    };
    it.each([
      [
        'OpenDocument (META-INF/manifest.xml)',
        { ...parts, ...openDocument, 'META-INF/manifest.xml': bytesOf('<manifest:manifest/>') },
      ],
      ['UOF (objectdata.xml)', { ...parts, ...openDocument, 'objectdata.xml': bytesOf('<uof/>') }],
      ['Numbers (Index/Document.iwa)', { ...parts, 'Index/Document.iwa': bytesOf('iwa') }],
      [
        'a nested Index.zip without [Content_Types].xml',
        {
          'xl/workbook.xml': parts['xl/workbook.xml']!,
          'docs/INDEX.ZIP': [workbook1900, { level: 0 }] as [Uint8Array, { level: 0 }],
        },
      ],
    ])('%s', (_, entries) => {
      expect(xlsxSource(zipSync(entries), null)).toEqual({
        refused: "This file isn't a readable Excel workbook.",
      });
    });
  });

  it('reads an integer serial as a date only unless its number format shows a time (D58)', () => {
    const cell = (v: number, z: string) => ({ t: 'n', v, z });
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ['Code', 'Name', 'Start', 'Finish'],
        ['A1', 'Date only', cell(46083, 'yyyy-mm-dd'), cell(46085, 'dd.mm.yyyy "saat h"')],
        ['A2', 'Midnight', cell(46083, 'yyyy-mm-dd hh:mm'), cell(46085, 'm/d/yyyy h:mm AM/PM')],
        [
          'A3',
          'With a time',
          cell(46083.5, 'yyyy-mm-dd'),
          cell(46085, '[$-x-sysdate]dddd, mmmm dd, yyyy'),
        ],
      ]),
      'Plan',
    );
    const bytes = new Uint8Array(write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    const source = xlsxSource(bytes, null) as TableSource;
    const result = readTable(source, defaultTableMapping(source, { delimiter: null }), {
      format: 'xlsx',
      encoding: null,
    });
    expect(result.model.activities.map((a) => a.planned)).toEqual([
      { start: '2026-03-02T08:00', finish: '2026-03-04T17:00' },
      { start: '2026-03-02T00:00', finish: '2026-03-04T00:00' },
      { start: '2026-03-02T12:00', finish: '2026-03-04T17:00' },
    ]);
  });
});
