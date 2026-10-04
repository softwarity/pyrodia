import type { PickupKind } from '../player/Fuel';
import { E, N, S, W, rotateMaskCW, type Mask } from './Direction';

/**
 * Tile kinds. A tile is "a connection mask + a behaviour tag" so new kinds
 * (wood, ice, oil...) can be added without touching the movement code.
 *
 * In the sliding (Blodia-style) model tiles never rotate during play: the
 * player slides a tile into the adjacent void. `rotation` is therefore part of
 * the level data only.
 */
export type TileKind =
  | 'empty' // the void: a hole in the board, water underneath
  | 'straight'
  | 'corner'
  | 'tee'
  | 'cross'
  | 'cap' // dead-end: the flame bounces back
  | 'warp' // numbered pipe: the flame comes out of the twin with the same number
  | 'source' // where the flame is born (fixed)
  | 'goal'; // where the flame must arrive (fixed)

export interface Tile {
  kind: TileKind;
  /** 0..3 quarter turns clockwise from the base orientation. */
  rotation: number;
  /** Fixed tiles cannot be slid by the player. */
  locked: boolean;
  /** Optional fuel pickup sitting in this pipe; it travels with the tile. */
  pickup?: PickupKind;
  /** Stable id of the pickup inside its level (for "collected once" tracking). */
  pickupId?: number;
  /** Warp number (1-9); two warps with the same number are linked. */
  warpId?: number;
}

/** Base connection masks at rotation 0. */
export const BASE_MASK: Record<TileKind, Mask> = {
  empty: 0,
  straight: N | S,
  corner: N | E,
  tee: N | E | S,
  cross: N | E | S | W,
  cap: N,
  warp: N,
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
  warp: 4,
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
  warp: 'W',
  source: 'S',
  goal: 'G',
};

export const CODE_KINDS: Record<string, TileKind> = Object.fromEntries(
  Object.entries(KIND_CODES).map(([k, v]) => [v, k as TileKind]),
) as Record<string, TileKind>;

export function makeTile(kind: TileKind, rotation = 0, locked = false, warpId?: number): Tile {
  const n = DISTINCT_ROTATIONS[kind];
  const r = ((rotation % 4) + 4) % 4;
  const t: Tile = { kind, rotation: n === 1 ? 0 : n === 2 ? r % 2 : r, locked: locked || kind === 'source' || kind === 'goal' || kind === 'empty' };
  if (kind === 'warp') t.warpId = warpId ?? 1;
  return t;
}

export function tileMask(tile: Tile): Mask {
  return rotateMaskCW(BASE_MASK[tile.kind], tile.rotation);
}

export function maskForKind(kind: TileKind, rotation: number): Mask {
  return rotateMaskCW(BASE_MASK[kind], rotation);
}

/** Can the player slide this tile into an adjacent void? */
export function isSlidable(tile: Tile): boolean {
  return tile.kind !== 'empty' && !tile.locked;
}

export function isPipe(tile: Tile): boolean {
  return tile.kind !== 'empty';
}

export function cloneTile(t: Tile): Tile {
  const c: Tile = { kind: t.kind, rotation: t.rotation, locked: t.locked };
  if (t.pickup) {
    c.pickup = t.pickup;
    c.pickupId = t.pickupId;
  }
  if (t.warpId !== undefined) c.warpId = t.warpId;
  return c;
}

/** One character per distinct tile shape, used to hash board arrangements. */
export function tileSymbol(t: Tile): string {
  const kindIndex = Object.keys(BASE_MASK).indexOf(t.kind);
  const code = 48 + kindIndex * 8 + t.rotation * 2 + (t.locked ? 1 : 0);
  return String.fromCharCode(code) + (t.warpId !== undefined ? String(t.warpId) : '');
}
