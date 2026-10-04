import { DIRS, dirDelta, opposite, type Dir, type Mask } from './Direction';
import { cloneTile, isSlidable, makeTile, tileMask, tileSymbol, type Tile } from './Tile';

export interface Cell {
  x: number;
  y: number;
}

export interface SlideMove {
  /** Tile that moves. */
  from: Cell;
  /** Void it moves into. */
  to: Cell;
}

/**
 * The puzzle grid: a width x height matrix of tiles with one (or more) voids.
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

  voids(): Cell[] {
    return this.find('empty');
  }

  /** The void adjacent to (x,y) that this tile could slide into, if any. */
  slideTarget(x: number, y: number): Cell | null {
    const t = this.tryGet(x, y);
    if (!t || !isSlidable(t)) return null;
    for (const d of DIRS) {
      const { dx, dy } = dirDelta(d);
      const n = this.tryGet(x + dx, y + dy);
      if (n && n.kind === 'empty') return { x: x + dx, y: y + dy };
    }
    return null;
  }

  /** Every legal slide on the current board. */
  legalMoves(): SlideMove[] {
    const moves: SlideMove[] = [];
    for (const v of this.voids()) {
      for (const d of DIRS) {
        const { dx, dy } = dirDelta(d);
        const t = this.tryGet(v.x + dx, v.y + dy);
        if (t && isSlidable(t)) moves.push({ from: { x: v.x + dx, y: v.y + dy }, to: v });
      }
    }
    return moves;
  }

  /** Slide tile (x,y) into an adjacent void. Returns the void cell it moved into, or null. */
  slide(x: number, y: number): Cell | null {
    const target = this.slideTarget(x, y);
    if (!target) return null;
    const tile = this.get(x, y);
    this.set(target.x, target.y, tile);
    this.set(x, y, makeTile('empty'));
    return target;
  }

  /**
   * Move a void in direction `dir`: the tile on that side slides into the void.
   * Used to apply scrambles. Returns false when illegal.
   */
  moveVoid(voidCell: Cell, dir: Dir): boolean {
    const { dx, dy } = dirDelta(dir);
    const tx = voidCell.x + dx;
    const ty = voidCell.y + dy;
    const t = this.tryGet(tx, ty);
    if (!t || !isSlidable(t) || this.get(voidCell.x, voidCell.y).kind !== 'empty') return false;
    this.set(voidCell.x, voidCell.y, t);
    this.set(tx, ty, makeTile('empty'));
    return true;
  }

  /** Arrangement hash (identical tile shapes are interchangeable). */
  key(): string {
    let s = '';
    for (const c of this.cells) s += tileSymbol(c);
    return s;
  }

  clone(): Grid {
    return new Grid(this.width, this.height, this.cells);
  }

  forEach(fn: (tile: Tile, x: number, y: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) fn(this.get(x, y), x, y);
    }
  }

  count(pred: (t: Tile) => boolean): number {
    return this.cells.filter(pred).length;
  }
}
