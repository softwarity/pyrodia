import { Rng } from '../core/Rng';
import type { PickupKind } from '../player/Fuel';
import { DIR_LETTERS } from '../level/LevelParser';
import { DIRS, dirDelta, dirIndex, opposite, turnLeft, turnRight, type Dir } from './Direction';
import { Grid, type SlideMove } from './Grid';
import { predictPath } from './PathSim';
import { DISTINCT_ROTATIONS, isSlidable, makeTile, maskForKind, type Tile, type TileKind } from './Tile';
import { validateGrid } from './Validator';

export interface GeneratorParams {
  width: number;
  height: number;
  /** 0..1 abstract difficulty used to derive the parameters below when they are omitted. */
  difficulty: number;
  seed: number;
  flameSpeed?: number;
  minPathLength?: number;
  maxPathLength?: number;
  /** Number of void moves applied to the solved board. */
  scrambleMoves?: number;
  /** Probability that a straight path tile becomes a tee/cross that still routes correctly. */
  junctionChance?: number;
  /** Probability that a left turn gets an optional bonus detour (dead-end branch with pickups). */
  detourChance?: number;
  detourMaxLength?: number;
  /** Probability that a decoy tile is fixed. */
  lockedDecoyChance?: number;
  /** Path tiles (from the source) the scramble must not disturb. */
  minSafeIndex?: number;
  initialFuel?: number;
  maxFuel?: number;
  fuelPerTile?: number;
  /** Pickups placed on the main route itself. */
  pathPickups?: number;
  /** Torus board: the route may cross the edges. */
  wrap?: boolean;
  /** Probability that a walk step crosses an edge when it can. */
  wrapChance?: number;
  /** Max numbered warp pairs on the main route. */
  routeWarps?: number;
  /** Extra decoy warp pairs off the route. */
  decoyWarps?: number;
}

export interface GeneratedLevel {
  /** Solved board. */
  solvedGrid: Grid;
  /** Start board (solved + scramble). */
  grid: Grid;
  scramble: string;
  solution: SlideMove[];
  flameSpeed: number;
  /** Tiles the flame crosses on the intended route (detours included). */
  routeLength: number;
  mainPathLength: number;
  detours: number;
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
    flameSpeed: p.flameSpeed ?? Number(lerp(0.7, 1.6, d).toFixed(2)),
    minPathLength: p.minPathLength ?? Math.round(lerp(4, Math.min(16, area * 0.3), d)),
    maxPathLength: p.maxPathLength ?? Math.round(lerp(7, Math.min(24, area * 0.45), d)),
    scrambleMoves: p.scrambleMoves ?? Math.max(1, Math.round(lerp(1, 9, d))),
    junctionChance: p.junctionChance ?? lerp(0, 0.35, d),
    detourChance: p.detourChance ?? (d < 0.1 ? 0 : lerp(0.6, 0.95, d)),
    detourMaxLength: p.detourMaxLength ?? Math.round(lerp(1, 3, d)),
    lockedDecoyChance: p.lockedDecoyChance ?? lerp(0, 0.12, Math.max(0, d - 0.3) / 0.7),
    minSafeIndex: p.minSafeIndex ?? 2,
    initialFuel: p.initialFuel ?? 100,
    maxFuel: p.maxFuel ?? 100,
    fuelPerTile: p.fuelPerTile ?? Number(lerp(2, 5, d).toFixed(1)),
    pathPickups: p.pathPickups ?? (d < 0.15 ? 0 : Math.round(lerp(1, 2, d))),
    wrap: p.wrap ?? true,
    wrapChance: p.wrapChance ?? (d < 0.2 ? 0 : lerp(0.15, 0.5, d)),
    routeWarps: p.routeWarps ?? (d < 0.12 ? 0 : d < 0.5 ? 1 : 2),
    decoyWarps: p.decoyWarps ?? (d < 0.35 ? 0 : 1),
  };
}

type Cell = { x: number; y: number };

/**
 * Random self-avoiding walk with a target length. Each step records the
 * direction taken so that wrap-around steps are unambiguous. Returns null when stuck.
 */
