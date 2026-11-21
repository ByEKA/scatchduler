import { describe, expect, it } from 'vitest';
import {
  decodeScheduleDocument,
  encodeScheduleDocument,
  MAX_SCHEDULE_DATA_BYTES,
  SCHEDULE_DATA_BUCKET,
  SCHEDULE_DATA_MIME,
  ScheduleCodecError,
  scheduleDataPath,
} from '@/data/schedule-codec';
import type { ScheduleDocument } from '@/data/schedule-types';

const sampleDoc: ScheduleDocument = {
  schemaVersion: 1,
  sourceFormat: 'xer',
  settings: {
    profile: 'p6',
    ruleOverrides: {},
    progressMode: 'retained_logic',
    displayMode: 'as_imported',
    lagCalendar: 'predecessor',
    criticalDefinition: 'total_float',
    criticalThresholdMinutes: 0,
    nearCriticalThresholdMinutes: 4800,
    projectStart: '2026-01-05T08:00',
    mustFinishBy: null,
    statusDate: '2026-01-05T08:00',
    defaultCalendarId: 'cal:1',
    autoCalculate: false,
  },
  calendars: [],
  wbs: [],
  activities: [],
  relationships: [],
  computed: null,
};

describe('schedule-codec', () => {
  it('round-trips a ScheduleDocument through gzipped JSON', async () => {
    const blob = await encodeScheduleDocument(sampleDoc);
    expect(blob.type).toBe(SCHEDULE_DATA_MIME);
    expect(blob.size).toBeGreaterThan(20);
    expect(await decodeScheduleDocument(blob)).toEqual(sampleDoc);
  });

  it('rejects corrupt gzip bytes or malformed JSON shape with code corrupt', async () => {
    await expect(decodeScheduleDocument(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({
      name: 'ScheduleCodecError',
      code: 'corrupt',
    });
    const { gzipSync } = await import('fflate');
    const badShape = gzipSync(new TextEncoder().encode(JSON.stringify({ schemaVersion: 1 })));
    await expect(decodeScheduleDocument(badShape)).rejects.toMatchObject({
      name: 'ScheduleCodecError',
      code: 'corrupt',
    });
  });

  it('rejects unknown schemaVersion with unsupported_version', async () => {
    const { gzipSync } = await import('fflate');
    const bad = gzipSync(
      new TextEncoder().encode(JSON.stringify({ ...sampleDoc, schemaVersion: 99 })),
    );
    await expect(decodeScheduleDocument(bad)).rejects.toMatchObject({
      name: 'ScheduleCodecError',
      code: 'unsupported_version',
    });
  });

  it('formats R8 snapshot paths and exports bucket constants', () => {
    expect(SCHEDULE_DATA_BUCKET).toBe('schedule-data');
    expect(MAX_SCHEDULE_DATA_BYTES).toBe(20_971_520);
    const path = scheduleDataPath(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    );
    expect(path).toBe(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.json.gz',
    );
    expect(new ScheduleCodecError('corrupt', 'bad')).toBeInstanceOf(Error);
  });
});
