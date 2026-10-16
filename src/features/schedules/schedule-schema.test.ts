import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  defaultProjectId,
  importScheduleSchema,
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
    expect(issues(newScheduleSchema, { name: '   ', projectId: 'p' })).toEqual([
      'Enter a schedule name',
    ]);
    expect(issues(newScheduleSchema, { name: 'x'.repeat(81), projectId: 'p' })).toEqual([
      'Use 80 characters or fewer',
    ]);
    expect(issues(newScheduleSchema, { name: 'Baseline', projectId: '' })).toEqual([
      'Choose a project',
    ]);
  });

  it('validates import files case-insensitively and by size', () => {
    const base = { name: 'Baseline', projectId: 'p' };
    expect(issues(importScheduleSchema, { ...base, file: null })).toEqual([
      'Choose a file to import',
    ]);
    expect(issues(importScheduleSchema, { ...base, file: new File(['x'], 'plan.pdf') })).toEqual([
      'Use a .xer, .xml or .csv file',
    ]);
    expect(
      issues(importScheduleSchema, { ...base, file: new File(['x'], 'BASELINE.XER') }),
    ).toEqual([]);
    const big = new File(['x'], 'big.xer');
    Object.defineProperty(big, 'size', { value: MAX_SCHEDULE_BYTES + 1 });
    expect(issues(importScheduleSchema, { ...base, file: big })).toEqual([
      'File must be 20 MB or smaller',
    ]);
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
});
