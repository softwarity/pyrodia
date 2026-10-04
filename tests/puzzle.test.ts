import { describe, expect, it } from 'vitest';
import { LevelSession } from '../src/game/LevelSession';
import { LEVELS } from '../src/level/levels';
import { applyScramble, gridToRows, parseLevel, parseRows } from '../src/level/LevelParser';
import { FUEL_CONFIG } from '../src/player/Fuel';
import { computeLevelScore } from '../src/player/Scoring';
import { E, N, S, W, opposite, rotateMaskCW, turnLeft, turnRight } from '../src/puzzle/Direction';
import { generateLevel } from '../src/puzzle/Generator';
import { chooseExit, predictPath } from '../src/puzzle/PathSim';
import { solve } from '../src/puzzle/Solver';
import { makeTile, tileMask } from '../src/puzzle/Tile';
import { tileLocalPosition } from '../src/puzzle/TileGeometry';
import { validateGrid } from '../src/puzzle/Validator';

describe('directions', () => {
  it('rotates masks clockwise', () => {
    expect(rotateMaskCW(N)).toBe(E);
    expect(rotateMaskCW(N | E)).toBe(E | S);
    expect(rotateMaskCW(N | S)).toBe(E | W);
    expect(rotateMaskCW(W, 1)).toBe(N);
  });
  it('knows opposites and turns', () => {
    expect(opposite(N)).toBe(S);
    expect(turnRight(N)).toBe(E);
    expect(turnLeft(N)).toBe(W);
    expect(turnRight(W)).toBe(N);
  });
});

describe('tiles', () => {
  it('corner rotations match └ ┌ ┐ ┘', () => {
    expect(tileMask(makeTile('corner', 0))).toBe(N | E);
    expect(tileMask(makeTile('corner', 1))).toBe(E | S);
    expect(tileMask(makeTile('corner', 2))).toBe(S | W);
    expect(tileMask(makeTile('corner', 3))).toBe(W | N);
  });
});

describe('movement rule', () => {
  it('prefers straight, then right, then left, then bounce', () => {
    expect(chooseExit(N | S, S)).toBe(N);
    expect(chooseExit(S | E | W, S)).toBe(E);
    expect(chooseExit(S | W, S)).toBe(W);
    expect(chooseExit(S, S)).toBe(S);
    expect(chooseExit(N | E | S | W, W)).toBe(E);
  });
});

describe('tile geometry', () => {
  it('is continuous through the tile', () => {
    const a = tileLocalPosition('corner', S, E, 0);
    const b = tileLocalPosition('corner', S, E, 1);
    expect(a.x).toBeCloseTo(0.5);
    expect(a.y).toBeCloseTo(1);
    expect(b.x).toBeCloseTo(1);
    expect(b.y).toBeCloseTo(0.5);
  });
});

describe('sliding grid', () => {
  it('slides a tile into the void and the scramble is reversible', () => {
    const grid = parseRows(['S1 I1 G3', 'I0 .. C1'], 3, 2);
    const undo = applyScramble(grid, 'U');
    expect(grid.get(1, 1).kind).toBe('straight');
    expect(grid.get(1, 0).kind).toBe('empty');
    expect(undo).toEqual([{ from: { x: 1, y: 1 }, to: { x: 1, y: 0 } }]);
    expect(grid.slide(1, 1)).toEqual({ x: 1, y: 0 });
    expect(grid.get(1, 0).kind).toBe('straight');
  });
  it('refuses to slide fixed tiles or tiles away from the void', () => {
    const grid = parseRows(['S1 I1 G3', 'I0 .. C1*'], 3, 2);
    expect(grid.slide(0, 0)).toBeNull(); // source
    expect(grid.slide(2, 1)).toBeNull(); // locked
    expect(grid.slide(2, 0)).toBeNull(); // goal
  });
});

describe('wrap-around', () => {
  it('the flame leaving one edge re-enters from the opposite edge', () => {
    // source opens West on the left edge; the pipe continues from the right edge
    const grid = parseRows(['S3 .. G3', 'I1 I1 I1'], 3, 2);
    // row 0: source at (0,0) opens W -> wraps to (2,0) goal which opens W: not matching (needs E)
    expect(grid.step(0, 0, W)).toEqual({ x: 2, y: 0 });
    const p = predictPath(grid, 0, 0, W, 10);
    expect(p.end.type).toBe('fall');
    const grid2 = parseRows(['S3 .. G1', 'I1 I1 I1'], 3, 2);
    const p2 = predictPath(grid2, 0, 0, W, 10);
    expect(p2.end).toEqual({ type: 'goal', x: 2, y: 0 });
    expect(p2.steps[0].wrapped).toBe(true);
  });
  it('can be disabled per level', () => {
    const grid = parseRows(['S3 .. G1'], 3, 1, false);
    expect(grid.step(0, 0, W)).toBeNull();
    expect(predictPath(grid, 0, 0, W, 10).end.type).toBe('fall');
  });
});

