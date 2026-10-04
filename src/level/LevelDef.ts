import type { PickupKind } from '../player/Fuel';
import type { Dir } from '../puzzle/Direction';
import type { Grid, SlideMove } from '../puzzle/Grid';

export interface PickupDef {
  /** Position of the tile carrying the pickup in the *solved* board (`rows`). */
  x: number;
  y: number;
  kind: PickupKind;
}

/** Optional objectives. "reach the goal" is always implied. */
export type ObjectiveKind = 'noDeath' | 'allFuel' | 'underTime' | 'minFuel' | 'noBoost';

export interface ObjectiveDef {
  kind: ObjectiveKind;
  /** underTime: seconds elapsed; minFuel: fuel units remaining. */
  value?: number;
}

/**
 * A level is pure data.
 *
 * `rows` describe the SOLVED board (a complete route from the source to the
 * goal). `scramble` is a sequence of void moves applied to it to produce the
 * board the player starts from; the solution is the reverse sequence. The
 * board is a sliding puzzle: there is (at least) one void `..` and the player
 * slides an adjacent tile into it.
 *
 * Rows are space separated tokens:  <Kind><Rotation>[*]
 *
 *   Kind:      .. void   -- blank (solid tile without pipe, slides)
 *              I straight   C corner   T tee   X cross
 *              D cap (dead-end, bounces)   S source (flame start)   G goal
 *              W<rot><n> warp: a numbered pipe end; the flame entering warp n
 *              comes out of the other warp n (e.g. W31 opens West, number 1)
 *   Rotation:  0..3 quarter turns clockwise from the base orientation
 *              I0 = vertical, I1 = horizontal
 *              C0 = N+E (└)  C1 = E+S (┌)  C2 = S+W (┐)  C3 = W+N (┘)
 *              T0 = N+E+S (├) T1 = E+S+W (┬) T2 = S+W+N (┤) T3 = W+N+E (┴)
 *              D/S/G: 0 opens North, 1 East, 2 South, 3 West
 *   *          fixed tile (cannot slide)
 *
 * Scramble letters are void moves: U = the void moves up (the tile above
 * slides down), D = down, L = left, R = right.
 */
export interface LevelDef {
  id: number;
  name: string;
  width: number;
  height: number;
  /** Solved board. */
  rows: string[];
  /** Void moves applied to the solved board, e.g. "ULLD". Empty = already the start board. */
  scramble: string;
  /** Flame speed in tiles per second. */
  flameSpeed: number;
  /** The flame re-enters from the opposite edge when it leaves the board (default true). */
  wrap?: boolean;
  /** Survival time limit in seconds. */
  timeLimit: number;
  /** How many tiles ahead the flame's route is previewed. 0 disables. */
  lookahead: number;
  /** Base score for completing the level. */
  baseScore: number;
  /** Fuel the flame starts with (default FUEL_CONFIG.defaultInitialFuel). */
  initialFuel?: number;
  maxFuel?: number;
  /** Fuel burnt per tile travelled (default FUEL_CONFIG.defaultFuelPerTile). */
  fuelPerTile?: number;
  /** Fuel pickups, positioned on the solved board; they travel with their tile. */
  pickups?: PickupDef[];
  /** Objectives; when omitted a sensible default set is derived (see Objectives.ts). */
  objectives?: ObjectiveDef[];
  /** Optional one-line hint shown on the first levels. */
  hint?: string;
  tags?: string[];
  /** Optional generator seed, for information only. */
  seed?: number;
  /** Future extension points, kept as data. */
  hazards?: unknown[];
  specialTiles?: unknown[];
}

export interface StartInfo {
  x: number;
  y: number;
  dir: Dir;
}

export interface ParsedLevel {
  def: LevelDef;
  /** The board the player starts from (solved board + scramble). */
  grid: Grid;
  /** The solved board. */
  solvedGrid: Grid;
  start: StartInfo;
  goals: { x: number; y: number; dir: Dir }[];
  /** Slides that undo the scramble, in order (the intended solution). */
  solution: SlideMove[];
  pickupCount: number;
}
