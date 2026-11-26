// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  DriverReason,
  ScheduleActivity,
  ScheduleCalendar,
  ScheduleProfileId,
  ScheduleRelationship,
  ScheduleSettings,
  SolverWarning,
} from '@/data/schedule-types';
import { compileCalendar, type CompiledCalendar } from '@/engine/calendar';
import { runForwardPass } from '@/engine/cpm';
import { buildGraph } from '@/engine/graph';
import { resolveRules } from '@/engine/profiles';
import {
  makeActivity,
  makeDocument,
  makeRelationship,
  makeStandardCalendar,
} from '@/engine/testing';
import { toWallClock } from '@/engine/time';

interface ForwardFixtureCase {
  name: string;
  profile: ScheduleProfileId;
  calendars?: Array<'standard' | 'seven_day'>;
  settings?: Partial<ScheduleSettings>;
  activities: Array<Partial<ScheduleActivity> & { id: string; code: string }>;
  relationships: Array<
    Partial<ScheduleRelationship> & { predecessorId: string; successorId: string }
  >;
  expected: Record<string, { es: string; ef: string; driver: DriverReason['kind'] }>;
  warnings: Array<SolverWarning['code']>;
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'src/engine/__fixtures__/forward.json'), 'utf8'),
) as { cases: ForwardFixtureCase[] };

const SEVEN_DAY_PERIODS = [
  { start: 480, finish: 720 },
  { start: 780, finish: 1020 },
];

function buildCalendars(names: Array<'standard' | 'seven_day'> | undefined): ScheduleCalendar[] {
  const list = names ?? ['standard'];
  return list.map((name) =>
    name === 'seven_day'
      ? makeStandardCalendar('cal:7day', {
          name: 'Seven Day',
          week: Array.from({ length: 7 }, () => SEVEN_DAY_PERIODS.map((p) => ({ ...p }))),
          hoursPerWeek: 56,
        })
      : makeStandardCalendar('cal:standard'),
  );
}

describe('CPM forward pass', () => {
  for (const tc of fixture.cases) {
    it(tc.name, () => {
      const calendars = buildCalendars(tc.calendars);
      const doc = makeDocument({
        calendars,
        settings: {
          ...makeDocument().settings,
          profile: tc.profile,
          ...tc.settings,
        },
        activities: tc.activities.map((a) => makeActivity(a)),
        relationships: tc.relationships.map((r) => makeRelationship(r)),
      });

      const compiled = new Map<string, CompiledCalendar>();
      for (const cal of doc.calendars) {
        const res = compileCalendar(cal);
        if ('code' in res) throw new Error(res.message);
        compiled.set(cal.id, res);
      }

      const graphRes = buildGraph(doc);
      expect(graphRes.ok).toBe(true);
      if (!graphRes.ok) return;

      const rules = resolveRules(doc.settings.profile, doc.settings.ruleOverrides);
      const forward = runForwardPass(doc, graphRes.graph, compiled, rules);

      for (const [id, exp] of Object.entries(tc.expected)) {
        const idx = graphRes.graph.indexById.get(id)!;
        expect(toWallClock(forward.es[idx]!), `${tc.name}.${id}.es`).toBe(exp.es);
        expect(toWallClock(forward.ef[idx]!), `${tc.name}.${id}.ef`).toBe(exp.ef);
        expect(forward.drivers[idx]!.kind, `${tc.name}.${id}.driver`).toBe(exp.driver);
      }

      expect(forward.warnings.map((w) => w.code)).toEqual(tc.warnings);
    });
  }
});
