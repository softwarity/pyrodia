import { evaluateObjectives, starsFor, type LevelOutcome, type ObjectiveResult } from '../level/Objectives';
import type { LevelDef } from '../level/LevelDef';

/**
 * Score formula. Everything is in one place so it can be tuned easily.
 *
 *   score = base + timeBonus + fuelBonus + lifeBonus + pickupBonus + perfectBonus
 */
export const SCORE_CONFIG = {
  /** Max bonus when the whole time limit remains; scales with the remaining ratio. */
  timeBonusMax: 1500,
  /** Max bonus with a full tank at the goal; scales with the remaining ratio. */
  fuelBonusMax: 800,
  /** Bonus per remaining life. */
  lifeBonusPerLife: 250,
  /** Bonus per fuel pickup collected for the first time on this level (not cumulative across replays). */
  pickupBonus: 150,
  /** Bonus for a perfect level (3 flames). */
  perfectBonus: 750,
  /** Embers earned: per completion, per flame, for a perfect. */
  embersPerCompletion: 1,
  embersPerStar: 1,
  embersPerfect: 3,
};

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  fuelBonus: number;
  lifeBonus: number;
  pickupBonus: number;
  perfectBonus: number;
  total: number;
  stars: number;
  objectives: ObjectiveResult[];
  embersEarned: number;
}

export function computeLevelScore(def: LevelDef, outcome: LevelOutcome, lives: number, maxFuel: number): ScoreBreakdown {
  const objectives = evaluateObjectives(def, outcome);
  const stars = starsFor(objectives, outcome.boostsUsed);
  const timeRatio = def.timeLimit > 0 ? clamp01(outcome.timeRemaining / def.timeLimit) : 0;
  const fuelRatio = maxFuel > 0 ? clamp01(outcome.fuelRemaining / maxFuel) : 0;
  const base = def.baseScore;
  const timeBonus = Math.round(SCORE_CONFIG.timeBonusMax * timeRatio);
  const fuelBonus = Math.round(SCORE_CONFIG.fuelBonusMax * fuelRatio);
  const lifeBonus = lives * SCORE_CONFIG.lifeBonusPerLife;
  const pickupBonus = outcome.newPickups * SCORE_CONFIG.pickupBonus;
  const perfectBonus = stars === 3 ? SCORE_CONFIG.perfectBonus : 0;
  const embersEarned = SCORE_CONFIG.embersPerCompletion + SCORE_CONFIG.embersPerStar * stars + (stars === 3 ? SCORE_CONFIG.embersPerfect : 0);
  return {
    base,
    timeBonus,
    fuelBonus,
    lifeBonus,
    pickupBonus,
    perfectBonus,
    total: base + timeBonus + fuelBonus + lifeBonus + pickupBonus + perfectBonus,
    stars,
    objectives,
    embersEarned,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function formatScore(n: number): string {
  return n.toLocaleString('en-US');
}
