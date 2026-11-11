import type { ImportIssue, ImportIssueSeverity } from '@/data/types';

// The issue catalog of P3 core spec §5.12, copy pinned: `{…}` placeholders are filled by makeIssue,
// locations go in `location`, and the group titles the issue's group in the report (§5.9).

export type IssueCode =
  | 'FILE_EMPTY'
  | 'FILE_UNREADABLE'
  | 'FILE_NO_ACTIVITIES'
  | 'FILE_TOO_MANY_ACTIVITIES'
  | 'FILE_TOO_MANY_RELATIONSHIPS'
  | 'FILE_TOO_MANY_WBS'
  | 'FILE_TOO_MANY_CALENDARS'
  | 'FILE_TOO_MANY_EXCEPTIONS'
  | 'FILE_TOO_MANY_ROWS'
  | 'FILE_TOO_MANY_COLUMNS'
  | 'DUPLICATE_CODE'
  | 'CALENDAR_UNREADABLE'
  | 'CALENDAR_BASE_MISSING'
  | 'CALENDAR_RECURRENCE_UNSUPPORTED'
  | 'FORMAT_FROM_CONTENT'
  | 'ENCODING_GUESSED'
  | 'ENCODING_INVALID_BYTES'
  | 'XER_MULTIPLE_PROJECTS'
  | 'XER_CROSS_PROJECT_LINK'
  | 'XER_RESOURCE_TASK'
  | 'XER_EXPECTED_FINISH'
  | 'XER_CALENDAR_BASE_MISSING'
  | 'XER_UNKNOWN_VALUE'
  | 'XER_DECIMAL_COMMA'
  | 'CALENDAR_UNUSED_SKIPPED'
  | 'CALENDAR_RECURRENCE_CAPPED'
  | 'CALENDAR_MISSING'
  | 'CALENDAR_HOURS_MISMATCH'
  | 'CALENDAR_DATA_REPAIRED'
  | 'CALENDAR_GENERATED_STANDARD'
  | 'CALENDAR_GENERATED_FROM_NAME'
  | 'CALENDAR_GENERATED_ELAPSED'
  | 'MSPDI_SUMMARY_LINK'
  | 'MSPDI_MILESTONE_WITH_DURATION'
  | 'MSPDI_MILESTONE_AMBIGUOUS'
  | 'MSPDI_ZERO_DURATION'
  | 'MSPDI_MANUAL_TASK'
  | 'MSPDI_MANUAL_START_DROPPED'
  | 'MSPDI_INACTIVE_TASK'
  | 'MSPDI_EXTERNAL_TASK'
  | 'MSPDI_EXTERNAL_LINK'
  | 'MSPDI_WORK_WEEKS'
  | 'MSPDI_NO_NAMESPACE'
  | 'MSPDI_DATE_ZONE_DROPPED'
  | 'CODE_FALLBACK'
  | 'XML_BAD_CHARACTER'
  | 'ELAPSED_DURATION'
  | 'ELAPSED_LAG'
  | 'PERCENT_LAG'
  | 'LINK_TYPE_UNKNOWN'
  | 'STATUS_DATE_MISSING'
  | 'STATUS_DATE_FALLBACK'
  | 'STATUS_TIME_KEPT'
  | 'ACTUAL_AFTER_STATUS_DATE'
  | 'PROGRESS_WITHOUT_ACTUAL_START'
  | 'COMPLETE_WITHOUT_ACTUAL_FINISH'
  | 'PROJECT_DATES_DIFFER'
  | 'TABLE_MISSING_CODE'
  | 'TABLE_MISSING_NAME'
  | 'TABLE_BAD_NUMBER'
  | 'TABLE_BAD_DURATION'
  | 'TABLE_ESTIMATED_DURATION'
  | 'TABLE_BAD_DATE'
  | 'TABLE_UNKNOWN_TYPE'
  | 'TABLE_BAD_LINK'
  | 'TABLE_ROW_SKIPPED'
  | 'LINK_UNKNOWN_ACTIVITY'
  | 'LINK_SELF'
  | 'LINK_DUPLICATE'
  | 'CONSTRAINT_UNSUPPORTED'
  | 'TEXT_TRUNCATED';

