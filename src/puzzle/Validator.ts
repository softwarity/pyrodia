import { FUEL_CONFIG } from '../player/Fuel';
import { dirDelta, indexDir } from './Direction';
import type { Grid, SlideMove } from './Grid';
import { predictPath, type PathStep } from './PathSim';
import { solve, type Solution } from './Solver';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Shortest solution found by the solver (may be null when only the known solution was verified). */
  solution: Solution | null;
  /** Number of slides of the intended (known) solution, or of the solver's. */
  movesNeeded: number;
  /** Flame route on the solved arrangement. */
  route: PathStep[];
  /** Steps the flame survives in the initial configuration before falling. */
  initialSafeSteps: number;
  /** Seconds before the flame reaches the first break (Infinity when it loops). */
  reactionTime: number;
}

export interface ValidatorOptions {
  flameSpeed: number;
  /** The intended solution (reverse scramble) when known. */
  knownSolution?: SlideMove[];
  /** Solver limits. */
  maxDepth?: number;
  budget?: number;
  /** Fuel model; when provided the route is checked for fuel feasibility. */
  fuel?: { initial: number; max: number; perTile: number };
  /** Slides per second a human can be expected to perform. */
  movesPerSecond?: number;
}

/** Checks that a sliding-puzzle level is well formed and can actually be completed. */
export function validateGrid(grid: Grid, opts: ValidatorOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mps = opts.movesPerSecond ?? 2;
  let solution: Solution | null = null;
  let route: PathStep[] = [];
  let movesNeeded = 0;
  let initialSafeSteps = 0;
  let reactionTime = 0;

  const sources = grid.find('source');
  const goals = grid.find('goal');
  const voids = grid.voids();
  if (sources.length !== 1) errors.push(`expected exactly one source, found ${sources.length}`);
  if (goals.length < 1) errors.push('no goal tile');
  if (voids.length < 1) errors.push('no void: nothing can slide');

  grid.forEach((t, x, y) => {
    if (t.pickup && (t.kind === 'empty' || t.kind === 'source' || t.kind === 'goal')) {
      errors.push(`pickup on a ${t.kind} tile at (${x},${y})`);
    }
  });

  if (sources.length === 1 && goals.length >= 1) {
    const s = sources[0];
    const startDir = indexDir(grid.get(s.x, s.y).rotation);
    const { dx, dy } = dirDelta(startDir);
    if (!grid.inBounds(s.x + dx, s.y + dy)) errors.push('source opens outside the board');
    for (const g of goals) {
      const d = dirDelta(indexDir(grid.get(g.x, g.y).rotation));
      if (!grid.inBounds(g.x + d.dx, g.y + d.dy)) errors.push(`goal at (${g.x},${g.y}) opens outside the board`);
    }

    const maxSteps = grid.width * grid.height * 4;
    const initial = predictPath(grid, s.x, s.y, startDir, maxSteps);
    initialSafeSteps = initial.steps.length;
    if (initial.end.type === 'goal') errors.push('the initial configuration already leads to the goal');
    if (initial.end.type === 'fall' && initial.steps.length === 0) errors.push('the flame falls immediately (first tile not connected)');
    if (initial.end.type === 'loop') warnings.push('initial configuration loops forever (relies on time limit)');
    reactionTime = initial.end.type === 'fall' ? (initial.steps.length + 0.5) / opts.flameSpeed : Infinity;

    // 1. verify the known solution if any
    if (opts.knownSolution && opts.knownSolution.length > 0) {
      const g = grid.clone();
      let legal = true;
      for (const mv of opts.knownSolution) {
        const target = g.slide(mv.from.x, mv.from.y);
        if (!target || target.x !== mv.to.x || target.y !== mv.to.y) {
          legal = false;
          break;
        }
      }
      const p = legal ? predictPath(g, s.x, s.y, startDir, maxSteps) : null;
      if (!legal) errors.push('the known solution contains an illegal slide');
      else if (!p || p.end.type !== 'goal') errors.push('the known solution does not lead to the goal');
      else {
        route = p.steps;
        movesNeeded = opts.knownSolution.length;
      }
    }

    // 2. search for the shortest solution (also the only check when no known solution)
    const depth = opts.maxDepth ?? Math.max(6, (opts.knownSolution?.length ?? 0) + 2);
    solution = solve(grid, s.x, s.y, startDir, { maxDepth: depth, budget: opts.budget ?? 120_000 });
    if (solution) {
      if (!route.length || solution.moves.length < movesNeeded) {
        route = solution.path;
        movesNeeded = solution.moves.length;
      }
    } else if (!route.length) {
      errors.push('no solution found');
    }
    if (route.length && movesNeeded === 0) errors.push('solution requires no slide (trivial level)');

    // 3. timing: slides needed before the first break, generously estimated
    if (route.length && Number.isFinite(reactionTime) && movesNeeded > reactionTime * mps + 3) {
      warnings.push(`tight timing: ${movesNeeded} slides with ${reactionTime.toFixed(1)}s before the first break`);
    }

    // 4. fuel along the route (pickups travel with their tiles, so read them from the solved arrangement)
    if (opts.fuel && route.length) {
      const g = grid.clone();
      const moves = opts.knownSolution && opts.knownSolution.length && movesNeeded === opts.knownSolution.length ? opts.knownSolution : solution?.moves ?? [];
      for (const mv of moves) g.slide(mv.from.x, mv.from.y);
      let fuel = Math.min(opts.fuel.max, opts.fuel.initial);
      let ok = true;
      const collected = new Set<number>();
      for (const step of route) {
        fuel -= opts.fuel.perTile;
        if (fuel <= 0) {
          ok = false;
          break;
        }
        const t = g.get(step.x, step.y);
        if (t.pickup && t.pickupId !== undefined && !collected.has(t.pickupId)) {
          collected.add(t.pickupId);
          const v = FUEL_CONFIG.pickupFuel[t.pickup];
          fuel = v === null ? opts.fuel.max : Math.min(opts.fuel.max, fuel + v);
        }
      }
      if (!ok) errors.push('the flame runs out of fuel on the solution route');
      else if (fuel < opts.fuel.perTile * 2) warnings.push('fuel is very tight on the solution route');
    }
  }

  return { ok: errors.length === 0, errors, warnings, solution, movesNeeded, route, initialSafeSteps, reactionTime };
}
