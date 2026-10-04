import { dirDelta, dirIndex, indexDir } from './Direction';
import type { Grid } from './Grid';
import { predictPath } from './PathSim';
import { solve, type Solution } from './Solver';
import { tileMask } from './Tile';
import { FUEL_CONFIG, type PickupKind } from '../player/Fuel';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  solution: Solution | null;
  /** Steps the flame survives in the initial configuration before falling. */
  initialSafeSteps: number;
  /** Seconds the player has before the first wrong tile is reached (approx.). */
  reactionTime: number;
}

export interface ValidatorOptions {
  flameSpeed: number;
  /** Clicks per second a human can be expected to perform. */
  clicksPerSecond?: number;
  /** Fuel model; when provided the solution path is checked for fuel feasibility. */
  fuel?: { initial: number; max: number; perTile: number; pickups: { x: number; y: number; kind: PickupKind }[] };
}

/**
 * Checks that a level is well formed and can actually be completed.
 */
export function validateGrid(grid: Grid, opts: ValidatorOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cps = opts.clicksPerSecond ?? 2.5;

  const sources = grid.find('source');
  const goals = grid.find('goal');
  if (sources.length !== 1) errors.push(`expected exactly one source, found ${sources.length}`);
  if (goals.length < 1) errors.push('no goal tile');

  let solution: Solution | null = null;
  let initialSafeSteps = 0;
  let reactionTime = 0;

  if (sources.length === 1) {
    const s = sources[0];
    const startDir = indexDir(grid.get(s.x, s.y).rotation);
    const { dx, dy } = dirDelta(startDir);
    if (!grid.inBounds(s.x + dx, s.y + dy)) errors.push('source opens outside the board');
    else if (grid.get(s.x + dx, s.y + dy).kind === 'empty') errors.push('source opens onto water');

    for (const g of goals) {
      const gd = indexDir(grid.get(g.x, g.y).rotation);
      const d = dirDelta(gd);
      if (!grid.inBounds(g.x + d.dx, g.y + d.dy)) errors.push(`goal at (${g.x},${g.y}) opens outside the board`);
      else if (grid.get(g.x + d.dx, g.y + d.dy).kind === 'empty') errors.push(`goal at (${g.x},${g.y}) opens onto water`);
    }

    // Initial configuration: must not already win, must not die instantly.
    const initial = predictPath(grid, s.x, s.y, startDir, grid.width * grid.height * 4);
    initialSafeSteps = initial.steps.length;
    if (initial.end.type === 'goal') errors.push('the initial configuration already leads to the goal');
    if (initial.end.type === 'fall' && initial.steps.length === 0) errors.push('the flame falls immediately (first tile not connected)');
    if (initial.end.type === 'loop') warnings.push('initial configuration loops forever (relies on time limit)');
    reactionTime = initial.end.type === 'fall' ? (initial.steps.length + 0.5) / opts.flameSpeed : Infinity;

    // Solvability
    solution = solve(grid, s.x, s.y, startDir);
    if (!solution) {
      errors.push('no solution found');
    } else {
      if (solution.changes.length === 0) errors.push('solution requires no rotation (trivial level)');
      // Feasibility: cumulative clicks required before the flame reaches each tile.
      let cumulative = 0;
      for (const change of solution.changes) {
        const idx = solution.path.findIndex((p) => p.x === change.x && p.y === change.y);
        cumulative += change.clicks;
        const timeAvailable = (idx + 0.5) / opts.flameSpeed;
        if (cumulative > timeAvailable * cps + 1) {
          warnings.push(`tight timing: ${cumulative} clicks needed within ${timeAvailable.toFixed(1)}s at path index ${idx}`);
          break;
        }
      }
    }
  }

  // Pickups must sit on rotatable/pipe tiles, never on water, source or goal, never twice.
  if (opts.fuel) {
    const seen = new Set<string>();
    for (const p of opts.fuel.pickups) {
      const t = grid.tryGet(p.x, p.y);
      if (!t) errors.push(`pickup at (${p.x},${p.y}) is outside the board`);
      else if (t.kind === 'empty') errors.push(`pickup at (${p.x},${p.y}) is on water`);
      else if (t.kind === 'source' || t.kind === 'goal') errors.push(`pickup at (${p.x},${p.y}) is on the source/goal`);
      const k = `${p.x},${p.y}`;
      if (seen.has(k)) errors.push(`two pickups at (${p.x},${p.y})`);
      seen.add(k);
    }
    // Fuel feasibility along the cheapest solution: the flame must not run dry.
    if (solution) {
      let fuel = Math.min(opts.fuel.max, opts.fuel.initial);
      let ok = true;
      for (const step of solution.path) {
        fuel -= opts.fuel.perTile;
        if (fuel <= 0) {
          ok = false;
          break;
        }
        const pk = opts.fuel.pickups.find((q) => q.x === step.x && q.y === step.y);
        if (pk) {
          const v = FUEL_CONFIG.pickupFuel[pk.kind];
          fuel = v === null ? opts.fuel.max : Math.min(opts.fuel.max, fuel + v);
        }
      }
      if (!ok) errors.push('the flame runs out of fuel on the solution path');
      else if (fuel < opts.fuel.perTile * 2) warnings.push('fuel is very tight on the solution path');
    }
  }

  // Sanity: locked tiles that are not pipes should not exist etc.
  grid.forEach((t, x, y) => {
    if (t.kind !== 'empty' && tileMask(t) === 0) errors.push(`tile at (${x},${y}) has no connections`);
    if (t.kind === 'source' || t.kind === 'goal') {
      if (dirIndex(indexDir(t.rotation)) !== t.rotation) errors.push(`bad rotation at (${x},${y})`);
    }
  });

  return { ok: errors.length === 0, errors, warnings, solution, initialSafeSteps, reactionTime };
}
