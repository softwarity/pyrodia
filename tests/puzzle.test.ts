import { describe, expect, it } from 'vitest';
import { LevelSession } from '../src/game/LevelSession';
import { LEVELS } from '../src/level/levels';
import { applyScramble, parseLevel, parseRows } from '../src/level/LevelParser';
import { FUEL_CONFIG } from '../src/player/Fuel';
import { computeLevelScore } from '../src/player/Scoring';
import { E, N, S, W, opposite, rotateMaskCW, turnLeft, turnRight } from '../src/puzzle/Direction';
import { generateLevel } from '../src/puzzle/Generator';
import { chooseExit } from '../src/puzzle/PathSim';
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

  it('the flame falls into the hole when the path is broken', () => {
    const session = new LevelSession(LEVELS[0]);
    let death: string | null = null;
    session.events.on('death', (d) => (death = d.cause));
    run(session, 12);
    expect(death).toBe('water');
    expect(session.phase).toBe('lost');
  });

  it('the flame reaches the goal and collects fuel after the slide', () => {
    const session = new LevelSession(LEVELS[0]);
    expect(session.slide(2, 2)).toBe(true);
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
    run(session, 2.6); // ready delay 1.5s + a bit: flame is in tile (1,1)
    expect(session.flame.x).toBe(1);
    expect(session.flame.y).toBe(1);
    expect(session.slide(1, 1)).toBe(false);
  });

  it('the flame dies when fuel runs out', () => {
    const def = { ...LEVELS[0], initialFuel: 2, fuelPerTile: 2, pickups: [] };
    const session = new LevelSession(def);
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
