import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readLocalStack } from './local-stack';

function workbook(date1904: boolean): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Start'], [46096.5]]), 'Plan');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[9]]), 'Other');
  book.Workbook = { WBProps: { date1904 } };
  return new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

describe('phase 3 core assumptions', () => {
  it('V2: SheetJS writes and reads both date systems with the same serials', () => {
    for (const date1904 of [false, true]) {
      const read = XLSX.read(workbook(date1904), {
        type: 'array',
        dense: true,
        cellDates: false,
        cellFormula: false,
      });
      expect(Boolean(read.Workbook?.WBProps?.date1904)).toBe(date1904);
      expect(XLSX.utils.sheet_to_json(read.Sheets.Plan!, { header: 1, raw: true })).toEqual([
        ['Start'],
        [46096.5],
      ]);
    }
  });

  it('V2: SheetJS reads only the sheets and rows it is asked for', () => {
    const read = XLSX.read(workbook(false), {
      type: 'array',
      dense: true,
      sheets: ['Plan'],
      sheetRows: 1,
    });
    expect(read.SheetNames).toEqual(['Plan', 'Other']);
    expect(XLSX.utils.sheet_to_json(read.Sheets.Plan!, { header: 1 })).toEqual([['Start']]);
    expect(read.Sheets.Other).toBeUndefined();
  });

  it('V3: fast-xml-parser leaves entities as written and values as text', () => {
    const parser = new XMLParser({
      parseTagValue: false,
      processEntities: false,
      removeNSPrefix: true,
      ignoreAttributes: true,
      isArray: (name: string) => name === 'Task',
    });
    const doc = parser.parse(
      '<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Task><Name>Kazı &amp; Dolgu &#x130;</Name><OutlineNumber>1.10</OutlineNumber></Task></Project>',
    ) as { Project: { Task: unknown[] } };
    expect(doc.Project.Task).toEqual([{ Name: 'Kazı &amp; Dolgu &#x130;', OutlineNumber: '1.10' }]);
  });

  it('V4: Papa Parse splits a decoded string on the delimiter it is given', () => {
    expect(
      Papa.parse<string[]>('Kod;Süre\nA1;2,5\n', { delimiter: ';', skipEmptyLines: true }).data,
    ).toEqual([
      ['Kod', 'Süre'],
      ['A1', '2,5'],
    ]);
  });

  it('V5: TextDecoder knows the encodings the parser offers, with fatal', () => {
    expect(
      new TextDecoder('windows-1254', { fatal: true }).decode(new Uint8Array([0xdd, 0xfe, 0xf0])),
    ).toBe('İşğ');
    expect(new TextDecoder('windows-1252', { fatal: true }).decode(new Uint8Array([0x8e]))).toBe(
      'Ž',
    );
    expect(new TextDecoder('utf-16le', { fatal: true }).decode(new Uint8Array([0x30, 0x01]))).toBe(
      'İ',
    );
    expect(new TextDecoder('utf-16be', { fatal: true }).decode(new Uint8Array([0x01, 0x30]))).toBe(
      'İ',
    );
    expect(() =>
      new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([0xfd])),
    ).toThrow();
  });

  it('V7: storage.download returns the bytes of an object the reader may select', async () => {
    const stack = readLocalStack();
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(stack.apiUrl, stack.secretKey, options);
    const email = `v7.${Date.now()}@example.com`;
    await admin.auth.admin.createUser({ email, password: 'letters12345', email_confirm: true });
    const client = createClient(stack.apiUrl, stack.publishableKey, options);
    await client.auth.signInWithPassword({ email, password: 'letters12345' });
    const { data: workspace } = await client.rpc('create_team_workspace', {
      p_name: `V7 ${Date.now() % 100000}`,
    });
    const path = `${(workspace as { id: string }).id}/${crypto.randomUUID()}/${crypto.randomUUID()}.xer.gz`;
    const bytes = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]);
    expect(
      (await client.storage.from('schedule-imports').upload(path, new Blob([bytes]))).error,
    ).toBeNull();
    const { data, error } = await client.storage.from('schedule-imports').download(path);
    expect(error).toBeNull();
    expect(new Uint8Array(await data!.arrayBuffer())).toEqual(bytes);
  });
});
