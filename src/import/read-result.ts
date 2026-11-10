import type { ImportCount, ImportIssue, ImportReport, ISODate } from '@/data/types';
import type { ImportModel } from './model';

/** What every reader (XER, MSPDI, table) returns; `analyze` builds the report from it. */
export interface ReadResult {
  model: ImportModel;
  issues: ImportIssue[]; // the reader's issues in file order
  counts: ImportCount[]; // calendar, wbs, activity, relationship — always all four, in that order
  formatVersion: string | null;
  sourceProject: ImportReport['sourceProject'];
  units: ImportReport['units'];
  externalLinks: ImportReport['externalLinks'];
  notImported: ImportReport['notImported'];
  elements: Array<{ element: string; items: number }>; // present source elements, named as in OUTCOME_CATALOG
  statusDate: {
    date: ISODate | null;
    time: string | null;
    source: 'file' | 'earliest-start' | 'none';
  };
}
