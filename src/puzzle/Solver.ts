import { dirDelta, opposite, type Dir } from './Direction';
import type { Grid } from './Grid';
import { chooseExit } from './PathSim';
import { DISTINCT_ROTATIONS, cwDistance, maskForKind, minRotationDistance } from './Tile';

export interface SolutionTile {
  x: number;
  y: number;
  rotation: number; // required rotation (0..3)
  clicks: number; // min clicks from current rotation (both directions allowed)
  cwClicks: number; // clicks if only clockwise is allowed
}

export interface Solution {
  /** Tiles the flame passes through, in order (excluding source, including goal). */
  path: { x: number; y: number; entry: Dir; exit: Dir }[];
  /** Tiles whose rotation must change (subset of path). */
  changes: SolutionTile[];
  totalClicks: number;
  totalCwClicks: number;
  /** Index in `path` of the first tile that needs a change (or -1). */
  firstChangeIndex: number;
}

export interface SolverOptions {
  /** Node budget: stops exploring after this many visited states. */
  budget?: number;
}

/**
 * Finds a simple path (no tile visited twice) from the source to a goal such
 * that every tile along the path can be rotated into an orientation where the
 * movement rule (straight > right > left) sends the flame along the path.
 *
 * It is a depth-first search over (cell, entry side, chosen rotation) and keeps
 * the solution with the fewest clicks found within the node budget.
 */
export function solve(grid: Grid, startX: number, startY: number, startDir: Dir, opts: SolverOptions = {}): Solution | null {
  const budget = opts.budget ?? 150_000;
  let visitedNodes = 0;
  let best: Solution | null = null;
  const onPath = new Set<number>();
  const path: { x: number; y: number; entry: Dir; exit: Dir }[] = [];
  const changes: SolutionTile[] = [];

  const key = (x: number, y: number) => y * grid.width + x;
  onPath.add(key(startX, startY));

  const record = () => {
    const totalClicks = changes.reduce((a, c) => a + c.clicks, 0);
    if (!best || totalClicks < best.totalClicks || (totalClicks === best.totalClicks && path.length < best.path.length)) {
      const firstChangeIndex = changes.length ? path.findIndex((p) => p.x === changes[0].x && p.y === changes[0].y) : -1;
      best = {
        path: path.map((p) => ({ ...p })),
        changes: changes.map((c) => ({ ...c })),
        totalClicks,
        totalCwClicks: changes.reduce((a, c) => a + c.cwClicks, 0),
        firstChangeIndex,
      };
    }
  };

  const dfs = (x: number, y: number, exit: Dir, clicksSoFar: number): void => {
    if (visitedNodes++ > budget) return;
    if (best && clicksSoFar >= best.totalClicks) return; // prune
    const { dx, dy } = dirDelta(exit);
    const nx = x + dx;
    const ny = y + dy;
    const tile = grid.tryGet(nx, ny);
    if (!tile || tile.kind === 'empty') return;
    const entry = opposite(exit);
    const k = key(nx, ny);
    if (onPath.has(k)) return;

    if (tile.kind === 'goal') {
      if (maskForKind('goal', tile.rotation) & entry) {
        path.push({ x: nx, y: ny, entry, exit: entry });
        record();
        path.pop();
      }
      return;
    }
    if (tile.kind === 'source' || tile.kind === 'cap') return;

    const nRot = DISTINCT_ROTATIONS[tile.kind];
    const rotations: number[] = tile.locked ? [tile.rotation] : [];
    if (!tile.locked) {
      // try cheapest rotations first
      for (let r = 0; r < nRot; r++) rotations.push(r);
      rotations.sort((a, b) => minRotationDistance(tile.kind, tile.rotation, a) - minRotationDistance(tile.kind, tile.rotation, b));
    }
    for (const r of rotations) {
      const mask = maskForKind(tile.kind, r);
      if (!(mask & entry)) continue;
      const nextExit = chooseExit(mask, entry);
      if (nextExit === null || nextExit === entry) continue;
      const clicks = tile.locked ? 0 : minRotationDistance(tile.kind, tile.rotation, r);
      const cw = tile.locked ? 0 : cwDistance(tile.kind, tile.rotation, r);
      onPath.add(k);
      path.push({ x: nx, y: ny, entry, exit: nextExit });
      if (clicks > 0) changes.push({ x: nx, y: ny, rotation: r, clicks, cwClicks: cw });
      dfs(nx, ny, nextExit, clicksSoFar + clicks);
      if (clicks > 0) changes.pop();
      path.pop();
      onPath.delete(k);
    }
  };

  dfs(startX, startY, startDir, 0);
  return best;
}
