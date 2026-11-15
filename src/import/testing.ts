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

const MSPDI_STANDARD_CALENDAR = `<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${[
  1, 2, 3, 4, 5, 6, 7,
]
  .map((dayType) =>
    dayType === 1 || dayType === 7
      ? `<WeekDay><DayType>${dayType}</DayType><DayWorking>0</DayWorking></WeekDay>`
      : `<WeekDay><DayType>${dayType}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`,
  )
  .join('')}</WeekDays></Calendar>`;

/**
 * A complete Microsoft Project XML document: SaveVersion 14, MinutesPerDay 480, CalendarUID 1, the
 * given project elements, the given calendars (default: UID 1 "Standard", Monday to Friday 08:00
 * to 12:00 and 13:00 to 17:00) and the given task elements.
 */
export function mspdiXml(parts: { project?: string; calendars?: string; tasks: string }): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    '<SaveVersion>14</SaveVersion><MinutesPerDay>480</MinutesPerDay><CalendarUID>1</CalendarUID>',
    parts.project ?? '',
    `<Calendars>${parts.calendars ?? MSPDI_STANDARD_CALENDAR}</Calendars>`,
    `<Tasks>${parts.tasks}</Tasks>`,
    '</Project>',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Generated files for the limit, budget and size tests

/** A clndr_data work week: Monday to Friday 08:00–12:00 and 13:00–17:00. */
const XER_WEEK = `(0||CalendarData()((0||DaysOfWeek()((0||1()())${[2, 3, 4, 5, 6]
  .map((day) => `(0||${day}()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))`)
  .join('')}(0||7()())))(0||Exceptions()())))`;

/**
 * A P6 XER file of one project (proj_id 1, "GEN"): `activities` tasks of 8 hours each, and
 * `links` FS links, first a chain through the activities, then links two or more activities
 * apart, then repeats of the first link with their own task_pred_id once no pair is left.
 * `wbs` WBS elements under the project node (the tasks spread over them), `calendars` calendars
 * (default 1; every task uses the first, the others are project calendars nothing uses),
 * `missingCalendars` gives every task an unknown clndr_id (one CALENDAR_MISSING each), and
 * `padToBytes` adds TASKMEMO rows until the file is about that size, never larger.
 */
export function generateXer(options: {
  activities: number;
  links: number;
  wbs?: number;
  calendars?: number;
  missingCalendars?: boolean;
  padToBytes?: number;
}): Uint8Array {
  const { activities, links, wbs = 0, calendars = 1, missingCalendars = false } = options;
  const rows: string[] = [
    'ERMHDR\t20.12\t2026-11-01\tProject\tadmin\tPlanner\tdbxDatabaseNoName\tProject Management\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\texport_flag\tlast_recalc_date\tplan_start_date\tscd_end_date\tclndr_id',
    '%R\t1\tGEN\tY\t2026-01-05 00:00\t2026-01-05 08:00\t2026-01-05 17:00\t1',
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tclndr_type\tbase_clndr_id\tproj_id\tday_hr_cnt\tweek_hr_cnt\tmonth_hr_cnt\tyear_hr_cnt\tclndr_data',
  ];
  for (let id = 1; id <= calendars; id += 1) {
    const [type, project] = id === 1 ? ['CA_Base', ''] : ['CA_Project', '1'];
    rows.push(`%R\t${id}\tCalendar ${id}\t${type}\t\t${project}\t8\t40\t172\t2000\t${XER_WEEK}`);
  }
  rows.push(
    '%T\tPROJWBS',
    '%F\twbs_id\tproj_id\tparent_wbs_id\tseq_num\tproj_node_flag\twbs_short_name\twbs_name',
    '%R\t1\t1\t\t0\tY\tGEN\tGenerated project',
  );
  for (let i = 0; i < wbs; i += 1) rows.push(`%R\t${i + 2}\t1\t1\t${i}\tN\tW${i}\tWBS ${i}`);
  rows.push(
    '%T\tTASK',
    '%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\tphys_complete_pct\tcomplete_pct_type\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date',
  );
  const calendarId = missingCalendars ? '999' : '1';
  for (let i = 0; i < activities; i += 1) {
    const wbsId = wbs > 0 ? (i % wbs) + 2 : 1;
    rows.push(
      `%R\t${i + 1}\t1\t${wbsId}\t${calendarId}\tA${i + 1}\tActivity ${i + 1}\tTT_Task\tTK_NotStart\t0\tCP_Drtn\t8\t8\t2026-01-05 08:00\t2026-01-05 17:00`,
    );
  }
  rows.push(
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt',
  );
  for (let k = 0; k < links; k += 1) {
    let predecessor = 0;
    let successor = Math.min(1, activities - 1);
    if (k < activities - 1) {
      predecessor = k;
      successor = k + 1;
    } else {
      const extra = k - (activities - 1);
      const gap = 2 + Math.floor(extra / activities);
      if ((extra % activities) + gap < activities) {
        predecessor = extra % activities;
        successor = predecessor + gap;
      }
    }
    rows.push(`%R\t${k + 1}\t${successor + 1}\t${predecessor + 1}\t1\t1\tPR_FS\t0`);
  }

  const end = '%E\r\n';
  let text = `${rows.join('\r\n')}\r\n`;
  if (options.padToBytes !== undefined) {
    // Every character is ASCII, so string lengths are byte counts.
    const head = '%T\tTASKMEMO\r\n%F\tmemo_id\ttask_id\tproj_id\tmemo_type_id\ttask_memo\r\n';
    const note = 'Generated note for the size test. '.repeat(6).trim();
    const memos: string[] = [];
    let size = text.length + head.length + end.length;
    for (let id = 1; ; id += 1) {
      const row = `%R\t${id}\t${((id - 1) % Math.max(activities, 1)) + 1}\t1\t1\t${note}\r\n`;
      if (size + row.length > options.padToBytes) break;
      memos.push(row);
      size += row.length;
    }
    if (memos.length > 0) text += head + memos.join('');
  }
  return new TextEncoder().encode(text + end);
}

/**
 * A UTF-8 CSV with a header and `rows` data rows: activity code, name, duration, start, finish and
 * predecessors (a chain), then extra columns up to `columns` (default 6; fewer keeps the first).
 */
export function generateCsv(options: { rows: number; columns?: number }): Uint8Array {
  const columns = Math.max(2, options.columns ?? 6);
  const header = ['Activity ID', 'Activity Name', 'Duration', 'Start', 'Finish', 'Predecessors'];
  for (let k = header.length; k < columns; k += 1) header.push(`Extra ${k + 1}`);
  const lines = [header.slice(0, columns).join(',')];
  for (let i = 1; i <= options.rows; i += 1) {
    const values = [
      `A${i}`,
      `Activity ${i}`,
      '2d',
      '2026-03-02',
      '2026-03-03',
      i > 1 ? `A${i - 1}` : '',
    ];
    for (let k = values.length; k < columns; k += 1) values.push(`x${k + 1}`);
    lines.push(values.slice(0, columns).join(','));
  }
  return new TextEncoder().encode(lines.join('\r\n') + '\r\n');
}
