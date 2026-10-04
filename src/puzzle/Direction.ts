/**
 * Directions are encoded as a 4-bit mask so that a tile's connections can be
 * stored in a single number and rotated with bit operations.
 *
 *   N = 0001, E = 0010, S = 0100, W = 1000
 */
export const N = 1 as const;
export const E = 2 as const;
export const S = 4 as const;
export const W = 8 as const;

export type Dir = typeof N | typeof E | typeof S | typeof W;
export type Mask = number;

export const DIRS: readonly Dir[] = [N, E, S, W];

export const DIR_NAMES: Record<Dir, string> = { 1: 'N', 2: 'E', 4: 'S', 8: 'W' };

/** Opposite side (N <-> S, E <-> W). */
export function opposite(d: Dir): Dir {
  return (((d << 2) | (d >> 2)) & 0xf) as Dir;
}

/** Clockwise neighbour direction (N -> E -> S -> W -> N). */
export function turnRight(d: Dir): Dir {
  return (((d << 1) | (d >> 3)) & 0xf) as Dir;
}

/** Counter-clockwise neighbour direction (N -> W -> S -> E -> N). */
export function turnLeft(d: Dir): Dir {
  return (((d >> 1) | (d << 3)) & 0xf) as Dir;
}

/** Rotate a connection mask clockwise `times` quarter turns. */
export function rotateMaskCW(mask: Mask, times = 1): Mask {
  let m = mask & 0xf;
  const t = ((times % 4) + 4) % 4;
  for (let i = 0; i < t; i++) {
    m = ((m << 1) | (m >> 3)) & 0xf;
  }
  return m;
}

export function dirDelta(d: Dir): { dx: number; dy: number } {
  switch (d) {
    case N:
      return { dx: 0, dy: -1 };
    case E:
      return { dx: 1, dy: 0 };
    case S:
      return { dx: 0, dy: 1 };
    default:
      return { dx: -1, dy: 0 };
  }
}

export function dirIndex(d: Dir): number {
  return d === N ? 0 : d === E ? 1 : d === S ? 2 : 3;
}

export function indexDir(i: number): Dir {
  return DIRS[((i % 4) + 4) % 4];
}

export function maskToDirs(mask: Mask): Dir[] {
  return DIRS.filter((d) => (mask & d) !== 0);
}

export function maskCount(mask: Mask): number {
  let c = 0;
  for (const d of DIRS) if (mask & d) c++;
  return c;
}
