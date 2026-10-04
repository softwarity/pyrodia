import { indexDir } from '../puzzle/Direction';
import { Grid } from '../puzzle/Grid';
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

export function parseLevel(def: LevelDef): ParsedLevel {
  const grid = parseRows(def.rows, def.width, def.height);
  const sources = grid.find('source');
  if (sources.length !== 1) throw new Error(`Level ${def.id}: expected exactly 1 source, found ${sources.length}`);
  const goals = grid.find('goal');
  if (goals.length < 1) throw new Error(`Level ${def.id}: no goal`);
  const s = sources[0];
  const start = { x: s.x, y: s.y, dir: indexDir(grid.get(s.x, s.y).rotation) };
  return {
    def,
    grid,
    start,
    goals: goals.map((g) => ({ x: g.x, y: g.y, dir: indexDir(grid.get(g.x, g.y).rotation) })),
  };
}
