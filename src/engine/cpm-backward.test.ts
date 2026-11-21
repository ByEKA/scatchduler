// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ScheduleActivity,
  ScheduleProfileId,
  ScheduleRelationship,
  ScheduleSettings,
  SolverWarning,
} from '@/data/schedule-types';
import { compileCalendar, type CompiledCalendar } from '@/engine/calendar';
import { runBackwardPass, runForwardPass, runPostPasses } from '@/engine/cpm';
import { buildGraph } from '@/engine/graph';
import { resolveRules } from '@/engine/profiles';
import { makeActivity, makeDocument, makeRelationship, makeStandardCalendar } from '@/engine/testing';
import { toWallClock } from '@/engine/time';

interface BackwardFixtureCase {
  name: string;
  profile: ScheduleProfileId;
  settings?: Partial<ScheduleSettings>;
  activities: Array<Partial<ScheduleActivity> & { id: string; code: string }>;
  relationships: Array<Partial<ScheduleRelationship> & { predecessorId: string; successorId: string }>;
  expected: Record<string, { es: string; ef: string; ls: string; lf: string }>;
  warnings: Array<SolverWarning['code']>;
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'src/engine/__fixtures__/backward.json'), 'utf8'),
) as { cases: BackwardFixtureCase[] };

describe('CPM backward pass, ALAP and LOE', () => {
  for (const tc of fixture.cases) {
    it(tc.name, () => {
      const doc = makeDocument({
        calendars: [makeStandardCalendar('cal:standard')],
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
      const backward = runBackwardPass(doc, graphRes.graph, compiled, rules, forward);
      runPostPasses(doc, graphRes.graph, compiled, rules, forward, backward);

      for (const [id, exp] of Object.entries(tc.expected)) {
        const idx = graphRes.graph.indexById.get(id)!;
        expect(toWallClock(forward.es[idx]!), `${tc.name}.${id}.es`).toBe(exp.es);
        expect(toWallClock(forward.ef[idx]!), `${tc.name}.${id}.ef`).toBe(exp.ef);
        expect(toWallClock(backward.ls[idx]!), `${tc.name}.${id}.ls`).toBe(exp.ls);
        expect(toWallClock(backward.lf[idx]!), `${tc.name}.${id}.lf`).toBe(exp.lf);
      }

      const allWarnings = [...forward.warnings, ...backward.warnings];
      expect(allWarnings.map((w) => w.code)).toEqual(tc.warnings);
    });
  }
});