describe('warps', () => {
  it('the flame entering warp n comes out of the other warp n', () => {
    // source -> straight -> warp 1 ... warp 1 -> goal (board wrap disabled to keep it simple)
    const grid = parseRows(['S1 I1 W31 ..', 'G1 W31 .. ..'], 4, 2, false);
    // (2,0) warp opens W (entry side); twin (1,1) opens W towards the goal at (0,1)
    const p = predictPath(grid, 0, 0, E, 10);
    expect(p.end).toEqual({ type: 'goal', x: 0, y: 1 });
    expect(p.steps.map((st) => `${st.x},${st.y}`)).toEqual(['1,0', '2,0', '1,1', '0,1']);
    expect(p.steps[2].wrapped).toBe(true);
  });
  it('an unpaired warp behaves like a dead end', () => {
    const grid = parseRows(['S1 I1 W31 ..'], 4, 1, false);
    const p = predictPath(grid, 0, 0, E, 10);
    expect(p.end.type).toBe('loop'); // bounces back to the source and loops
  });
  it('round-trips through the level notation', () => {
    const grid = parseRows(['W12 W02*'], 2, 1);
    expect(grid.get(0, 0)).toMatchObject({ kind: 'warp', rotation: 1, warpId: 2 });
    expect(grid.get(1, 0).locked).toBe(true);
    expect(gridToRows(grid)).toEqual(['W12 W02*']);
  });
});

describe('blank tiles', () => {
  it('slide like any tile and drop the flame', () => {
    const grid = parseRows(['S1 -- G3', 'I1 .. --'], 3, 2, false);
    expect(grid.get(1, 0).kind).toBe('blank');
    expect(predictPath(grid, 0, 0, E, 10).end.type).toBe('fall');
    expect(grid.slide(1, 0)).toEqual({ x: 1, y: 1 });
    expect(gridToRows(grid)).toEqual(['S1 .. G3', 'I1 -- --']);
  });
});

