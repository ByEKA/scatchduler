import type {
  RelationshipType,
  ScheduleActivity,
  ScheduleRelationship,
} from '@/data/schedule-types';

export interface ParsedPredecessor {
  code: string;
  type: RelationshipType;
  lagMinutes: number;
  lagElapsed: boolean;
}

const VALID_TYPES = new Set<RelationshipType>(['FS', 'SS', 'FF', 'SF']);
const DURATION_RE = /^(-)?\s*(\d+(?:\.\d+)?)\s*(d|h)?$/i;
const SPACED_TOKEN_RE =
  /^([^\s+]+)(?:\s+(FS|SS|FF|SF))?(?:\s*([+-])\s*(\d+(?:\.\d+)?)\s*(ed|eh|d|h)?)?$/i;
const COMPACT_TOKEN_RE =
  /^([^\s+]+?)(FS|SS|FF|SF)\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(ed|eh|d|h)?)?$/i;

function lagToMinutes(
  sign: string | undefined,
  amountStr: string | undefined,
  unitStr: string | undefined,
  hoursPerDay: number,
): { lagMinutes: number; lagElapsed: boolean } {
  if (!sign || !amountStr) return { lagMinutes: 0, lagElapsed: false };
  const amount = Number.parseFloat(amountStr);
  const direction = sign === '-' ? -1 : 1;
  const unit = (unitStr ?? 'd').toLowerCase();
  const hpd = hoursPerDay > 0 ? hoursPerDay : 8;

  if (unit === 'ed') {
    const mins = Math.round(amount * 1440) * direction;
    return { lagMinutes: mins === 0 ? 0 : mins, lagElapsed: true };
  }
  if (unit === 'eh') {
    const mins = Math.round(amount * 60) * direction;
    return { lagMinutes: mins === 0 ? 0 : mins, lagElapsed: true };
  }
  if (unit === 'h') {
    const mins = Math.round(amount * 60) * direction;
    return { lagMinutes: mins === 0 ? 0 : mins, lagElapsed: false };
  }
  const mins = Math.round(amount * hpd * 60) * direction;
  return { lagMinutes: mins === 0 ? 0 : mins, lagElapsed: false };
}

/**
 * Parses comma- or semicolon-separated predecessor shorthand tokens such as
 * `A1000`, `A1010 SS+2d`, `A1020 FF-4h`, `A1030 FS+2ed` (spec §7.2).
 */
export function parsePredecessorCell(
  text: string,
  options: { hoursPerDay: number },
): { ok: true; items: ParsedPredecessor[] } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, items: [] };

  const rawTokens = trimmed
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const items: ParsedPredecessor[] = [];
  for (const token of rawTokens) {
    // Reject obvious spaces with non-relationship tokens.
    const spaced = SPACED_TOKEN_RE.exec(token);
    if (spaced) {
      const code = spaced[1]!;
      const rawType = spaced[2]?.toUpperCase() as RelationshipType | undefined;
      const sign = spaced[3];
      const amount = spaced[4];
      const unit = spaced[5];

      // If no type and no lag matched via whitespace, check compact form like A1010SS+2d (only when lag present).
      if (!rawType && !sign) {
        const compact = COMPACT_TOKEN_RE.exec(token);
        if (compact && compact[3]) {
          const cType = compact[2]!.toUpperCase() as RelationshipType;
          const lag = lagToMinutes(compact[3], compact[4], compact[5], options.hoursPerDay);
          items.push({ code: compact[1]!, type: cType, ...lag });
          continue;
        }
      }

      const relType: RelationshipType = rawType && VALID_TYPES.has(rawType) ? rawType : 'FS';
      const lag = lagToMinutes(sign, amount, unit, options.hoursPerDay);
      items.push({ code, type: relType, ...lag });
      continue;
    }

    return {
      ok: false,
      error: `Invalid predecessor "${token}". Use e.g. A1010 or A1020 SS+2d.`,
    };
  }

  return { ok: true, items };
}

function formatLagShort(lagMinutes: number, lagElapsed: boolean, hoursPerDay: number): string {
  if (lagMinutes === 0) return '';
  const sign = lagMinutes > 0 ? '+' : '-';
  const absMin = Math.abs(lagMinutes);
  if (lagElapsed) {
    const ed = absMin / 1440;
    const rounded = Math.round(ed * 10) / 10;
    if (Math.abs(rounded * 1440 - absMin) < 1e-6) {
      const val = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
      return `${sign}${val}ed`;
    }
    const eh = absMin / 60;
    const roundedH = Math.round(eh * 10) / 10;
    return `${sign}${Number.isInteger(roundedH) ? String(roundedH) : roundedH.toFixed(1)}eh`;
  }
  const dayMin = (hoursPerDay > 0 ? hoursPerDay : 8) * 60;
  if (absMin >= dayMin && absMin % dayMin === 0) {
    return `${sign}${absMin / dayMin}d`;
  }
  if (absMin < dayMin && absMin % 60 === 0) {
    return `${sign}${absMin / 60}h`;
  }
  const days = absMin / dayMin;
  const roundedDays = Math.round(days * 10) / 10;
  if (Math.abs(roundedDays * dayMin - absMin) < 1e-6) {
    return `${sign}${Number.isInteger(roundedDays) ? String(roundedDays) : roundedDays.toFixed(1)}d`;
  }
  const hours = absMin / 60;
  const roundedHours = Math.round(hours * 10) / 10;
  return `${sign}${Number.isInteger(roundedHours) ? String(roundedHours) : roundedHours.toFixed(1)}h`;
}

/** Formats an activity's incoming relationships into shorthand cell text (`A1000, A1010 SS+2d`). */
export function formatPredecessorCell(
  relationships: readonly ScheduleRelationship[],
  activityId: string,
  activitiesById: ReadonlyMap<string, ScheduleActivity>,
  hoursPerDay: number,
): string {
  const parts: string[] = [];
  for (const rel of relationships) {
    if (rel.successorId !== activityId) continue;
    const pred = activitiesById.get(rel.predecessorId);
    if (!pred) continue;
    const lag = formatLagShort(rel.lagMinutes, rel.lagElapsed, hoursPerDay);
    if (rel.type === 'FS' && lag === '') {
      parts.push(pred.code);
    } else {
      parts.push(`${pred.code} ${rel.type}${lag}`);
    }
  }
  return parts.join(', ');
}

/** Parses inline duration text (`5`, `5d`, `2.5 d`, `16h`) into working minutes. */
export function parseDurationInput(
  text: string,
  hoursPerDay: number,
): { ok: true; minutes: number } | { ok: false; error: string } {
  const match = DURATION_RE.exec(text.trim());
  if (!match) {
    return { ok: false, error: 'Enter a valid duration, such as 5d or 16h.' };
  }
  if (match[1] === '-') {
    return { ok: false, error: "Duration can't be negative." };
  }
  const amount = Number.parseFloat(match[2]!);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Duration can't be negative." };
  }
  const unit = (match[3] ?? 'd').toLowerCase();
  const hpd = hoursPerDay > 0 ? hoursPerDay : 8;
  const minutes = unit === 'h' ? Math.round(amount * 60) : Math.round(amount * hpd * 60);
  return { ok: true, minutes };
}
