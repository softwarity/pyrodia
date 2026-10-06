import type { LevelDef, ObjectiveDef } from './LevelDef';

export interface LevelOutcome {
  elapsed: number;
  timeRemaining: number;
  fuelRemaining: number;
  deathsThisLevel: number;
  pickupsCollected: number;
  pickupsTotal: number;
  /** Pickups never collected on a previous attempt (the only ones that grant rewards). */
  newPickups: number;
  boostsUsed: number;
  /** Pipe segments the flame travelled through (Blodia 'cover' levels). */
  segmentsCovered?: number;
  /** Solution tiers bought on this attempt. */
  hintsUsed?: number;
}

export interface ObjectiveResult {
  def: ObjectiveDef;
  label: string;
  met: boolean;
}

/** Default objectives when a level does not list its own. */
export function objectivesFor(def: LevelDef): ObjectiveDef[] {
  if (def.objectives) return def.objectives;
  const list: ObjectiveDef[] = [{ kind: 'noDeath' }];
  if (def.pickups && def.pickups.length > 0) list.push({ kind: 'allFuel' });
  // "fast" = finish while at least 40% of the time limit remains
  if (def.timeLimit > 0) list.push({ kind: 'underTime', value: Math.round(def.timeLimit * 0.6) });
  return list;
}

export function objectiveLabel(o: ObjectiveDef): string {
  switch (o.kind) {
    case 'noDeath':
      return 'No death';
    case 'allFuel':
      return 'Collect all fuel';
    case 'underTime':
      return `Finish under ${o.value ?? 0}s`;
    case 'minFuel':
      return `Finish with ${o.value ?? 0}+ fuel`;
    case 'noBoost':
      return 'No ember boost';
  }
}

export function evaluateObjectives(def: LevelDef, outcome: LevelOutcome): ObjectiveResult[] {
  return objectivesFor(def).map((o) => {
    let met = false;
    switch (o.kind) {
      case 'noDeath':
        met = outcome.deathsThisLevel === 0;
        break;
      case 'allFuel':
        met = outcome.pickupsCollected >= outcome.pickupsTotal;
        break;
      case 'underTime':
        met = outcome.elapsed <= (o.value ?? Infinity);
        break;
      case 'minFuel':
        met = outcome.fuelRemaining >= (o.value ?? 0);
        break;
      case 'noBoost':
        met = outcome.boostsUsed === 0;
        break;
    }
    return { def: o, label: objectiveLabel(o), met };
  });
}

/**
 * 3 flames = PERFECT (every objective met, no boost used)
 * 2 flames = EXCELLENT (at least half of the objectives)
 * 1 flame  = COMPLETED
 */
export function starsFor(results: ObjectiveResult[], boostsUsed: number): number {
  if (results.length === 0) return boostsUsed === 0 ? 3 : 2;
  const met = results.filter((r) => r.met).length;
  if (met === results.length && boostsUsed === 0) return 3;
  if (met * 2 >= results.length) return 2;
  return 1;
}