describe('levels', () => {
  it('has 100 levels with unique ascending ids', () => {
    expect(LEVELS.length).toBe(100);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it('every level is valid and solvable', () => {
    for (const def of LEVELS) {
      const parsed = parseLevel(def);
      const result = validateGrid(parsed.grid, {
        flameSpeed: def.flameSpeed,
        knownSolution: parsed.solution,
        budget: 30_000,
        fuel: {
          initial: def.initialFuel ?? FUEL_CONFIG.defaultInitialFuel,
          max: def.maxFuel ?? FUEL_CONFIG.defaultMaxFuel,
          perTile: def.fuelPerTile ?? FUEL_CONFIG.defaultFuelPerTile,
        },
      });
      expect(result.errors, `level ${def.id}: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.movesNeeded).toBeGreaterThan(0);
    }
  });

  it('level 1 is solved by a single slide', () => {
    const parsed = parseLevel(LEVELS[0]);
    const sol = solve(parsed.grid, parsed.start.x, parsed.start.y, parsed.start.dir)!;
    expect(sol.moves.length).toBe(1);
    expect(sol.moves[0]).toEqual({ from: { x: 2, y: 2 }, to: { x: 2, y: 1 } });
  });
});

describe('simulation', () => {
  const run = (session: LevelSession, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) session.update(1 / 60);
  };

  it('waits for the player before moving', () => {
    const session = new LevelSession(LEVELS[0]);
    run(session, 5);
    expect(session.phase).toBe('ready');
    expect(session.timeRemaining).toBe(LEVELS[0].timeLimit);
    session.start();
    expect(session.phase).toBe('running');
  });

  it('the flame falls into the hole when the path is broken', () => {
    const session = new LevelSession(LEVELS[0]);
    session.start();
    let death: string | null = null;
    session.events.on('death', (d) => (death = d.cause));
    run(session, 12);
    expect(death).toBe('water');
    expect(session.phase).toBe('lost');
  });

  it('the flame reaches the goal and collects fuel after the slide', () => {
    const session = new LevelSession(LEVELS[0]);
    expect(session.slide(2, 2)).toBe(true); // first slide starts the level
    expect(session.phase).toBe('running');
    let won = false;
    let firstTime: boolean | null = null;
    session.events.on('won', () => (won = true));
    session.events.on('pickup', (p) => (firstTime = p.firstTime));
    run(session, 15);
    expect(won).toBe(true);
    expect(session.collected.size).toBe(1);
    expect(firstTime).toBe(true);
    expect(session.newPickups).toBe(1);
  });

  it('a pickup collected on a previous attempt gives fuel but no reward', () => {
    const session = new LevelSession(LEVELS[0], [0]);
    session.slide(2, 2);
    let embers = -1;
    let firstTime: boolean | null = null;
    session.events.on('pickup', (p) => {
      embers = p.embers;
      firstTime = p.firstTime;
    });
    run(session, 15);
    expect(firstTime).toBe(false);
    expect(embers).toBe(0);
    expect(session.newPickups).toBe(0);
    expect(session.collected.size).toBe(1);
  });

  it('refuses to slide the tile the flame is in', () => {
    const session = new LevelSession(LEVELS[0]);
    session.start();
    run(session, 2.0); // flame is in tile (1,1)
    expect(session.flame.x).toBe(1);
    expect(session.flame.y).toBe(1);
    expect(session.slide(1, 1)).toBe(false);
  });

  it('fast-forward multiplies the flame speed without changing fuel per tile', () => {
    const session = new LevelSession(LEVELS[0]);
    session.start();
    const base = session.flame.speed;
    session.setFastForwardHeld(true);
    expect(session.flame.speed).toBeCloseTo(base * 3);
    expect(session.fastForward).toBe(true);
    session.setFastForwardHeld(false);
    expect(session.flame.speed).toBeCloseTo(base);
    session.toggleFastForwardLock();
    expect(session.fastForward).toBe(true);
    session.toggleFastForwardLock();
    expect(session.fastForward).toBe(false);
  });

  it('the flame dies when fuel runs out', () => {
    const def = { ...LEVELS[0], initialFuel: 2, fuelPerTile: 2, pickups: [] };
    const session = new LevelSession(def);
    session.start();
    let cause: string | null = null;
    session.events.on('death', (d) => (cause = d.cause));
    run(session, 8);
    expect(cause).toBe('fuel');
  });
});

describe('scoring', () => {
  it('rewards a perfect run with every bonus', () => {
    const def = LEVELS[2];
    const b = computeLevelScore(
      def,
      { elapsed: 5, timeRemaining: def.timeLimit - 5, fuelRemaining: 100, deathsThisLevel: 0, pickupsCollected: 2, pickupsTotal: 2, newPickups: 2, boostsUsed: 0 },
      3,
      100,
    );
    expect(b.stars).toBe(3);
    expect(b.perfectBonus).toBeGreaterThan(0);
    expect(b.total).toBe(b.base + b.timeBonus + b.fuelBonus + b.lifeBonus + b.pickupBonus + b.perfectBonus);
  });
  it('replayed pickups do not add score, a death prevents perfect', () => {
    const def = LEVELS[2];
    const b = computeLevelScore(def, { elapsed: 5, timeRemaining: 20, fuelRemaining: 50, deathsThisLevel: 1, pickupsCollected: 2, pickupsTotal: 2, newPickups: 0, boostsUsed: 0 }, 2, 100);
    expect(b.pickupBonus).toBe(0);
    expect(b.stars).toBeLessThan(3);
  });
});

describe('generator', () => {
  it('produces valid sliding levels deterministically', () => {
    const a = generateLevel({ width: 6, height: 5, difficulty: 0.5, seed: 42 });
    const b = generateLevel({ width: 6, height: 5, difficulty: 0.5, seed: 42 });
    expect(a.scramble).toBe(b.scramble);
    expect(a.grid.key()).toBe(b.grid.key());
    const start = a.grid.find('source')[0];
    const result = validateGrid(a.grid, {
      flameSpeed: a.flameSpeed,
      knownSolution: a.solution,
      fuel: { initial: a.initialFuel, max: a.maxFuel, perTile: a.fuelPerTile },
    });
    expect(result.ok).toBe(true);
    expect(start).toBeDefined();
  });
});
