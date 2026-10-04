import { Rng } from '../core/Rng';
import { DIRS, dirDelta, dirIndex, opposite, turnLeft, turnRight, type Dir } from './Direction';
import { Grid } from './Grid';
import { predictPath } from './PathSim';
import { DISTINCT_ROTATIONS, makeTile, maskForKind, type Tile, type TileKind } from './Tile';
import { validateGrid } from './Validator';
import type { PickupKind } from '../player/Fuel';

export interface GeneratorParams {
  width: number;
  height: number;
  /** 0..1 abstract difficulty used to derive the parameters below when they are omitted. */
  difficulty: number;
  seed: number;
  flameSpeed?: number;
  /** Minimum/maximum solution path length (tiles between source and goal). */
  minPathLength?: number;
  maxPathLength?: number;
  /** Number of path tiles that start in a wrong orientation. */
  scrambles?: number;
  /** Probability that a non-path cell contains a decoy pipe. */
  fillDensity?: number;
  /** Probability that a path tile is upgraded to a tee/cross. */
  junctionChance?: number;
  /** Probability that a decoy tile is locked. */
  lockedDecoyChance?: number;
  /** First path index (1-based from source) allowed to be scrambled. */
  minSafeIndex?: number;
  /** Fuel model. */
  initialFuel?: number;
  maxFuel?: number;
  fuelPerTile?: number;
  /** Pickups placed on the solution path / on detours. */
  pathPickups?: number;
  detourPickups?: number;
}

