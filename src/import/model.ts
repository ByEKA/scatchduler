import type { ImportFormat, ISODate } from '@/data/types';

// The model P4 receives (P3 core spec §5.8), verbatim; the field names are our call.
export type WallClock = string; // 'YYYY-MM-DDTHH:mm', no zone, as written in the file (§5.4)
export interface Period {
  // minutes from midnight, 0–1440
  start: number;
  finish: number;
}
export interface Window {
  start: WallClock | null;
  finish: WallClock | null;
}
export type ImportConstraintType =
  | 'start_on'
  | 'start_on_or_after'
  | 'start_on_or_before'
  | 'finish_on'
  | 'finish_on_or_after'
  | 'finish_on_or_before'
  | 'mandatory_start'
  | 'mandatory_finish'
  | 'as_late_as_possible';
export interface ImportModel {
  schemaVersion: 1;
  format: ImportFormat;
  project: {
    code: string | null;
    name: string | null;
    rootWbsName: string | null;
    statedStart: WallClock | null;
    statedFinish: WallClock | null;
    mustFinishBy: WallClock | null;
    statusDate: WallClock | null;
    defaultCalendarId: string | null;
  };
  calendars: Array<{
    id: string;
    name: string;
    kind: 'project' | 'global' | 'resource' | 'task';
    week: Period[][]; // 7 entries, 0 = Sunday; [] = non-working day
    exceptions: Array<{ date: ISODate; periods: Period[] }>; // [] = non-working; after inheritance
    hoursPerDay: number;
    hoursPerWeek: number | null;
    hoursPerMonth: number | null;
    hoursPerYear: number | null;
  }>;
  wbs: Array<{ id: string; parentId: string | null; code: string; name: string; order: number }>;
  activities: Array<{
    keys: { taskId: string | null; uid: string | null; guid: string | null }; // XER task_id · MSPDI UID and GUID
    code: string;
    name: string;
    wbsId: string | null;
    calendarId: string;
    type: 'task' | 'start_milestone' | 'finish_milestone' | 'level_of_effort' | 'wbs_summary';
    originalDuration: number | null;
    remainingDuration: number | null; // working minutes
    planned: Window;
    early: Window;
    late: Window;
    actual: Window;
    remaining: Window;
    constraint: { type: ImportConstraintType; date: WallClock | null } | null;
    secondaryConstraint: { type: ImportConstraintType; date: WallClock | null } | null;
    status: 'not_started' | 'in_progress' | 'completed';
    percent: {
      duration: number | null;
      physical: number | null;
      type: 'duration' | 'physical' | 'units' | null;
    };
    totalFloat: number | null;
    freeFloat: number | null; // working minutes as written; kept, never inputs
    notes: string | null;
    flags: { manual: boolean; elapsed: boolean; resourceDependent: boolean };
  }>;
  relationships: Array<{
    predecessorCode: string;
    successorCode: string;
    type: 'FS' | 'SS' | 'FF' | 'SF';
    lagMinutes: number;
    lagElapsed: boolean;
  }>; // working minutes unless lagElapsed (24-hour time); lag calendar per settings (P3 full D40)
  settings: Array<{ key: string; value: string }>;
}

// The element types of the model's arrays.
export type ImportCalendar = ImportModel['calendars'][number];
export type ImportWbs = ImportModel['wbs'][number];
export type ImportActivity = ImportModel['activities'][number];
export type ImportRelationship = ImportModel['relationships'][number];

/** A model with no project values and empty lists, for readers to fill. */
export function emptyModel(format: ImportFormat): ImportModel {
  return {
    schemaVersion: 1,
    format,
    project: {
      code: null,
      name: null,
      rootWbsName: null,
      statedStart: null,
      statedFinish: null,
      mustFinishBy: null,
      statusDate: null,
      defaultCalendarId: null,
    },
    calendars: [],
    wbs: [],
    activities: [],
    relationships: [],
    settings: [],
  };
}