export const ISSUE_CATALOG: Readonly<
  Record<IssueCode, { severity: ImportIssueSeverity; group: string; message: string }>
> = {
  FILE_EMPTY: { severity: 'error', group: 'Empty file', message: 'The file is empty.' },
  FILE_UNREADABLE: {
    severity: 'error',
    group: "File couldn't be read",
    message:
      "This file couldn't be read. It may be damaged or incomplete. Export it again from your planning tool and retry.",
  },
  FILE_NO_ACTIVITIES: {
    severity: 'error',
    group: 'No activities',
    message: 'No activities were found in this file.',
  },
  FILE_TOO_MANY_ACTIVITIES: {
    severity: 'error',
    group: 'Too many activities',
    message: 'The file has {n} activities. The limit is 20,000.',
  },
  FILE_TOO_MANY_RELATIONSHIPS: {
    severity: 'error',
    group: 'Too many relationships',
    message: 'The file has {n} relationships. The limit is 40,000.',
  },
  FILE_TOO_MANY_WBS: {
    severity: 'error',
    group: 'Too many WBS elements',
    message: 'The file has {n} WBS elements. The limit is 10,000.',
  },
  FILE_TOO_MANY_CALENDARS: {
    severity: 'error',
    group: 'Too many calendars',
    message: 'The file has {n} calendars. The limit is 200.',
  },
  FILE_TOO_MANY_EXCEPTIONS: {
    severity: 'error',
    group: 'Too many calendar exceptions',
    message: "The file's calendars hold more than 100,000 exception dates.",
  },
  FILE_TOO_MANY_ROWS: {
    severity: 'error',
    group: 'Too many rows',
    message: 'The sheet has more than 20,000 rows.',
  },
  FILE_TOO_MANY_COLUMNS: {
    severity: 'error',
    group: 'Too many columns',
    message: 'The sheet has more than 200 columns.',
  },
  DUPLICATE_CODE: {
    severity: 'error',
    group: 'Repeated activity codes',
    message: 'Activity code {code} is used more than once.',
  },
  CALENDAR_UNREADABLE: {
    severity: 'error',
    group: "Calendars that couldn't be read",
    message:
      "Calendar {name} couldn't be read, and dates that use it would be wrong. Fix it in your planning tool and export again.",
  },
  CALENDAR_BASE_MISSING: {
    severity: 'error',
    group: 'Calendars without their base',
    message:
      "Calendar {name} is based on a calendar that isn't in the file. Export the file with that calendar included.",
  },
  CALENDAR_RECURRENCE_UNSUPPORTED: {
    severity: 'error',
    group: "Repeating exceptions we can't read",
    message:
      "Calendar {name} has a repeating exception we can't read. Replace it with single dates in your planning tool and export again.",
  },
  FORMAT_FROM_CONTENT: {
    severity: 'info',
    group: 'File type taken from the content',
    message: "The file's name ends in .{ext}, but it holds {format}. It was read as {format}.",
  },
  ENCODING_GUESSED: {
    severity: 'info',
    group: 'Text encoding',
    message:
      'Text encoding detected as {encoding}. If letters look wrong, choose another encoding.',
  },
  ENCODING_INVALID_BYTES: {
    severity: 'info',
    group: 'Text encoding',
    message:
      "{n} bytes aren't valid UTF-8 and were replaced with �. If letters look wrong, choose another encoding.",
  },
  XER_MULTIPLE_PROJECTS: {
    severity: 'info',
    group: 'Several projects in the file',
    message: 'The file holds {n} projects. This schedule is made from {code}.',
  },
  XER_CROSS_PROJECT_LINK: {
    severity: 'warning',
    group: 'Links to other projects',
    message: 'The link {predecessor} → {successor} points to another project and was skipped.',
  },
  XER_RESOURCE_TASK: {
    severity: 'warning',
    group: 'Resource-dependent activities',
    message: '{code} is resource dependent. It is imported as a task on its own calendar.',
  },
  XER_EXPECTED_FINISH: {
    severity: 'warning',
    group: 'Expected finish dates',
    message:
      "{n} activities have an expected finish date. Expected finish isn't used, so their remaining durations decide their dates.",
  },
  XER_CALENDAR_BASE_MISSING: {
    severity: 'warning',
    group: 'Calendars read without their base',
    message:
      "Calendar {name} is based on a calendar that isn't in the file. It was read as written, with the days P6 exported for it.",
  },
  XER_UNKNOWN_VALUE: {
    severity: 'warning',
    group: 'Unknown values',
    message: "{code} has a {field} we don't know ({value}). {used} is used.",
  },
  XER_DECIMAL_COMMA: {
    severity: 'warning',
    group: 'Decimal commas',
    message:
      "Numbers in this file use a decimal comma the file doesn't declare. They were read as decimals; check durations and percentages.",
  },
  CALENDAR_UNUSED_SKIPPED: {
    severity: 'warning',
    group: 'Unused calendars skipped',
    message: "Calendar {name} couldn't be read completely. Nothing uses it, so it was skipped.",
  },
  CALENDAR_RECURRENCE_CAPPED: {
    severity: 'warning',
    group: 'Long repeating exceptions',
    message:
      'Calendar {name} repeats an exception more than 10,000 times. Dates after {date} were left out.',
  },
  CALENDAR_MISSING: {
    severity: 'warning',
    group: 'Activities without a calendar',
    message: "{code} has no calendar. The project's default calendar is used.",
  },
  CALENDAR_HOURS_MISMATCH: {
    severity: 'info',
    group: 'Calendar hours',
    message:
      'Calendar {name} states {stated} hours a day, but its work week has {actual}. {actual} is used.',
  },
  CALENDAR_DATA_REPAIRED: {
    severity: 'info',
    group: 'Repaired calendars',
    message: 'Calendar {name} had damaged data that was repaired.',
  },
  CALENDAR_GENERATED_STANDARD: {
    severity: 'info',
    group: 'Generated calendars',
    message:
      'Calendar Standard was added as the default calendar: Monday to Friday from {start}, {n} hours a day.',
  },
  CALENDAR_GENERATED_FROM_NAME: {
    severity: 'info',
    group: 'Generated calendars',
    message:
      'Calendar {name} was made from its name with the standard week: Monday to Friday from {start}, {n} hours a day.',
  },
  CALENDAR_GENERATED_ELAPSED: {
    severity: 'info',
    group: 'Generated calendars',
    message:
      'Calendar 24 hours was added for elapsed durations. It works every day, around the clock.',
  },
  MSPDI_SUMMARY_LINK: {
    severity: 'warning',
    group: 'Links on summary tasks',
    message: "The link on summary task {name} was skipped. Summary tasks can't have links.",
  },
  MSPDI_MILESTONE_WITH_DURATION: {
    severity: 'warning',
    group: 'Milestones with a duration',
    message: '{code} is flagged as a milestone but has a duration. It is imported as a task.',
  },
  MSPDI_MILESTONE_AMBIGUOUS: {
    severity: 'warning',
    group: 'Milestones at an unclear time',
    message:
      '{code} is a milestone at {time}, neither the start nor the end of its working day. It is imported as a start milestone.',
  },
  MSPDI_ZERO_DURATION: {
    severity: 'info',
    group: 'Tasks without a duration',
    message: '{code} has no duration. It is imported as a milestone.',
  },
  MSPDI_MANUAL_TASK: {
    severity: 'info',
    group: 'Manually scheduled tasks',
    message: '{code} is manually scheduled in the file. It starts on or after {date}.',
  },
  MSPDI_MANUAL_START_DROPPED: {
    severity: 'warning',
    group: 'Manually scheduled tasks',
    message:
      '{code} is manually scheduled and already has a constraint. Its manual start {date} was dropped.',
  },
  MSPDI_INACTIVE_TASK: {
    severity: 'warning',
    group: 'Inactive tasks',
    message: 'Inactive task {name} was skipped.',
  },
  MSPDI_EXTERNAL_TASK: {
    severity: 'warning',
    group: 'External tasks',
    message: '{name} is an external task or an inserted project and was skipped.',
  },
  MSPDI_EXTERNAL_LINK: {
    severity: 'warning',
    group: 'Links outside the file',
    message: 'The link to {target} points outside this file and was skipped.',
  },
  MSPDI_WORK_WEEKS: {
    severity: 'warning',
    group: 'Alternate work weeks',
    message: 'Calendar {name} has alternate work weeks. Only its default week is used.',
  },
  MSPDI_NO_NAMESPACE: {
    severity: 'info',
    group: 'Non-standard Microsoft Project XML',
    message: 'The file has no Microsoft Project namespace. It was read as Microsoft Project XML.',
  },
  MSPDI_DATE_ZONE_DROPPED: {
    severity: 'info',
    group: 'Non-standard Microsoft Project XML',
    message:
      'Some dates carry a time zone or fractions of a second. They were read as the times written.',
  },
  CODE_FALLBACK: {
    severity: 'warning',
    group: 'Activities without a usable code',
    message: '{name} has no usable code in {field}. Its unique ID {uid} is used.',
  },
  XML_BAD_CHARACTER: {
    severity: 'warning',
    group: 'Invalid characters',
    message: "“{value}” isn't a valid character. It was replaced with �.",
  },
  ELAPSED_DURATION: {
    severity: 'info',
    group: 'Elapsed durations',
    message: '{code} has an elapsed duration. It uses a 24-hour, 7-day calendar.',
  },
  ELAPSED_LAG: {
    severity: 'info',
    group: 'Elapsed lags',
    message:
      'The lag on {predecessor} → {successor} is in elapsed time. It uses a 24-hour calendar.',
  },
  PERCENT_LAG: {
    severity: 'warning',
    group: 'Percentage lags',
    message: 'The lag on {predecessor} → {successor} is a percentage. It was converted to {value}.',
  },
  LINK_TYPE_UNKNOWN: {
    severity: 'warning',
    group: 'Unknown link types',
    message:
      "The link {predecessor} → {successor} has a type we don't know ({value}). It is imported as finish to start.",
  },
  STATUS_DATE_MISSING: {
    severity: 'info',
    group: 'Status date',
    message: 'The file has no status date.',
  },
  STATUS_DATE_FALLBACK: {
    severity: 'warning',
    group: 'Status date',
    message:
      'The file has no valid status date. The earliest task start, {date}, was filled in. Check it before importing.',
  },
  STATUS_TIME_KEPT: {
    severity: 'info',
    group: 'Status date',
    message:
      "The file's status date is {date} {time}. The schedule keeps the date; the time is kept in this report.",
  },
  ACTUAL_AFTER_STATUS_DATE: {
    severity: 'warning',
    group: 'Actual dates after the status date',
    message: '{code} has an actual {start or finish} on {date}, after the status date.',
  },
  PROGRESS_WITHOUT_ACTUAL_START: {
    severity: 'warning',
    group: 'Progress without an actual start',
    message: '{code} shows progress but has no actual start.',
  },
  COMPLETE_WITHOUT_ACTUAL_FINISH: {
    severity: 'warning',
    group: 'Completed without an actual finish',
    message: '{code} is complete but has no actual finish.',
  },
  PROJECT_DATES_DIFFER: {
    severity: 'info',
    group: 'Project dates',
    message:
      'The file states the project runs {start} – {finish}, but its activities run {activityStart} – {activityFinish}.',
  },
  TABLE_MISSING_CODE: {
    severity: 'warning',
    group: 'Rows without an activity code',
    message: 'This row has no activity code and was skipped.',
  },
  TABLE_MISSING_NAME: {
    severity: 'warning',
    group: 'Activities without a name',
    message: '{code} has no name. Its code is used as the name.',
  },
  TABLE_BAD_NUMBER: {
    severity: 'warning',
    group: 'Unreadable numbers',
    message: "“{value}” isn't a number. The cell was left empty.",
  },
  TABLE_BAD_DURATION: {
    severity: 'warning',
    group: 'Unreadable durations',
    message: "“{value}” isn't a duration we can read. The cell was left empty.",
  },
  TABLE_ESTIMATED_DURATION: {
    severity: 'info',
    group: 'Estimated durations',
    message: 'The duration of {code} is marked as estimated. The mark was dropped.',
  },
  TABLE_BAD_DATE: {
    severity: 'warning',
    group: 'Unreadable dates',
    message: "“{value}” isn't a date in {format}. The cell was left empty.",
  },
  TABLE_UNKNOWN_TYPE: {
    severity: 'warning',
    group: 'Unknown activity types',
    message: "“{value}” isn't a known activity type. Task is used.",
  },
  TABLE_BAD_LINK: {
    severity: 'warning',
    group: 'Unreadable links',
    message: "“{token}” isn't a link we can read and was skipped.",
  },
  TABLE_ROW_SKIPPED: {
    severity: 'warning',
    group: 'Rows skipped',
    message: "This row was skipped because “{value}” in {column} couldn't be read.",
  },
  LINK_UNKNOWN_ACTIVITY: {
    severity: 'warning',
    group: 'Links to missing activities',
    message:
      "The link {predecessor} → {successor} names an activity that isn't in the file and was skipped.",
  },
  LINK_SELF: {
    severity: 'warning',
    group: 'Activities linked to themselves',
    message: '{code} links to itself. The link was skipped.',
  },
  LINK_DUPLICATE: {
    severity: 'warning',
    group: 'Repeated links',
    message: 'The link {predecessor} → {successor} appears more than once. One copy was kept.',
  },
  CONSTRAINT_UNSUPPORTED: {
    severity: 'warning',
    group: 'Unsupported constraints',
    message: "{code} has a constraint we don't support ({value}). It was dropped.",
  },
  TEXT_TRUNCATED: {
    severity: 'info',
    group: 'Shortened text',
    message: 'The {field} of {code} was longer than {n} characters and was shortened.',
  },
};

