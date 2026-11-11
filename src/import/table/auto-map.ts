import type { ImportField, TableMapping } from '@/data/types';
import { foldForMatch } from '@/lib/search';

// Automatic column mapping (P3 core spec §5.7): English and Turkish header aliases, compared with
// foldForMatch. The word lists beyond §5.7's examples are our own (§10). No alias belongs to two
// fields. Left out on purpose: Microsoft Project's "Type" (fixed units, duration or work, not an
// activity type) and "Task Calendar" (which writes "None" for tasks without one).

export const FIELD_ALIASES: Record<ImportField, readonly string[]> = {
  code: [
    'activity id',
    'activity code',
    'unique id',
    'code',
    'task code',
    'kod',
    'aktivite kodu',
    'aktivite no',
    'faaliyet kodu',
    'iş kodu',
    'benzersiz kimlik',
  ],
  taskId: ['id', 'kimlik'],
  name: [
    'activity name',
    'task name',
    'name',
    'ad',
    'adı',
    'aktivite adı',
    'faaliyet adı',
    'görev adı',
    'iş adı',
  ],
  wbs: ['wbs', 'wbs code', 'wbs kodu', 'iş kırılımı', 'iş kırılım yapısı'],
  duration: [
    'duration',
    'original duration',
    'planned duration',
    'süre',
    'orijinal süre',
    'planlanan süre',
  ],
  start: [
    'start',
    'start date',
    'planned start',
    'başlangıç',
    'başlangıç tarihi',
    'planlanan başlangıç',
  ],
  finish: [
    'finish',
    'finish date',
    'end',
    'end date',
    'planned finish',
    'bitiş',
    'bitiş tarihi',
    'planlanan bitiş',
  ],
  actualStart: ['actual start', 'gerçek başlangıç', 'fiili başlangıç'],
  actualFinish: ['actual finish', 'gerçek bitiş', 'fiili bitiş'],
  activityType: ['activity type', 'aktivite tipi', 'aktivite türü', 'faaliyet tipi'],
  calendar: ['calendar', 'activity calendar', 'takvim', 'aktivite takvimi'],
  constraintType: [
    'constraint',
    'constraint type',
    'primary constraint',
    'kısıt',
    'kısıt tipi',
    'kısıt türü',
    'birincil kısıt',
  ],
  constraintDate: [
    'constraint date',
    'primary constraint date',
    'kısıt tarihi',
    'birincil kısıt tarihi',
  ],
  percentComplete: [
    '% complete',
    'percent complete',
    'duration % complete',
    'activity % complete',
    '% tamamlanma',
    'tamamlanma yüzdesi',
    'tamamlanma %',
  ],
  predecessors: ['predecessors', 'predecessor', 'öncüller', 'öncül'],
  notes: ['notes', 'note', 'comments', 'notlar', 'not', 'açıklama'],
};

const FIELD_BY_ALIAS: ReadonlyMap<string, ImportField> = new Map(
  (Object.entries(FIELD_ALIASES) as Array<[ImportField, readonly string[]]>).flatMap(
    ([field, aliases]) => aliases.map((alias) => [foldForMatch(alias), field] as const),
  ),
);

/**
 * The fields the headers name, each column mapped once and each field to its first column. Runs of
 * white space count as one space, so a header wrapped onto two lines in its cell still matches.
 */
export function autoMap(headers: readonly string[]): TableMapping['columns'] {
  const columns: TableMapping['columns'] = {};
  headers.forEach((header, index) => {
    const field = FIELD_BY_ALIAS.get(foldForMatch(header).replace(/\s+/g, ' '));
    if (field !== undefined && columns[field] === undefined) columns[field] = { index, header };
  });
  return columns;
}
