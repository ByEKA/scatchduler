import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  defaultProjectId,
  importFileSchema,
  makeNewScheduleSchema,
  MAX_SCHEDULE_BYTES,
  newScheduleSchema,
  scheduleNameFromFile,
} from '@/features/schedules/schedule-schema';

const issues = (schema: ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('schedule schemas', () => {
  it('validates names and project', () => {
    expect(issues(newScheduleSchema, { name: '   ', code: 'S01', projectId: 'p' })).toEqual([
      'Enter a schedule name',
    ]);
    expect(
      issues(newScheduleSchema, { name: 'x'.repeat(81), code: 'S01', projectId: 'p' }),
    ).toEqual(['Use 80 characters or fewer']);
    expect(issues(newScheduleSchema, { name: 'Baseline', code: 'S01', projectId: '' })).toEqual([
      'Choose a project',
    ]);
  });

  it('validates import files case-insensitively and by size', () => {
    expect(issues(importFileSchema, null)).toEqual(['Choose a file to import']);
    expect(issues(importFileSchema, new File(['x'], 'plan.pdf'))).toEqual([
      'Use a .xer, .xml, .xlsx or .csv file',
    ]);
    expect(issues(importFileSchema, new File(['x'], 'BASELINE.XER'))).toEqual([]);
    expect(MAX_SCHEDULE_BYTES).toBe(50 * 1024 * 1024);
    const big = new File(['x'], 'big.xer');
    Object.defineProperty(big, 'size', { value: 50 * 1024 * 1024 + 1 });
    expect(issues(importFileSchema, big)).toEqual(['File must be 50 MB or smaller']);
    const atLimit = new File(['x'], 'limit.xer');
    Object.defineProperty(atLimit, 'size', { value: 50 * 1024 * 1024 });
    expect(issues(importFileSchema, atLimit)).toEqual([]);
  });

  it('validates schedule codes and checks them against the project codes', () => {
    const schema = makeNewScheduleSchema(['MS-01']);
    const issues = (code: string) => {
      const result = schema.safeParse({ name: 'Plan', code, projectId: 'p1' });
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };
    expect(issues('S01')).toEqual([]);
    expect(issues('  ')).toEqual(['Enter a schedule code']);
    expect(issues('a b')).toEqual(['Use letters, numbers, ., - or _']);
    expect(issues('x'.repeat(25))).toEqual(['Use 24 characters or fewer']);
    expect(issues(' ms-01 ')).toEqual(['This code is already used in this project']);
  });

  it('derives a schedule name from the file name', () => {
    expect(scheduleNameFromFile('Baseline.v2.XER')).toBe('Baseline.v2');
  });

  it('starts on the requested project, then the current one, then the first', () => {
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(defaultProjectId(projects, 'c', 'b')).toBe('c');
    expect(defaultProjectId(projects, undefined, 'b')).toBe('b');
    expect(defaultProjectId(projects, 'gone', 'b')).toBe('b');
    expect(defaultProjectId(projects, 'gone', 'gone')).toBe('a');
    expect(defaultProjectId([], 'a', 'a')).toBeNull();
  });

  it('accepts the import extensions and refuses MPP and XLS with their messages', () => {
    const fileIssues = (name: string) => {
      const result = importFileSchema.safeParse(new File(['x'], name));
      return result.success ? [] : result.error.issues.map((i) => i.message);
    };
    expect(['a.XER', 'b.xml', 'c.xlsx', 'd.CSV'].flatMap(fileIssues)).toEqual([]);
    expect(fileIssues('plan.pdf')).toEqual(['Use a .xer, .xml, .xlsx or .csv file']);
    expect(fileIssues('plan.mpp')).toEqual([
      "MPP files can't be imported. In Microsoft Project, save the file as XML and import that.",
    ]);
    expect(fileIssues('old.xls')).toEqual([
      "Older Excel workbooks (.xls) can't be imported. In Excel, save the file as .xlsx and import that.",
    ]);
  });
});