const MAX_TEXT = 200;

/**
 * The first `max` characters (UTF-16 code units) of `text`, one fewer when the last would be half
 * of a surrogate pair: a lone surrogate can't be stored as JSON text in Postgres.
 */
export function sliceText(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/** Text longer than `max` (200) becomes its first `max - 1` characters and '…' (§5.10). */
export function cutText(text: string, max: number = MAX_TEXT): string {
  if (text.length <= max) return text;
  return `${sliceText(text, max - 1)}…`;
}

function cutOrNull(text: string | null | undefined): string | null {
  return text === null || text === undefined ? null : cutText(text);
}

/**
 * An issue from the catalog: `{name}` placeholders take `params` (numbers written the en-US way,
 * 20001 → "20,001"); every text field is cut to 200 characters.
 */
export function makeIssue(
  code: IssueCode,
  params: Record<string, string | number> = {},
  at: { location?: string | null; original?: string | null; used?: string | null } = {},
): ImportIssue {
  const entry = ISSUE_CATALOG[code];
  const message = entry.message.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => {
    if (!Object.hasOwn(params, name)) return placeholder;
    const value = params[name];
    return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
  });
  return {
    severity: entry.severity,
    code,
    message: cutText(message),
    location: cutOrNull(at.location),
    original: cutOrNull(at.original),
    used: cutOrNull(at.used),
  };
}
