import { E, N, S, W, indexDir, opposite, type Dir } from '../puzzle/Direction';
import { Grid, type SlideMove } from '../puzzle/Grid';
import { CODE_KINDS, KIND_CODES, makeTile, type Tile } from '../puzzle/Tile';
import type { LevelDef, ParsedLevel } from './LevelDef';

export function parseToken(token: string): Tile {
  const t = token.trim();
  if (t === '..' || t === '.') return makeTile('empty');
  const m = /^([ICTXDSG])([0-3])(\*?)$/.exec(t);
  if (!m) throw new Error(`Bad tile token "${token}"`);
  const kind = CODE_KINDS[m[1]];
  return makeTile(kind, parseInt(m[2], 10), m[3] === '*');
}

export function tileToToken(tile: Tile): string {
  if (tile.kind === 'empty') return '..';
  const lockedMark = tile.locked && tile.kind !== 'source' && tile.kind !== 'goal' ? '*' : '';
  return `${KIND_CODES[tile.kind]}${tile.rotation}${lockedMark}`;
}

export function parseRows(rows: string[], width: number, height: number): Grid {
  if (rows.length !== height) throw new Error(`Level has ${rows.length} rows, expected ${height}`);
  const cells: Tile[] = [];
  rows.forEach((row, y) => {
    const tokens = row.trim().split(/\s+/);
    if (tokens.length !== width) throw new Error(`Row ${y} has ${tokens.length} tokens, expected ${width}`);
    for (const tok of tokens) cells.push(parseToken(tok));
  });
  return new Grid(width, height, cells);
}

export function gridToRows(grid: Grid): string[] {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    const toks: string[] = [];
    for (let x = 0; x < grid.width; x++) toks.push(tileToToken(grid.get(x, y)));
    rows.push(toks.join(' '));
  }
  return rows;
}

const MOVE_DIRS: Record<string, Dir> = { U: N, R: E, D: S, L: W };
export const DIR_LETTERS: Record<Dir, string> = { 1: 'U', 2: 'R', 4: 'D', 8: 'L' };

/**
 * Apply a scramble (void moves) to a solved grid. Returns the slides that undo
 * it, in order. Throws on an illegal move so broken level data is caught early.
 */
export function applyScramble(grid: Grid, scramble: string): SlideMove[] {
  const undo: SlideMove[] = [];
  const voids = grid.voids();
  if (voids.length === 0) {
    if (scramble.length) throw new Error('scramble on a board without a void');
    return undo;
  }
  // With several voids, letters apply to the first void in reading order.
  let v = voids[0];
  for (const letter of scramble.replace(/\s+/g, '').toUpperCase()) {
    const dir = MOVE_DIRS[letter];
    if (!dir) throw new Error(`bad scramble letter "${letter}"`);
    const before = { ...v };
    if (!grid.moveVoid(v, dir)) throw new Error(`illegal scramble move ${letter} at (${v.x},${v.y})`);
    const dx = dir === E ? 1 : dir === W ? -1 : 0;
    const dy = dir === S ? 1 : dir === N ? -1 : 0;
    v = { x: v.x + dx, y: v.y + dy };
    // undoing = sliding the tile now at `before` back into the void at `v`
    undo.unshift({ from: before, to: v });
    void opposite;
  }
  return undo;
}

export function parseLevel(def: LevelDef): ParsedLevel {
  const solvedGrid = parseRows(def.rows, def.width, def.height);
  // attach pickups to tiles of the solved board
  (def.pickups ?? []).forEach((p, i) => {
    const t = solvedGrid.tryGet(p.x, p.y);
    if (!t) throw new Error(`Level ${def.id}: pickup ${i} outside the board`);
    t.pickup = p.kind;
    t.pickupId = i;
  });
  const grid = solvedGrid.clone();
  const solution = applyScramble(grid, def.scramble ?? '');
  const sources = grid.find('source');
  if (sources.length !== 1) throw new Error(`Level ${def.id}: expected exactly 1 source, found ${sources.length}`);
  const goals = grid.find('goal');
  if (goals.length < 1) throw new Error(`Level ${def.id}: no goal`);
  const s = sources[0];
  const start = { x: s.x, y: s.y, dir: indexDir(grid.get(s.x, s.y).rotation) };
  return {
    def,
    grid,
    solvedGrid,
    start,
    goals: goals.map((g) => ({ x: g.x, y: g.y, dir: indexDir(grid.get(g.x, g.y).rotation) })),
    solution,
    pickupCount: def.pickups?.length ?? 0,
  };
}
