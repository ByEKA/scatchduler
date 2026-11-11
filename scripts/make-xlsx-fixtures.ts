// Writes the parser's xlsx fixtures (P3 core spec §3, §5.11, D42): src/import/__fixtures__/
// dates-1900.xlsx and dates-1904.xlsx hold the same plan, one in each Excel date system. Our own
// data. Run with `npm run fixtures:xlsx`; SheetJS writes the same bytes on every run.
import { writeFileSync } from 'node:fs';
import { utils, write, type CellObject } from 'xlsx';

const FIXTURES = new URL('../src/import/__fixtures__/', import.meta.url);
const DAY_MS = 86_400_000;

/** Days from 1970-01-01 to a `YYYY-MM-DD` date, from its numbers only. */
function dayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

const EPOCH_1900 = Date.UTC(1899, 11, 30) / DAY_MS; // serial 0 for dates after 28 February 1900
const EPOCH_1904 = Date.UTC(1904, 0, 1) / DAY_MS;

/** A date cell: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` as a serial of the date system. */
function dateCell(value: string, date1904: boolean): CellObject {
  const [date = '', time] = value.split(' ');
  let serial = dayNumber(date) - (date1904 ? EPOCH_1904 : EPOCH_1900);
  if (time !== undefined) {
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    serial += (hours * 60 + minutes) / 1440;
  }
  return { t: 'n', v: serial, z: time === undefined ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm' };
}

function percentCell(value: number): CellObject {
  return { t: 'n', v: value, z: '0%' };
}

function workbook(date1904: boolean): Uint8Array {
  const plan = [
    ['Code', 'Name', 'Duration', 'Start', 'Finish', '% Complete', 'Predecessors'],
    [
      'X1',
      'Mobilise',
      1,
      dateCell('2026-03-02', date1904),
      dateCell('2026-03-02', date1904),
      percentCell(1),
      null,
    ],
    [
      'X2',
      'Excavate',
      5,
      dateCell('2026-03-03', date1904),
      dateCell('2026-03-09', date1904),
      percentCell(0.5),
      'X1',
    ],
    [
      'X3',
      'Pour',
      3,
      dateCell('2026-03-10 08:00', date1904),
      dateCell('2026-03-12 17:00', date1904),
      percentCell(0),
      'X2FS+1',
    ],
  ];
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(plan), 'Plan');
  utils.book_append_sheet(book, utils.aoa_to_sheet([['Durations are in days.']]), 'Notes');
  book.Workbook = { WBProps: { date1904 } };
  return new Uint8Array(write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

for (const [file, date1904] of [
  ['dates-1900.xlsx', false],
  ['dates-1904.xlsx', true],
] as const) {
  writeFileSync(new URL(file, FIXTURES), workbook(date1904));
  console.log(`Wrote src/import/__fixtures__/${file}`);
}
