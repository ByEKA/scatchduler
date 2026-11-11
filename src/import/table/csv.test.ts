import { describe, expect, it } from 'vitest';
import { csvSource, guessDelimiter } from '@/import/table/csv';

const texts = (rows: Array<Array<{ kind: string; text?: string } | null>>) =>
  rows.map((row) => row.map((cell) => (cell && 'text' in cell ? cell.text : null)));

describe('CSV', () => {
  it('guesses the delimiter that gives the most rows with a constant field count', () => {
    expect(guessDelimiter('Kod;Süre\nA1;2,5\nA2;1,25\n')).toBe(';');
    expect(guessDelimiter('Code,Duration\nA1,2.5\n')).toBe(',');
    expect(guessDelimiter('Code\tDuration\nA1\t2\n')).toBe('\t');
  });

  it('reads CRLF and a trailing blank line like LF, and drops rows of only empty cells', () => {
    const lf = 'Code;Name\nA1;Kazı\n;;\n\n';
    expect(texts(csvSource(lf.replaceAll('\n', '\r\n'), ';').rows)).toEqual(
      texts(csvSource(lf, ';').rows),
    );
    expect(texts(csvSource(lf, ';').rows)).toEqual([
      ['Code', 'Name'],
      ['A1', 'Kazı'],
    ]);
  });
});
