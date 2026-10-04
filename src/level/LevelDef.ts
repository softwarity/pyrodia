import type { PickupKind } from '../player/Fuel';
import type { Dir } from '../puzzle/Direction';
import type { Grid } from '../puzzle/Grid';

export interface PickupDef {
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
 * A level is pure data. The grid is written as rows of space separated tokens:
 *
 *   <Kind><Rotation>[*]
 *
 *   Kind:      . empty   I straight   C corner   T tee   X cross
 *              D cap (dead-end)   S source (flame start)   G goal
 *   Rotation:  0..3 quarter turns clockwise from the base orientation
 *              I0 = vertical, I1 = horizontal
 *              C0 = N+E (└)  C1 = E+S (┌)  C2 = S+W (┐)  C3 = W+N (┘)
 *              T0 = N+E+S (├) T1 = E+S+W (┬) T2 = S+W+N (┤) T3 = W+N+E (┴)
 *              D/S/G: 0 opens North, 1 East, 2 South, 3 West
 *   *          locked (cannot be rotated by the player)
 *
 * Example 5x3:
 *   ".. .. .. .. .."
 *   "S1 I1 I0 I1 G3"
 *   ".. .. .. .. .."
 */
export interface LevelDef {
  id: number;
  name: string;
  width: number;
  height: number;
  rows: string[];
  /** Flame speed in tiles per second. */
  flameSpeed: number;
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
  /** Fuel pickups placed on pipe tiles. */
  pickups?: PickupDef[];
  /** Objectives; when omitted a sensible default set is derived (see Objectives.ts). */
  objectives?: ObjectiveDef[];
  /** Future extension points, kept as data. */
  hazards?: unknown[];
  specialTiles?: unknown[];
  /** Optional one-line hint shown on the first levels. */
  hint?: string;
  tags?: string[];
  /** Optional generator seed, for information only. */
  seed?: number;
}

export interface StartInfo {
  x: number;
  y: number;
  dir: Dir;
}

export interface ParsedLevel {
  def: LevelDef;
  grid: Grid;
  start: StartInfo;
  goals: { x: number; y: number; dir: Dir }[];
}
