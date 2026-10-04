import { EventEmitter } from '../core/EventEmitter';
import type { Entity } from '../entities/Entity';
import { Flame } from '../entities/Flame';
import { Pickup } from '../entities/Pickup';
import type { LevelDef, ParsedLevel } from '../level/LevelDef';
import type { LevelOutcome } from '../level/Objectives';
import { parseLevel } from '../level/LevelParser';
import { emberUse, type EmberUseId } from '../player/Embers';
import { FUEL_CONFIG, type PickupKind } from '../player/Fuel';
import type { Dir } from '../puzzle/Direction';
import type { Grid } from '../puzzle/Grid';
import { predictPath, type PathPrediction } from '../puzzle/PathSim';
import { CONFIG } from './Config';

export type SessionPhase = 'ready' | 'running' | 'won' | 'lost';
export type DeathCause = 'water' | 'timeout' | 'fuel';

export interface SessionEvents {
  rotate: { x: number; y: number; clockwise: boolean };
  rotateDenied: { x: number; y: number; reason: 'locked' | 'occupied' | 'fixed' };
  started: undefined;
  enterTile: { x: number; y: number };
  bounce: { x: number; y: number };
  danger: { stepsAway: number };
  fall: { x: number; y: number; dir: Dir };
  death: { cause: DeathCause; wx: number; wy: number };
  won: { timeRemaining: number };
  pickup: { x: number; y: number; kind: PickupKind; fuelAdded: number; embers: number };
  lowFuel: undefined;
  boost: { id: EmberUseId };
}

/**
 * One attempt at one level: owns the grid, the flame and the timer.
 * Pure simulation; it knows nothing about rendering or the DOM.
 */
export class LevelSession {
  readonly def: LevelDef;
  readonly parsed: ParsedLevel;
  readonly grid: Grid;
  /** Every entity on the board. Flames first; more entity kinds can be added freely. */
  readonly entities: Entity[] = [];
  readonly flames: Flame[] = [];
  readonly pickups: Pickup[] = [];
  readonly events = new EventEmitter<SessionEvents>();
  readonly maxFuel: number;
  pickupsCollected = 0;
  embersCollected = 0;
  boostsUsed = 0;
  phase: SessionPhase = 'ready';
  /** Seconds until the flame starts moving. */
  readyTimer: number;
  timeRemaining: number;
  elapsed = 0;
  rotations = 0;
  prediction: PathPrediction | null = null;
  /** Visual rotation animations keyed by cell index (not part of the simulation). */
  readonly tileAnims = new Map<number, { from: number; t: number; shake: number }>();
  private accumulator = 0;
  private dangerWarned = false;
  private lowFuelWarned = false;
  private speedMultiplier = 1;

  /** The primary flame (levels have exactly one for now). */
  get flame(): Flame {
    return this.flames[0];
  }

  constructor(def: LevelDef) {
    this.def = def;
    this.parsed = parseLevel(def);
    this.grid = this.parsed.grid;
    this.readyTimer = CONFIG.readyDelay;
    this.timeRemaining = def.timeLimit;
    const s = this.parsed.start;
    this.maxFuel = def.maxFuel ?? FUEL_CONFIG.defaultMaxFuel;
    const flame = new Flame(this.grid, s.x, s.y, s.dir, def.flameSpeed, {
      initial: def.initialFuel ?? FUEL_CONFIG.defaultInitialFuel,
      max: this.maxFuel,
      perTile: def.fuelPerTile ?? FUEL_CONFIG.defaultFuelPerTile,
    });
    this.flames.push(flame);
    this.entities.push(flame);
    for (const p of def.pickups ?? []) {
      const pickup = new Pickup(p.x, p.y, p.kind);
      this.pickups.push(pickup);
      this.entities.push(pickup);
    }
    flame.on('centre', ({ x, y }) => this.collectAt(x, y, flame));
    flame.on('fuelEmpty', () => undefined);
    flame.on('extinguished', (p) => {
      if (this.phase !== 'running') return;
      this.phase = 'lost';
      this.events.emit('death', { cause: 'fuel', wx: p.wx, wy: p.wy });
    });
    this.flame.on('enterTile', (p) => {
      this.dangerWarned = false;
      this.events.emit('enterTile', { x: p.x, y: p.y });
    });
    this.flame.on('bounce', (p) => this.events.emit('bounce', p));
    this.flame.on('fall', (p) => this.events.emit('fall', p));
    this.flame.on('splash', (p) => {
      if (this.phase !== 'running') return;
      this.phase = 'lost';
      this.events.emit('death', { cause: 'water', wx: p.wx, wy: p.wy });
    });
    this.flame.on('arrived', () => {
      if (this.phase !== 'running') return;
      this.phase = 'won';
      this.events.emit('won', { timeRemaining: this.timeRemaining });
    });
    this.refreshPrediction();
  }

  private collectAt(x: number, y: number, flame: Flame): void {
    for (const p of this.pickups) {
      if (p.collected || p.x !== x || p.y !== y) continue;
      p.collected = true;
      p.collectAnim = 0.6;
      const fuelAdded = flame.fuel.add(FUEL_CONFIG.pickupFuel[p.fuelKind]);
      const embers = FUEL_CONFIG.pickupEmbers[p.fuelKind];
      this.pickupsCollected++;
      this.embersCollected += embers;
      this.lowFuelWarned = false;
      this.events.emit('pickup', { x, y, kind: p.fuelKind, fuelAdded, embers });
    }
  }

