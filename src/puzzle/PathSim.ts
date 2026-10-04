import { indexDir, opposite, turnLeft, turnRight, type Dir, type Mask } from './Direction';
import type { Grid } from './Grid';

/**
 * The single rule that decides where the flame goes when it enters a tile.
 *
 *   1. straight ahead if possible
 *   2. otherwise turn right (clockwise)
 *   3. otherwise turn left
 *   4. otherwise bounce back (dead-end / cap)
 *
 * `entry` is the side of the tile the flame came in through.
 * Shared by the live flame, the lookahead preview and the solver so that all
 * three always agree.
 */
export function chooseExit(mask: Mask, entry: Dir): Dir | null {
  const heading = opposite(entry);
  if (mask & heading) return heading;
  const r = turnRight(heading);
  if (mask & r) return r;
  const l = turnLeft(heading);
  if (mask & l) return l;
  if (mask & entry) return entry;
  return null;
}

export interface PathStep {
  x: number;
  y: number;
  entry: Dir;
  exit: Dir;
  /** True when the flame did not arrive from the adjacent tile (board wrap or warp). */
  wrapped?: boolean;
}

export type PathEnd =
  | { type: 'goal'; x: number; y: number }
  | { type: 'fall'; x: number; y: number; dir: Dir } // leaves tile (x,y) through `dir` into nothing
  | { type: 'limit' } // stopped after maxSteps
  | { type: 'loop' }; // came back to a previously visited (cell, entry) state

export interface PathPrediction {
  steps: PathStep[];
  end: PathEnd;
}

/**
 * Simulate the flame through the grid as it is *now*, starting from tile (x,y)
 * which the flame leaves through `exit`. Stops at goal, fall, loop, or maxSteps.
 */
export function predictPath(grid: Grid, x: number, y: number, exit: Dir, maxSteps: number): PathPrediction {
  const steps: PathStep[] = [];
  const seen = new Set<string>();
  let cx = x;
  let cy = y;
  let cexit = exit;
  for (let i = 0; i < maxSteps; i++) {
    const next = grid.step(cx, cy, cexit);
    const entry = opposite(cexit);
    if (!next) return { steps, end: { type: 'fall', x: cx, y: cy, dir: cexit } };
    const { x: nx, y: ny } = next;
    const wrapped = Math.abs(nx - cx) + Math.abs(ny - cy) !== 1;
    const tile = grid.get(nx, ny);
    const mask = grid.maskAt(nx, ny);
    if (!(mask & entry)) return { steps, end: { type: 'fall', x: cx, y: cy, dir: cexit } };
    if (tile.kind === 'goal') {
      steps.push({ x: nx, y: ny, entry, exit: entry, wrapped });
      return { steps, end: { type: 'goal', x: nx, y: ny } };
    }
    const key = `${nx},${ny},${entry}`;
    if (seen.has(key)) return { steps, end: { type: 'loop' } };
    seen.add(key);
    if (tile.kind === 'warp') {
      const pair = grid.warpPair(nx, ny);
      if (pair) {
        // in: entry side to the centre; out: centre of the twin to its opening
        steps.push({ x: nx, y: ny, entry, exit: entry, wrapped });
        const out = indexDir(grid.get(pair.x, pair.y).rotation);
        const pkey = `${pair.x},${pair.y},out`;
        if (seen.has(pkey)) return { steps, end: { type: 'loop' } };
        seen.add(pkey);
        steps.push({ x: pair.x, y: pair.y, entry: out, exit: out, wrapped: true });
        cx = pair.x;
        cy = pair.y;
        cexit = out;
        continue;
      }
    }
    const nextExit = chooseExit(mask, entry);
    if (nextExit === null) return { steps, end: { type: 'fall', x: cx, y: cy, dir: cexit } };
    steps.push({ x: nx, y: ny, entry, exit: nextExit, wrapped });
    cx = nx;
    cy = ny;
    cexit = nextExit;
  }
  return { steps, end: { type: 'limit' } };
}
