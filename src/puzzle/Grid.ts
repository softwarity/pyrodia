import { dirDelta, opposite, type Dir, type Mask } from './Direction';
import { cloneTile, isRotatable, makeTile, tileMask, type Tile } from './Tile';

export interface Cell {
  x: number;
  y: number;
}

/**
 * The puzzle grid: a width x height matrix of tiles.
 * Pure data + logic, no rendering.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private cells: Tile[];

  constructor(width: number, height: number, cells?: Tile[]) {
    this.width = width;
    this.height = height;
    if (cells) {
      if (cells.length !== width * height) throw new Error('Grid: cell count mismatch');
      this.cells = cells.map(cloneTile);
    } else {
      this.cells = new Array(width * height).fill(null).map(() => makeTile('empty'));
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) throw new Error(`Grid.get out of bounds (${x},${y})`);
    return this.cells[y * this.width + x];
  }

  tryGet(x: number, y: number): Tile | null {
    return this.inBounds(x, y) ? this.cells[y * this.width + x] : null;
  }

  set(x: number, y: number, tile: Tile): void {
    if (!this.inBounds(x, y)) throw new Error(`Grid.set out of bounds (${x},${y})`);
    this.cells[y * this.width + x] = tile;
  }

  maskAt(x: number, y: number): Mask {
    const t = this.tryGet(x, y);
    return t ? tileMask(t) : 0;
  }

  /** Rotate a tile. Returns true if the tile changed. */
  rotate(x: number, y: number, clockwise = true): boolean {
    const t = this.tryGet(x, y);
    if (!t || !isRotatable(t)) return false;
    t.rotation = (t.rotation + (clockwise ? 1 : 3)) % 4;
    return true;
  }

  /** Whether the side `side` of tile (x,y) is connected to its neighbour. */
  isConnected(x: number, y: number, side: Dir): boolean {
    const here = this.maskAt(x, y);
    if (!(here & side)) return false;
    const { dx, dy } = dirDelta(side);
    const there = this.maskAt(x + dx, y + dy);
    return (there & opposite(side)) !== 0;
  }

  find(kind: Tile['kind']): Cell[] {
    const out: Cell[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y).kind === kind) out.push({ x, y });
      }
    }
    return out;
  }

  clone(): Grid {
    return new Grid(this.width, this.height, this.cells);
  }

  forEach(fn: (tile: Tile, x: number, y: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) fn(this.get(x, y), x, y);
    }
  }
}
