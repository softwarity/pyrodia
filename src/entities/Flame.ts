import { CONFIG } from '../game/Config';
import { dirDelta, indexDir, opposite, type Dir } from '../puzzle/Direction';
import type { Grid } from '../puzzle/Grid';
import { routeExit } from '../puzzle/PathSim';
import { sideMid, tileLocalPosition } from '../puzzle/TileGeometry';
import { FuelTank } from '../player/Fuel';
import { Entity } from './Entity';

export type FlameStatus = 'waiting' | 'moving' | 'falling' | 'extinguishing' | 'dead' | 'arrived';

export interface FlameEvents {
  enterTile: { x: number; y: number; entry: Dir; exit: Dir };
  bounce: { x: number; y: number };
  fall: { x: number; y: number; dir: Dir };
  splash: { wx: number; wy: number };
  arrived: { x: number; y: number };
  /** The flame crossed the centre of tile (x,y): pickups are collected here. */
  centre: { x: number; y: number };
  warp: { from: { x: number; y: number }; to: { x: number; y: number } };
  fuelEmpty: { wx: number; wy: number };
  extinguished: { wx: number; wy: number };
}

/**
 * The living flame. Moves deterministically through the pipe network.
 * Position inside a tile is tracked as `progress` (0 entering .. 1 leaving).
 */
export class Flame extends Entity {
  readonly kind = 'flame' as const;
  status: FlameStatus = 'waiting';
  x: number;
  y: number;
  entry: Dir;
  exit: Dir;
  progress = 0.5;
  speed: number; // tiles per second
  heading: Dir;
  travelled = 0;
  readonly fuel: FuelTank;
  /** Fuel burnt per tile travelled. */
  fuelPerTile: number;
  /** Visual intensity 0..1 derived from fuel (architecture hook for gameplay effects later). */
  get intensity(): number {
    return 0.35 + 0.65 * this.fuel.ratio;
  }
  private inGoal = false;
  private centreCrossed = true;
  private extinguishTime = 0;
  private fallVx = 0;
  private fallVy = 0;
  private fallTime = 0;
  private listeners: { [K in keyof FlameEvents]?: ((p: FlameEvents[K]) => void)[] } = {};

  constructor(
    private grid: Grid,
    startX: number,
    startY: number,
    startDir: Dir,
    speed: number,
    fuel: { initial: number; max: number; perTile: number } = { initial: 100, max: 100, perTile: 0 },
    /** Blodia start: the flame enters tile (startX,startY) through this side instead of leaving a source. */
    enterFrom?: Dir,
  ) {
    super();
    this.fuel = new FuelTank(fuel.max, fuel.initial);
    this.fuelPerTile = fuel.perTile;
    if (enterFrom !== undefined) {
      const out = routeExit(grid.get(startX, startY), enterFrom) ?? enterFrom;
      this.x = startX;
      this.y = startY;
      this.entry = enterFrom;
      this.exit = out;
      this.heading = opposite(enterFrom);
      this.speed = speed;
      this.progress = 0;
      this.centreCrossed = false;
      this.updateWorldPosition();
      return;
    }
    this.x = startX;
    this.y = startY;
    this.entry = startDir; // the source behaves like a cap: we "come from" the opening
    this.exit = startDir;
    this.heading = startDir;
    this.speed = speed;
    this.updateWorldPosition();
  }

  on<K extends keyof FlameEvents>(evt: K, fn: (p: FlameEvents[K]) => void): void {
    const list = (this.listeners[evt] ??= []) as ((payload: FlameEvents[K]) => void)[];
    list.push(fn);
  }

  private emit<K extends keyof FlameEvents>(evt: K, p: FlameEvents[K]): void {
    const list = this.listeners[evt] as ((payload: FlameEvents[K]) => void)[] | undefined;
    list?.forEach((fn) => fn(p));
  }

  start(): void {
    if (this.status === 'waiting') this.status = 'moving';
  }

  /** The tile carrying the flame was slid: the flame travels with it. */
  moveWithTile(x: number, y: number): void {
    this.x = x;
    this.y = y;
    if (this.status === 'moving' || this.status === 'waiting' || this.status === 'arrived') this.updateWorldPosition();
  }

  /** 0..1 progress of the extinguish animation (fuel death). */
  get extinguishRatio(): number {
    return this.status === 'extinguishing' ? Math.min(1, this.extinguishTime / 0.7) : 0;
  }