export interface GeneratedLevel {
  grid: Grid;
  flameSpeed: number;
  pathLength: number;
  scrambles: number;
  seed: number;
  pickups: { x: number; y: number; kind: PickupKind }[];
  initialFuel: number;
  maxFuel: number;
  fuelPerTile: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Derive concrete parameters from the abstract difficulty. */
export function deriveParams(p: GeneratorParams): Required<GeneratorParams> {
  const d = p.difficulty;
  const area = p.width * p.height;
  return {
    width: p.width,
    height: p.height,
    difficulty: d,
    seed: p.seed,
    flameSpeed: p.flameSpeed ?? Number(lerp(0.8, 2.0, d).toFixed(2)),
    minPathLength: p.minPathLength ?? Math.round(lerp(5, Math.min(22, area * 0.45), d)),
    maxPathLength: p.maxPathLength ?? Math.round(lerp(8, Math.min(32, area * 0.65), d)),
    scrambles: p.scrambles ?? Math.max(1, Math.round(lerp(1, 9, d))),
    fillDensity: p.fillDensity ?? lerp(0.35, 0.8, d),
    junctionChance: p.junctionChance ?? lerp(0, 0.45, d),
    lockedDecoyChance: p.lockedDecoyChance ?? lerp(0, 0.25, Math.max(0, d - 0.3) / 0.7),
    minSafeIndex: p.minSafeIndex ?? 2,
    initialFuel: p.initialFuel ?? 100,
    maxFuel: p.maxFuel ?? 100,
    fuelPerTile: p.fuelPerTile ?? Number(lerp(2, 5.5, d).toFixed(1)),
    pathPickups: p.pathPickups ?? (d < 0.12 ? 0 : Math.round(lerp(1, 3, d))),
    detourPickups: p.detourPickups ?? (d < 0.2 ? 0 : Math.round(lerp(1, 3, d))),
  };
}

type Cell = { x: number; y: number };

/** Random self-avoiding walk with a target length. Returns null when stuck. */
function randomWalk(rng: Rng, w: number, h: number, start: Cell, minLen: number, maxLen: number): Cell[] | null {
  const target = rng.int(minLen, maxLen);
  const visited = new Set<number>();
  const path: Cell[] = [start];
  visited.add(start.y * w + start.x);
  let cur = start;
  for (let i = 0; i < target; i++) {
    const options: Cell[] = [];
    for (const d of DIRS) {
      const { dx, dy } = dirDelta(d);
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (visited.has(ny * w + nx)) continue;
      options.push({ x: nx, y: ny });
    }
    if (options.length === 0) return path.length >= minLen + 1 ? path : null;
    // Prefer continuing straight a bit for readable pipes, with randomness.
    let next: Cell;
    if (path.length >= 2 && rng.chance(0.45)) {
      const prev = path[path.length - 2];
      const sdx = cur.x - prev.x;
      const sdy = cur.y - prev.y;
      const straight = options.find((o) => o.x === cur.x + sdx && o.y === cur.y + sdy);
      next = straight ?? rng.pick(options);
    } else {
      next = rng.pick(options);
    }
    path.push(next);
    visited.add(next.y * w + next.x);
    cur = next;
  }
  return path;
}

function dirBetween(a: Cell, b: Cell): Dir {
  if (b.x === a.x + 1) return 2; // E
  if (b.x === a.x - 1) return 8; // W
  if (b.y === a.y + 1) return 4; // S
  return 1; // N
}

/** Find the rotation of `kind` whose mask equals `mask` (or -1). */
function rotationForMask(kind: TileKind, mask: number): number {
  for (let r = 0; r < DISTINCT_ROTATIONS[kind]; r++) if (maskForKind(kind, r) === mask) return r;
  return -1;
}

export function generateLevel(params: GeneratorParams): GeneratedLevel {
  const p = deriveParams(params);
  const rng = new Rng(p.seed);
  const w = p.width;
  const h = p.height;

  for (let attempt = 0; attempt < 400; attempt++) {
    const start: Cell = { x: rng.int(0, w - 1), y: rng.int(0, h - 1) };
    const walk = randomWalk(rng, w, h, start, p.minPathLength + 1, p.maxPathLength + 1);
    if (!walk || walk.length < p.minPathLength + 2) continue;
    const goal = walk[walk.length - 1];
    const manhattan = Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y);
    if (manhattan < 2) continue;

    const grid = new Grid(w, h);
    const sourceDir = dirBetween(walk[0], walk[1]);
    grid.set(start.x, start.y, makeTile('source', dirIndex(sourceDir)));
    const goalDir = dirBetween(goal, walk[walk.length - 2]);
    grid.set(goal.x, goal.y, makeTile('goal', dirIndex(goalDir)));

    // Intermediate path tiles with their *solved* orientation.
    const solved: { cell: Cell; kind: TileKind; rotation: number }[] = [];
    for (let i = 1; i < walk.length - 1; i++) {
      const prev = walk[i - 1];
      const cur = walk[i];
      const next = walk[i + 1];
      const entry = dirBetween(cur, prev); // side the flame comes in through
      const exit = dirBetween(cur, next);
      const heading = opposite(entry);
      let mask = entry | exit;
      let kind: TileKind = exit === heading ? 'straight' : 'corner';
      // Upgrades to junctions that still respect the straight > right > left rule.
      if (rng.chance(p.junctionChance)) {
        if (kind === 'straight') {
          if (rng.chance(0.3)) {
            kind = 'cross';
            mask = 15;
          } else {
            kind = 'tee';
            mask |= rng.chance(0.5) ? turnRight(heading) : turnLeft(heading);
          }
        } else if (exit === turnRight(heading)) {
          // right turn: adding the side opposite to the exit keeps "right" the choice
          kind = 'tee';
          mask |= opposite(exit);
        }
      }
      const rotation = rotationForMask(kind, mask);
      if (rotation < 0) throw new Error('generator: internal mask error');
      solved.push({ cell: cur, kind, rotation });
      grid.set(cur.x, cur.y, makeTile(kind, rotation));
    }

    // Scramble some path tiles.
    const scrambleCandidates = solved
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => DISTINCT_ROTATIONS[s.kind] > 1 && i + 1 >= p.minSafeIndex);
    if (scrambleCandidates.length === 0) continue;
    const scrambleCount = Math.min(p.scrambles, scrambleCandidates.length);
    rng.shuffle(scrambleCandidates);
    const chosen = scrambleCandidates.slice(0, scrambleCount);
    for (const { s } of chosen) {
      const n = DISTINCT_ROTATIONS[s.kind];
      const delta = rng.int(1, n - 1);
      const t = grid.get(s.cell.x, s.cell.y);
      t.rotation = (s.rotation + delta) % 4;
    }

