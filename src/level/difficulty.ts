/**
 * Difficulty curve for generated levels. Pure functions of the level number so
 * the curve can be tuned in one place.
 */
export interface DifficultyProfile {
  width: number;
  height: number;
  difficulty: number; // 0..1 passed to the generator
  flameSpeed: number;
  lookahead: number;
  baseScore: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

export const FIRST_GENERATED_LEVEL = 13;
export const LAST_LEVEL = 100;

export function difficultyFor(id: number): DifficultyProfile {
  const t = (id - FIRST_GENERATED_LEVEL) / (LAST_LEVEL - FIRST_GENERATED_LEVEL);
  let width: number;
  let height: number;
  let lookahead: number;
  if (id <= 25) {
    width = id <= 16 ? 5 : 6;
    height = id <= 16 ? 4 : 5;
    lookahead = 3;
  } else if (id <= 50) {
    width = id <= 38 ? 6 : 7;
    height = id <= 38 ? 5 : 5;
    lookahead = 3;
  } else if (id <= 75) {
    width = id <= 63 ? 7 : 8;
    height = 6;
    lookahead = 2;
  } else {
    width = id <= 88 ? 8 : 9;
    height = id <= 88 ? 6 : 7;
    lookahead = id <= 88 ? 2 : 1;
  }
  return {
    width,
    height,
    difficulty: t,
    flameSpeed: Number(lerp(0.7, 1.6, t).toFixed(2)),
    lookahead,
    baseScore: 500 + id * 50,
  };
}