function randomWalk(
  rng: Rng,
  w: number,
  h: number,
  start: Cell,
  minLen: number,
  maxLen: number,
  wrap: boolean,
  wrapChance: number,
  warps: number,
): { cells: Cell[]; dirs: (Dir | null)[] } | null {
  const target = rng.int(minLen, maxLen);
  const visited = new Set<number>();
  const cells: Cell[] = [start];
  /** dirs[i] = direction from cells[i] to cells[i+1]; null = warp jump. */
  const dirs: (Dir | null)[] = [];
  visited.add(start.y * w + start.x);
  let cur = start;
  let warpsLeft = warps;
  for (let i = 0; i < target; i++) {
    // Warp jump: land on a far, unvisited cell. Never right after the start,
    // never twice in a row, and leave room for the landing tile + one more.
    if (warpsLeft > 0 && i >= 2 && i <= target - 3 && dirs[dirs.length - 1] !== null && rng.chance(0.35)) {
      const far: Cell[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (visited.has(y * w + x)) continue;
          if (Math.abs(x - cur.x) + Math.abs(y - cur.y) < 2) continue;
          far.push({ x, y });
        }
      }
      if (far.length > 0) {
        const land = rng.pick(far);
        cells.push(land);
        dirs.push(null);
        visited.add(land.y * w + land.x);
        cur = land;
        warpsLeft--;
        continue;
      }
    }
    const options: { cell: Cell; dir: Dir; wraps: boolean }[] = [];
    for (const d of DIRS) {
      const { dx, dy } = dirDelta(d);
      let nx = cur.x + dx;
      let ny = cur.y + dy;
      let wraps = false;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        if (!wrap || !rng.chance(wrapChance)) continue;
        nx = (nx + w) % w;
        ny = (ny + h) % h;
        wraps = true;
      }
      if (visited.has(ny * w + nx)) continue;
      options.push({ cell: { x: nx, y: ny }, dir: d, wraps });
    }
    if (options.length === 0) return cells.length >= minLen + 1 ? { cells, dirs } : null;
    let pick: { cell: Cell; dir: Dir };
    if (dirs.length >= 1 && dirs[dirs.length - 1] !== null && rng.chance(0.4)) {
      const straight = options.find((o) => o.dir === dirs[dirs.length - 1]);
      pick = straight ?? rng.pick(options);
    } else {
      pick = rng.pick(options);
    }
    cells.push(pick.cell);
    dirs.push(pick.dir);
    visited.add(pick.cell.y * w + pick.cell.x);
    cur = pick.cell;
  }
  return { cells, dirs };
}

function rotationForMask(kind: TileKind, mask: number): number {
  for (let r = 0; r < DISTINCT_ROTATIONS[kind]; r++) if (maskForKind(kind, r) === mask) return r;
  return -1;
}

function tileForMask(mask: number): Tile {
  for (const kind of ['straight', 'corner', 'tee', 'cross', 'cap'] as TileKind[]) {
    const r = rotationForMask(kind, mask);
    if (r >= 0) return makeTile(kind, r);
  }
  throw new Error(`no tile for mask ${mask}`);
}