    // Fill remaining cells with decoys.
    const decoyKinds: TileKind[] = ['straight', 'corner', 'corner', 'tee', 'cross', 'cap'];
    grid.forEach((t: Tile, x, y) => {
      if (t.kind !== 'empty') return;
      if (!rng.chance(p.fillDensity)) return;
      const kind = rng.pick(decoyKinds);
      const locked = rng.chance(p.lockedDecoyChance);
      grid.set(x, y, makeTile(kind, rng.int(0, 3), locked));
    });

    // Pickups. On-path pickups make the fuel budget work; detour pickups sit on
    // decoy tiles next to the path (optional fuel/score for players who reroute).
    const pickups: { x: number; y: number; kind: PickupKind }[] = [];
    const pathCells = solved.map((s) => s.cell);
    const pathSet = new Set(pathCells.map((c) => c.y * w + c.x));
    const pathKinds: PickupKind[] = ['wood', 'wood', 'oil', 'oil', 'brazier'];
    const candidates = rng.shuffle(pathCells.slice(1));
    for (let i = 0; i < Math.min(p.pathPickups, candidates.length); i++) {
      pickups.push({ x: candidates[i].x, y: candidates[i].y, kind: rng.pick(pathKinds) });
    }
    const detourKinds: PickupKind[] = ['oil', 'oil', 'wood', 'ember'];
    const decoys: Cell[] = [];
    grid.forEach((t: Tile, x, y) => {
      if (t.kind === 'empty' || t.kind === 'source' || t.kind === 'goal' || pathSet.has(y * w + x)) return;
      // adjacent to the path => plausible detour
      const nearPath = DIRS.some((d) => {
        const { dx, dy } = dirDelta(d);
        return pathSet.has((y + dy) * w + (x + dx));
      });
      if (nearPath) decoys.push({ x, y });
    });
    rng.shuffle(decoys);
    for (let i = 0; i < Math.min(p.detourPickups, decoys.length); i++) {
      pickups.push({ x: decoys[i].x, y: decoys[i].y, kind: rng.pick(detourKinds) });
    }

    // Validate: must be solvable, non-trivial, with some reaction time and enough fuel.
    const initial = predictPath(grid, start.x, start.y, sourceDir, w * h * 4);
    if (initial.end.type === 'goal') continue;
    const fuel = { initial: p.initialFuel, max: p.maxFuel, perTile: p.fuelPerTile, pickups };
    let result = validateGrid(grid, { flameSpeed: p.flameSpeed, fuel });
    if (result.errors.some((e) => e.includes('fuel'))) {
      // add an extra oil/brazier on the path until the budget closes
      for (let extra = 0; extra < 4 && result.errors.some((e) => e.includes('fuel')); extra++) {
        const free = pathCells.filter((c) => !pickups.some((q) => q.x === c.x && q.y === c.y));
        if (free.length === 0) break;
        const c = rng.pick(free);
        pickups.push({ x: c.x, y: c.y, kind: extra >= 2 ? 'brazier' : 'oil' });
        result = validateGrid(grid, { flameSpeed: p.flameSpeed, fuel });
      }
    }
    if (!result.ok) continue;
    if (result.initialSafeSteps < Math.max(1, p.minSafeIndex - 1)) continue;
    if (result.solution && result.solution.changes.length === 0) continue;
    if (result.warnings.some((wmsg) => wmsg.startsWith('tight timing'))) continue;

    return {
      grid,
      flameSpeed: p.flameSpeed,
      pathLength: walk.length - 2,
      scrambles: scrambleCount,
      seed: p.seed,
      pickups,
      initialFuel: p.initialFuel,
      maxFuel: p.maxFuel,
      fuelPerTile: p.fuelPerTile,
    };
  }
  throw new Error(`generateLevel: could not generate a valid level for seed ${p.seed}`);
}
