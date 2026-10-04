import { E, N, S, W, rotateMaskCW, type Mask } from './Direction';

/**
 * Tile kinds. Special kinds are designed so that new ones (wood, ice, oil...)
 * can be added later without touching the core movement code: a tile is
 * fundamentally "a connection mask + a behaviour tag".
 */
export type TileKind =
  | 'empty' // no pipe: water underneath
  | 'straight'
  | 'corner'
  | 'tee'
  | 'cross'
  | 'cap' // dead-end: the flame bounces back
  | 'source' // where the flame is born (locked)
  | 'goal'; // where the flame must arrive (locked)

export interface Tile {
  kind: TileKind;
  /** 0..3 quarter turns clockwise from the base orientation. */
  rotation: number;
  /** Locked tiles cannot be rotated by the player. */
  locked: boolean;
}

/** Base connection masks at rotation 0. */
export const BASE_MASK: Record<TileKind, Mask> = {
  empty: 0,
  straight: N | S,
  corner: N | E,
  tee: N | E | S,
  cross: N | E | S | W,
  cap: N,
  source: N,
  goal: N,
};

/** How many visually distinct rotations a tile kind has. */
export const DISTINCT_ROTATIONS: Record<TileKind, number> = {
  empty: 1,
  straight: 2,
  corner: 4,
  tee: 4,
  cross: 1,
  cap: 4,
  source: 4,
  goal: 4,
};

export const KIND_CODES: Record<TileKind, string> = {
  empty: '.',
  straight: 'I',
  corner: 'C',
  tee: 'T',
  cross: 'X',
  cap: 'D',
  source: 'S',
  goal: 'G',
};

export const CODE_KINDS: Record<string, TileKind> = Object.fromEntries(
  Object.entries(KIND_CODES).map(([k, v]) => [v, k as TileKind]),
) as Record<string, TileKind>;

export function makeTile(kind: TileKind, rotation = 0, locked = false): Tile {
  return { kind, rotation: ((rotation % 4) + 4) % 4, locked: locked || kind === 'source' || kind === 'goal' || kind === 'empty' };
}

export function tileMask(tile: Tile): Mask {
  return rotateMaskCW(BASE_MASK[tile.kind], tile.rotation);
}

export function maskForKind(kind: TileKind, rotation: number): Mask {
  return rotateMaskCW(BASE_MASK[kind], rotation);
}

export function isRotatable(tile: Tile): boolean {
  return !tile.locked && DISTINCT_ROTATIONS[tile.kind] > 1;
}

export function isPipe(tile: Tile): boolean {
  return tile.kind !== 'empty';
}

export function cloneTile(t: Tile): Tile {
  return { kind: t.kind, rotation: t.rotation, locked: t.locked };
}

/** Number of clockwise clicks to go from rotation a to rotation b for this kind. */
export function cwDistance(kind: TileKind, from: number, to: number): number {
  const n = DISTINCT_ROTATIONS[kind];
  if (n <= 1) return 0;
  return (((to - from) % n) + n) % n;
}

/** Minimum clicks if both directions are allowed. */
export function minRotationDistance(kind: TileKind, from: number, to: number): number {
  const n = DISTINCT_ROTATIONS[kind];
  if (n <= 1) return 0;
  const cw = cwDistance(kind, from, to);
  return Math.min(cw, n - cw);
}