  /** Spend-embers boosts. The Game checks and deducts the embers; this applies the effect. */
  applyBoost(id: EmberUseId): void {
    const use = emberUse(id);
    if (use.fuel) this.flame.fuel.add(use.fuel);
    if (use.seconds) this.timeRemaining = Math.min(this.def.timeLimit, this.timeRemaining + use.seconds);
    this.boostsUsed++;
    this.lowFuelWarned = false;
    this.events.emit('boost', { id });
  }

  outcome(): LevelOutcome {
    return {
      elapsed: this.elapsed,
      timeRemaining: this.timeRemaining,
      fuelRemaining: this.flame.fuel.current,
      deathsThisLevel: 0,
      pickupsCollected: this.pickupsCollected,
      pickupsTotal: this.pickups.length,
      boostsUsed: this.boostsUsed,
    };
  }

  setSpeedMultiplier(m: number): void {
    this.speedMultiplier = m;
    this.flame.speed = this.def.flameSpeed * m;
  }

  get speedMultiplierValue(): number {
    return this.speedMultiplier;
  }

  /** Player input: rotate a tile. */
  rotate(x: number, y: number, clockwise = true): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const tile = this.grid.tryGet(x, y);
    if (!tile || tile.kind === 'empty') return false;
    const idx = y * this.grid.width + x;
    if (tile.kind === 'source' || tile.kind === 'goal') {
      this.events.emit('rotateDenied', { x, y, reason: 'fixed' });
      return false;
    }
    if (tile.locked) {
      this.tileAnims.set(idx, { from: tile.rotation, t: 1, shake: 1 });
      this.events.emit('rotateDenied', { x, y, reason: 'locked' });
      return false;
    }
    if (this.flame.occupies(x, y) && this.phase === 'running') {
      this.tileAnims.set(idx, { from: tile.rotation, t: 1, shake: 1 });
      this.events.emit('rotateDenied', { x, y, reason: 'occupied' });
      return false;
    }
    const from = tile.rotation;
    if (!this.grid.rotate(x, y, clockwise)) return false;
    this.rotations++;
    this.tileAnims.set(idx, { from: clockwise ? from : from + 2, t: 0, shake: 0 });
    // if the flame is sitting in the source and this is its first tile, the prediction changes
    this.refreshPrediction();
    this.events.emit('rotate', { x, y, clockwise });
    return true;
  }

  /** Advance the simulation by dt seconds (variable), using fixed sub-steps. */
  update(dt: number): void {
    // visual animations always advance
    for (const [k, a] of this.tileAnims) {
      a.t = Math.min(1, a.t + dt / CONFIG.rotateAnimDuration);
      if (a.shake > 0) a.shake = Math.max(0, a.shake - dt * 4);
      if (a.t >= 1 && a.shake <= 0) this.tileAnims.delete(k);
    }
    for (const p of this.pickups) p.update(dt);
    if (this.phase === 'won' || this.phase === 'lost') {
      // let the flame finish falling / fading for the death animation
      if (this.flame.status === 'falling' || this.flame.status === 'extinguishing') this.flame.update(dt);
      return;
    }
    if (this.phase === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) {
        this.phase = 'running';
        this.flame.start();
        this.events.emit('started', undefined);
      } else {
        return;
      }
    }
    this.accumulator += dt;
    const step = CONFIG.simStep;
    while (this.accumulator >= step && this.phase === 'running') {
      this.accumulator -= step;
      this.elapsed += step;
      this.timeRemaining -= step;
      this.flame.update(step);
      if (this.phase === 'running' && this.flame.status === 'moving' && this.flame.fuel.isLow && !this.lowFuelWarned) {
        this.lowFuelWarned = true;
        this.events.emit('lowFuel', undefined);
      }
      if (this.timeRemaining <= 0 && this.phase === 'running' && this.flame.status === 'moving') {
        this.timeRemaining = 0;
        this.phase = 'lost';
        this.flame.status = 'dead';
        this.flame.alive = false;
        this.events.emit('death', { cause: 'timeout', wx: this.flame.wx, wy: this.flame.wy });
      }
    }
    this.refreshPrediction();
  }

  /** Recompute where the flame will go from its current tile. */
  refreshPrediction(): void {
    if (this.flame.status !== 'moving' && this.flame.status !== 'waiting') {
      this.prediction = null;
      return;
    }
    const steps = Math.max(this.def.lookahead, 0);
    this.prediction = steps > 0 ? predictPath(this.grid, this.flame.x, this.flame.y, this.flame.exit, steps) : null;
    if (this.prediction && this.prediction.end.type === 'fall' && !this.dangerWarned && this.phase === 'running') {
      this.dangerWarned = true;
      this.events.emit('danger', { stepsAway: this.prediction.steps.length });
    }
  }

  /** Full predicted path (debug). */
  fullPrediction(): PathPrediction | null {
    if (this.flame.status !== 'moving' && this.flame.status !== 'waiting') return null;
    return predictPath(this.grid, this.flame.x, this.flame.y, this.flame.exit, CONFIG.debugPathSteps);
  }
}