  /** Is the flame currently inside tile (x,y)? */
  occupies(x: number, y: number): boolean {
    return (this.status === 'moving' || this.status === 'waiting') && this.x === x && this.y === y;
  }

  update(dt: number): void {
    if (this.status === 'moving') {
      const dist = this.speed * dt;
      this.progress += dist;
      this.travelled += dist;
      if (!this.inGoal && this.fuel.burn(dist * this.fuelPerTile)) {
        this.status = 'extinguishing';
        this.extinguishTime = 0;
        this.updateWorldPosition();
        this.emit('fuelEmpty', { wx: this.wx, wy: this.wy });
        return;
      }
      if (!this.centreCrossed && this.progress >= 0.5) {
        this.centreCrossed = true;
        this.emit('centre', { x: this.x, y: this.y });
        const here = this.grid.get(this.x, this.y);
        if (here.kind === 'warp') {
          const pair = this.grid.warpPair(this.x, this.y);
          if (pair) {
            const from = { x: this.x, y: this.y };
            this.x = pair.x;
            this.y = pair.y;
            const out = indexDir(this.grid.get(pair.x, pair.y).rotation);
            this.entry = out;
            this.exit = out;
            this.heading = out;
            this.emit('warp', { from, to: pair });
          }
        }
      }
      while (this.status === 'moving' && this.progress >= 1) {
        this.advance();
      }
      if (this.status === 'moving' && this.inGoal && this.progress >= 0.5) {
        this.progress = 0.5;
        this.status = 'arrived';
        this.updateWorldPosition();
        this.emit('arrived', { x: this.x, y: this.y });
        return;
      }
      this.updateWorldPosition();
    } else if (this.status === 'extinguishing') {
      this.extinguishTime += dt;
      if (this.extinguishTime >= 0.7) {
        this.status = 'dead';
        this.alive = false;
        this.emit('extinguished', { wx: this.wx, wy: this.wy });
      }
    } else if (this.status === 'falling') {
      this.fallTime += dt;
      this.fallVy += CONFIG.fall.gravity * dt;
      this.wx += this.fallVx * dt;
      this.wy += this.fallVy * dt;
      const waterLine = this.grid.height + 0.35;
      if (this.wy >= waterLine || this.fallTime > CONFIG.fall.maxDuration) {
        this.wy = Math.min(this.wy, waterLine);
        this.status = 'dead';
        this.alive = false;
        this.emit('splash', { wx: this.wx, wy: this.wy });
      }
    }
  }

  /** Cross into the next tile (or fall). Wraps around the board edges when the grid allows it. */
  private advance(): void {
    const next = this.grid.step(this.x, this.y, this.exit);
    const entry = opposite(this.exit);
    const tile = next ? this.grid.get(next.x, next.y) : null;
    const mask = next ? this.grid.maskAt(next.x, next.y) : 0;
    if (!next || !tile || tile.kind === 'empty' || !(mask & entry)) {
      this.beginFall();
      return;
    }
    const nx = next.x;
    const ny = next.y;
    this.progress -= 1;
    this.x = nx;
    this.y = ny;
    this.entry = entry;
    this.heading = this.exit;
    this.centreCrossed = false;
    if (tile.kind === 'goal') {
      this.inGoal = true;
      this.exit = entry;
      this.emit('enterTile', { x: nx, y: ny, entry, exit: entry });
      return;
    }
    const nextExit = routeExit(tile, entry);
    if (nextExit === null) {
      this.beginFall();
      return;
    }
    this.exit = nextExit;
    this.emit('enterTile', { x: nx, y: ny, entry, exit: nextExit });
    if (nextExit === entry) this.emit('bounce', { x: nx, y: ny });
  }

  private beginFall(): void {
    const edge = sideMid(this.exit);
    this.wx = this.x + edge.x;
    this.wy = this.y + edge.y;
    const { dx, dy } = dirDelta(this.exit);
    this.fallVx = dx * CONFIG.fall.launchSpeed;
    this.fallVy = dy * CONFIG.fall.launchSpeed - 0.5;
    this.fallTime = 0;
    this.status = 'falling';
    this.emit('fall', { x: this.x, y: this.y, dir: this.exit });
  }

  private updateWorldPosition(): void {
    const tile = this.grid.get(this.x, this.y);
    const local = tileLocalPosition(tile.kind, this.entry, this.exit, this.progress);
    this.wx = this.x + local.x;
    this.wy = this.y + local.y;
  }
}