export function generateLevel(params: GeneratorParams): GeneratedLevel {
  const p = deriveParams(params);
  const rng = new Rng(p.seed);
  const w = p.width;
  const h = p.height;

  for (let attempt = 0; attempt < 300; attempt++) {
    const start: Cell = { x: rng.int(0, w - 1), y: rng.int(0, h - 1) };
    const walkResult = randomWalk(rng, w, h, start, p.minPathLength + 1, p.maxPathLength + 1, p.wrap, p.wrapChance, p.routeWarps);
    if (!walkResult || walkResult.cells.length < p.minPathLength + 2) continue;
    const walk = walkResult.cells;
    const walkDirs = walkResult.dirs; // walkDirs[i] = direction from walk[i] to walk[i+1], null = warp
    const goal = walk[walk.length - 1];
    if (Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y) < 2) continue;
    if (walkDirs[0] === null || walkDirs[walkDirs.length - 1] === null) continue;

    const solved = new Grid(w, h, undefined, p.wrap);
    const used = new Set<number>();
    const key = (c: Cell) => c.y * w + c.x;
    const sourceDir = walkDirs[0];
    solved.set(start.x, start.y, makeTile('source', dirIndex(sourceDir)));
    solved.set(goal.x, goal.y, makeTile('goal', dirIndex(opposite(walkDirs[walkDirs.length - 1]!))));
    used.add(key(start));
    used.add(key(goal));

    // Main route tiles. Warp jumps become a numbered pair: the departure warp
    // opens towards the previous tile, the arrival warp towards the next one.
    const pathTiles: Tile[] = [];
    const pathInfo: { cell: Cell; entry: Dir; exit: Dir; heading: Dir }[] = [];
    let nextWarpId = 1;
    for (let i = 1; i < walk.length - 1; i++) {
      const cur = walk[i];
      const dIn = walkDirs[i - 1];
      const dOut = walkDirs[i];
      used.add(key(cur));
      if (dOut === null) {
        // departure warp; the landing cell is walk[i+1] with its own exit
        const t = makeTile('warp', dirIndex(opposite(dIn!)), false, nextWarpId);
        solved.set(cur.x, cur.y, t);
        pathTiles.push(t);
        continue;
      }
      if (dIn === null) {
        const t = makeTile('warp', dirIndex(dOut), false, nextWarpId);
        solved.set(cur.x, cur.y, t);
        pathTiles.push(t);
        nextWarpId++;
        continue;
      }
      const entry = opposite(dIn);
      const exit = dOut;
      const t = tileForMask(entry | exit);
      solved.set(cur.x, cur.y, t);
      pathTiles.push(t);
      pathInfo.push({ cell: cur, entry, exit, heading: opposite(entry) });
    }

    // Optional bonus detours on left turns: tee + dead-end branch with pickups.
    const alternatives: Tile[] = [];
    let detours = 0;
    for (let i = 1; i < pathInfo.length; i++) {
      const info = pathInfo[i];
      if (info.exit !== turnLeft(info.heading) || !rng.chance(p.detourChance)) continue;
      const r = turnRight(info.heading);
      const branch: Cell[] = [];
      let bc: Cell | null = info.cell;
      for (let len = 1; len <= p.detourMaxLength; len++) {
        bc = solved.step(bc.x, bc.y, r);
        if (!bc || used.has(key(bc)) || branch.some((b) => b.x === bc!.x && b.y === bc!.y)) break;
        branch.push(bc);
      }
      if (branch.length === 0) continue;
      const teeTile = tileForMask(info.entry | info.exit | r);
      const cornerTile = tileForMask(info.entry | info.exit);
      const useTee = rng.chance(0.5);
      solved.set(info.cell.x, info.cell.y, useTee ? teeTile : cornerTile);
      alternatives.push(useTee ? cornerTile : teeTile);
      branch.forEach((c, bi) => {
        const last = bi === branch.length - 1;
        const t = last ? tileForMask(opposite(r)) : tileForMask(r | opposite(r));
        t.pickup = last ? (rng.chance(0.35) ? 'ember' : 'oil') : 'wood';
        solved.set(c.x, c.y, t);
        used.add(key(c));
      });
      detours++;
    }

    // Junction decoys on straight segments (still route straight).
    for (let i = 1; i < pathInfo.length; i++) {
      const info = pathInfo[i];
      const t = solved.get(info.cell.x, info.cell.y);
      if (t.kind !== 'straight' || !rng.chance(p.junctionChance)) continue;
      const extra = rng.chance(0.3) ? turnRight(info.heading) | turnLeft(info.heading) : rng.chance(0.5) ? turnRight(info.heading) : turnLeft(info.heading);
      solved.set(info.cell.x, info.cell.y, tileForMask(info.entry | info.exit | extra));
    }

    // Pickups on the main route (never on the first tiles).
    const routeCells = pathInfo.slice(2).map((i) => i.cell);
    rng.shuffle(routeCells);
    for (let i = 0; i < Math.min(p.pathPickups, routeCells.length); i++) {
      const c = routeCells[i];
      const t = solved.get(c.x, c.y);
      if (!t.pickup) t.pickup = rng.chance(0.6) ? 'wood' : 'oil';
    }

    // Decoys: alternatives first (guaranteed somewhere), then random fill, one void.
    const free: Cell[] = [];
    solved.forEach((_t, x, y) => {
      if (!used.has(y * w + x)) free.push({ x, y });
    });
    if (free.length < alternatives.length + 1) continue;
    rng.shuffle(free);
    const voidCell = free.pop()!;
    for (const alt of alternatives) {
      const c = free.pop()!;
      solved.set(c.x, c.y, alt);
    }
    for (let k = 0; k < p.decoyWarps && free.length >= 2; k++) {
      const a = free.pop()!;
      const b = free.pop()!;
      solved.set(a.x, a.y, makeTile('warp', rng.int(0, 3), false, nextWarpId));
      solved.set(b.x, b.y, makeTile('warp', rng.int(0, 3), false, nextWarpId));
      nextWarpId++;
    }
    const decoyKinds: TileKind[] = ['straight', 'straight', 'corner', 'corner', 'corner', 'tee', 'cross', 'cap'];
    for (const c of free) {
      const kind = rng.pick(decoyKinds);
      solved.set(c.x, c.y, makeTile(kind, rng.int(0, 3), rng.chance(p.lockedDecoyChance)));
    }
    solved.set(voidCell.x, voidCell.y, makeTile('empty'));

    // Solved board must route to the goal.
    const solvedRoute = predictPath(solved, start.x, start.y, sourceDir, w * h * 4);
    if (solvedRoute.end.type !== 'goal') continue;

    // Scramble: K void moves that never touch the first path tiles and never undo the previous move.
    const protectedTiles = new Set<Tile>(pathTiles.slice(0, p.minSafeIndex));
    let result: { grid: Grid; scramble: string; solution: SlideMove[] } | null = null;
    for (let tries = 0; tries < 30 && !result; tries++) {
      const g = solved.clone();
      // clone() copies tiles, so re-resolve the protected ones by position
      const prot = new Set<Tile>(walk.slice(1, 1 + p.minSafeIndex).map((c) => g.get(c.x, c.y)));
      let v = { ...voidCell };
      let last: Dir | null = null;
      let scramble = '';
      const undo: SlideMove[] = [];
      let stuck = false;
      for (let k = 0; k < p.scrambleMoves; k++) {
        const options = DIRS.filter((d) => {
          if (last && d === opposite(last)) return false;
          const { dx, dy } = dirDelta(d);
          const t = g.tryGet(v.x + dx, v.y + dy);
          return !!t && isSlidable(t) && !prot.has(t);
        });
        if (options.length === 0) {
          stuck = true;
          break;
        }
        const d = rng.pick(options);
        const before = { ...v };
        g.moveVoid(v, d);
        const { dx, dy } = dirDelta(d);
        v = { x: v.x + dx, y: v.y + dy };
        undo.unshift({ from: before, to: v });
        scramble += DIR_LETTERS[d];
        last = d;
      }
      if (stuck) continue;
      const initial = predictPath(g, start.x, start.y, sourceDir, w * h * 4);
      if (initial.end.type === 'goal') continue;
      if (initial.end.type === 'fall' && initial.steps.length < Math.max(1, p.minSafeIndex - 1)) continue;
      result = { grid: g, scramble, solution: undo };
    }
    if (!result) continue;
    void protectedTiles;

    // Full validation including fuel; patch fuel with extra oil on the route when needed.
    const fuel = { initial: p.initialFuel, max: p.maxFuel, perTile: p.fuelPerTile };
    let validation = validateGrid(result.grid, { flameSpeed: p.flameSpeed, knownSolution: result.solution, fuel, budget: 40_000 });
    for (let extra = 0; extra < 4 && validation.errors.some((e) => e.includes('fuel')); extra++) {
      const candidates = pathInfo.slice(2).map((i) => solved.get(i.cell.x, i.cell.y)).filter((t) => !t.pickup);
      if (candidates.length === 0) break;
      rng.pick(candidates).pickup = extra >= 2 ? 'brazier' : 'oil';
      // tiles are shared by reference between solved and result.grid? No: clone copies. Re-apply scramble.
      const g2 = solved.clone();
      for (const mv of [...result.solution].reverse()) {
        // reverse of undo: the void moves from mv.to to mv.from
        g2.set(mv.to.x, mv.to.y, g2.get(mv.from.x, mv.from.y));
        g2.set(mv.from.x, mv.from.y, makeTile('empty'));
      }
      result.grid = g2;
      validation = validateGrid(result.grid, { flameSpeed: p.flameSpeed, knownSolution: result.solution, fuel, budget: 40_000 });
    }
    if (!validation.ok) continue;
    if (validation.warnings.some((m) => m.startsWith('tight timing'))) continue;

    // Assign pickup ids and collect pickup definitions from the solved board.
    const pickups: { x: number; y: number; kind: PickupKind }[] = [];
    solved.forEach((t, x, y) => {
      if (t.pickup) {
        t.pickupId = pickups.length;
        pickups.push({ x, y, kind: t.pickup });
      }
    });

    return {
      solvedGrid: solved,
      grid: result.grid,
      scramble: result.scramble,
      solution: result.solution,
      flameSpeed: p.flameSpeed,
      routeLength: solvedRoute.steps.length,
      mainPathLength: walk.length - 2,
      detours,
      seed: p.seed,
      pickups,
      initialFuel: p.initialFuel,
      maxFuel: p.maxFuel,
      fuelPerTile: p.fuelPerTile,
    };
  }
  throw new Error(`generateLevel: could not generate a valid level for seed ${p.seed}`);
}
