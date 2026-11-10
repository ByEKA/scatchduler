import { describe, expect, it } from 'vitest';
import { tokenizeXer, type XerFile } from '@/import/xer/tokenize';

const lines = (...rows: string[]) => rows.join('\n');
const read = (text: string) => tokenizeXer(text) as XerFile;

describe('tokenizeXer', () => {
  it('reads tables by field name into prototype-free records', () => {
    const file = read(
      lines(
        'ERMHDR\t20.12',
        '%T\tTASK',
        '%F\ttask_id\ttask_code\t__proto__\textra',
        '%R\t1\tA1\tx\ty',
        '%E',
      ),
    );
    const [row] = file.tables.get('TASK')!.rows;
    expect(file.version).toBe('20.12');
    expect(Object.getPrototypeOf(row)).toBeNull();
    expect({ ...row }).toEqual({ task_id: '1', task_code: 'A1', ['__proto__']: 'x', extra: 'y' });
  });

  it('joins continuation lines and stops at %E', () => {
    const file = read(
      lines(
        'ERMHDR\t20.12',
        '%T\tTASKMEMO',
        '%F\tmemo_id\ttask_memo',
        '%R\t1\tFirst line',
        '\tsecond line',
        'third line',
        '%E',
        '%T\tIGNORED',
      ),
    );
    expect(file.tables.get('TASKMEMO')!.rows[0]!.task_memo).toBe(
      'First line\nsecond line\nthird line',
    );
    expect(file.tables.has('IGNORED')).toBe(false);
  });

  it('reads CRLF files with a trailing blank line like LF files', () => {
    const lf = lines('ERMHDR\t20.12', '%T\tTASK', '%F\ttask_id\ttask_code', '%R\t1\tA1', '%E', '');
    expect(read(lf.replaceAll('\n', '\r\n'))).toEqual(read(lf));
  });

  it('refuses a record before its field names', () => {
    expect(tokenizeXer(lines('ERMHDR\t20.12', '%T\tTASK', '%R\t1\tA1'))).toEqual({
      error: 'unreadable',
    });
  });

  it('rejoins a raw line break inside a cell only when the field count then matches, within 8 lines (D58)', () => {
    const file = read(
      lines(
        'ERMHDR\t20.12',
        '%T\tTASK',
        '%F\ttask_id\ttask_name\ttask_code',
        '%R\t1\tKazı',
        'işleri\tA1',
        '%R\t2\tPart one',
        'part two',
        'part three\tA2\textra',
        '%R\t3\tL1',
        ...['L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
        'L8\tA3',
        '%R\t4\tM1',
        ...['M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'],
        'M9\tA4',
        '%E',
      ),
    );
    expect(file.tables.get('TASK')!.rows.map((row) => ({ ...row }))).toEqual([
      { task_id: '1', task_name: 'Kazı\nişleri', task_code: 'A1' },
      { task_id: '2', task_name: 'Part one' },
      { task_id: '3', task_name: 'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8', task_code: 'A3' },
      { task_id: '4', task_name: 'M1' },
    ]);
  });

  it('reads two 0x7F bytes in a note as a line break and drops NUL and BOM characters (D58)', () => {
    const file = read(
      lines(
        'ERMHDR\t20.12',
        '%T\tTASKMEMO',
        '%F\tmemo_id\ttask_memo\tmemo_code',
        '%R\t1\t<p>Kazı\x7f\x7fbitti\u0000\ufeff</p>\tA\x7f\x7fB',
        '%E',
      ),
    );
    const [row] = file.tables.get('TASKMEMO')!.rows;
    expect(row!.task_memo).toBe('<p>Kazı\nbitti</p>');
    expect(row!.memo_code).toBe('A\x7f\x7fB');
  });
});
