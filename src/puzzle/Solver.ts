import type { Dir } from './Direction';
import type { Grid, SlideMove } from './Grid';
import { predictPath, type PathStep } from './PathSim';

export interface Solution {
  /** Slides to perform, in order. */
  moves: SlideMove[];
  /** Flame route on the solved arrangement (excluding source, including goal). */
  path: PathStep[];
}

export interface SolverOptions {
  /** Maximum number of slides. */
  maxDepth?: number;
  /** Maximum number of arrangements explored. */
  budget?: number;
}

/**
 * Breadth-first search over board arrangements. A state is solved when the
 * flame, starting from the source, reaches a goal with the current tiles
 * (bounces allowed, no fall, no loop). Identical tile shapes are
 * interchangeable so arrangements are hashed by shape.
 *
 * Static by design: it does not model sliding tiles behind the flame while it
 * travels, which is a bonus technique for skilled players, not a requirement.
 */
export function solve(grid: Grid, startX: number, startY: number, startDir: Dir, opts: SolverOptions = {}): Solution | null {
  const maxDepth = opts.maxDepth ?? 12;
  const budget = opts.budget ?? 200_000;
  const maxSteps = grid.width * grid.height * 4;

  const check = (g: Grid): PathStep[] | null => {
    const p = predictPath(g, startX, startY, startDir, maxSteps);
    return p.end.type === 'goal' ? p.steps : null;
  };

  const initial = check(grid);
  if (initial) return { moves: [], path: initial };

  interface Node {
    grid: Grid;
    moves: SlideMove[];
  }
  const seen = new Set<string>([grid.key()]);
  let frontier: Node[] = [{ grid, moves: [] }];
  let explored = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const mv of node.grid.legalMoves()) {
        const g = node.grid.clone();
        g.slide(mv.from.x, mv.from.y);
        const key = g.key();
        if (seen.has(key)) continue;
        seen.add(key);
        explored++;
        const moves = [...node.moves, mv];
        const path = check(g);
        if (path) return { moves, path };
        if (explored > budget) return null;
        next.push({ grid: g, moves });
      }
    }
    if (next.length === 0) return null;
    frontier = next;
  }
  return null;
}
