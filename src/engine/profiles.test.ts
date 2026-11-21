// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROFILE_DEFAULTS, resolveRules } from '@/engine/profiles';

describe('profiles', () => {
  it('resolves exact P6, MSP and default rule tables (spec §5.1)', () => {
    expect(resolveRules('p6')).toMatchObject({
      statusDateFloorForUnstarted: true,
      inProgressResumeMode: 'p6_remaining_from_status',
      completedLateDates: 'keep_actuals',
      ssLagFromInProgress: 'remaining_from_actual_start',
      completedPredLag: 'unelapsed_only',
      totalFloatFormula: 'finish_float',
      freeFloatFloorZero: true,
      finishMilestoneOnPredFinish: false,
      alapBehavior: 'within_free_float',
      progressOverrideLateSide: 'ignore_link_to_started',
      defaultLagCalendar: 'predecessor',
    });
    expect(resolveRules('msp')).toMatchObject({
      statusDateFloorForUnstarted: false,
      inProgressResumeMode: 'msp_latest_of_status_logic_elapsed',
      completedLateDates: 'recalculate',
      ssLagFromInProgress: 'from_start',
      completedPredLag: 'full',
      totalFloatFormula: 'min_start_finish',
      freeFloatFloorZero: false,
      finishMilestoneOnPredFinish: true,
      alapBehavior: 'to_late_dates',
      progressOverrideLateSide: 'keep_late_logic',
      defaultLagCalendar: 'successor',
    });
    expect(resolveRules('default')).toEqual(PROFILE_DEFAULTS.p6);
  });

  it('merges explicit ProfileRuleOverrides without mutating defaults', () => {
    const custom = resolveRules('p6', {
      totalFloatFormula: 'min_start_finish',
      freeFloatFloorZero: false,
      statusDateFloorForUnstarted: undefined,
    });
    expect(custom.totalFloatFormula).toBe('min_start_finish');
    expect(custom.freeFloatFloorZero).toBe(false);
    expect(custom.statusDateFloorForUnstarted).toBe(true);
    expect(PROFILE_DEFAULTS.p6.totalFloatFormula).toBe('finish_float');
  });

  it('guarantees solver modules never branch on profile or sourceFormat directly', () => {
    const dir = join(process.cwd(), 'src/engine');
    const solverFiles = readdirSync(dir).filter((f) => /^(cpm|graph|rollup|driving)\.ts$/.test(f));
    for (const file of solverFiles) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/\.profile\b|\.sourceFormat\b|=== ['"](p6|msp|xer|mspdi)['"]/);
    }
  });
});
