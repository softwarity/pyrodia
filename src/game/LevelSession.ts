import { EventEmitter } from '../core/EventEmitter';
import type { Entity } from '../entities/Entity';
import { Flame } from '../entities/Flame';
import type { LevelDef, ParsedLevel } from '../level/LevelDef';
import type { LevelOutcome } from '../level/Objectives';
import { parseLevel } from '../level/LevelParser';
import { emberUse, type EmberUseId } from '../player/Embers';
import { FUEL_CONFIG, type PickupKind } from '../player/Fuel';
import type { Dir } from '../puzzle/Direction';
import type { Cell, Grid, SlideMove } from '../puzzle/Grid';
import { predictPath, type PathPrediction } from '../puzzle/PathSim';
import { CONFIG } from './Config';

export type SessionPhase = 'ready' | 'running' | 'won' | 'lost';
export type DeathCause = 'water' | 'timeout' | 'fuel';

export interface SessionEvents {
  slide: { from: Cell; to: Cell };
  slideDenied: { x: number; y: number; reason: 'fixed' | 'occupied' | 'noVoid' | 'void' };
  started: undefined;
  enterTile: { x: number; y: number };
  bounce: { x: number; y: number };
  danger: { stepsAway: number };
  fall: { x: number; y: number; dir: Dir };
  death: { cause: DeathCause; wx: number; wy: number };
  won: { timeRemaining: number };
  pickup: { x: number; y: number; kind: PickupKind; fuelAdded: number; embers: number; firstTime: boolean };
  lowFuel: undefined;
  boost: { id: EmberUseId };
}

/** Visual slide animation (not part of the simulation). */
export interface SlideAnim {
  /** Offset in tiles from where the tile now sits back to where it came from. */
  dx: number;
  dy: number;
  t: number;
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
  readonly events = new EventEmitter<SessionEvents>();
  readonly maxFuel: number;
  /** Pickups collected during this attempt (ids). */
  readonly collected = new Set<number>();
  /** Pickups collected on previous attempts of this level (rewards already granted). */
  readonly previouslyCollected: Set<number>;
  readonly pickupsTotal: number;
  newPickups = 0;
  embersCollected = 0;
  boostsUsed = 0;
  phase: SessionPhase = 'ready';
  /** Seconds until the flame starts moving. */
  readyTimer: number;
  timeRemaining: number;
  elapsed = 0;
  slides = 0;
  prediction: PathPrediction | null = null;
  readonly slideAnims = new Map<number, SlideAnim>();
  readonly shakes = new Map<number, number>();
  /** Pickup collection animations keyed by pickup id (visual only). */
  readonly pickupAnims = new Map<number, { x: number; y: number; kind: PickupKind; t: number }>();
  private accumulator = 0;
  private dangerWarned = false;
  private lowFuelWarned = false;
  private speedMultiplier = 1;

  /** The primary flame (levels have exactly one for now). */
  get flame(): Flame {
    return this.flames[0];
  }

  constructor(def: LevelDef, previouslyCollected: Iterable<number> = []) {
    this.def = def;
    this.parsed = parseLevel(def);
    this.grid = this.parsed.grid;
    this.previouslyCollected = new Set(previouslyCollected);
    this.pickupsTotal = this.parsed.pickupCount;
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
    flame.on('centre', ({ x, y }) => this.collectAt(x, y, flame));
    flame.on('extinguished', (p) => {
      if (this.phase !== 'running') return;
      this.phase = 'lost';
      this.events.emit('death', { cause: 'fuel', wx: p.wx, wy: p.wy });
    });
    flame.on('enterTile', (p) => {
      this.dangerWarned = false;
      this.events.emit('enterTile', { x: p.x, y: p.y });
    });
    flame.on('bounce', (p) => this.events.emit('bounce', p));
    flame.on('fall', (p) => this.events.emit('fall', p));
    flame.on('splash', (p) => {
      if (this.phase !== 'running') return;
      this.phase = 'lost';
      this.events.emit('death', { cause: 'water', wx: p.wx, wy: p.wy });
    });
    flame.on('arrived', () => {
      if (this.phase !== 'running') return;
      this.phase = 'won';
      this.events.emit('won', { timeRemaining: this.timeRemaining });
    });
    this.refreshPrediction();
  }

  /** The intended solution: slides that undo the scramble (for debug / hints). */
  get knownSolution(): SlideMove[] {
    return this.parsed.solution;
  }

  private collectAt(x: number, y: number, flame: Flame): void {
    const t = this.grid.get(x, y);
    if (!t.pickup || t.pickupId === undefined || this.collected.has(t.pickupId)) return;
    const kind = t.pickup;
    const id = t.pickupId;
    this.collected.add(id);
    const firstTime = !this.previouslyCollected.has(id);
    const fuelAdded = flame.fuel.add(FUEL_CONFIG.pickupFuel[kind]);
    const embers = firstTime ? FUEL_CONFIG.pickupEmbers[kind] : 0;
    if (firstTime) this.newPickups++;
    this.embersCollected += embers;
    this.lowFuelWarned = false;
    this.pickupAnims.set(id, { x, y, kind, t: 0.6 });
    delete t.pickup;
    delete t.pickupId;
    this.events.emit('pickup', { x, y, kind, fuelAdded, embers, firstTime });
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
      pickupsCollected: this.collected.size,
      pickupsTotal: this.pickupsTotal,
      newPickups: this.newPickups,
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

  /** Player input: slide the tile at (x,y) into the adjacent void. */
  slide(x: number, y: number): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const tile = this.grid.tryGet(x, y);
    if (!tile) return false;
    const idx = y * this.grid.width + x;
    if (tile.kind === 'empty') {
      this.events.emit('slideDenied', { x, y, reason: 'void' });
      return false;
    }
    if (tile.locked) {
      this.shakes.set(idx, 1);
      this.events.emit('slideDenied', { x, y, reason: 'fixed' });
      return false;
    }
    if (this.flame.occupies(x, y) && this.phase === 'running') {
      this.shakes.set(idx, 1);
      this.events.emit('slideDenied', { x, y, reason: 'occupied' });
      return false;
    }
    const target = this.grid.slide(x, y);
    if (!target) {
      this.shakes.set(idx, 1);
      this.events.emit('slideDenied', { x, y, reason: 'noVoid' });
      return false;
    }
    this.slides++;
    this.slideAnims.set(target.y * this.grid.width + target.x, { dx: x - target.x, dy: y - target.y, t: 0 });
    this.refreshPrediction();
    this.events.emit('slide', { from: { x, y }, to: target });
    return true;
  }

  /** Advance the simulation by dt seconds (variable), using fixed sub-steps. */
  update(dt: number): void {
    for (const [k, a] of this.slideAnims) {
      a.t = Math.min(1, a.t + dt / CONFIG.slideAnimDuration);
      if (a.t >= 1) this.slideAnims.delete(k);
    }
    for (const [k, v] of this.shakes) {
      const nv = v - dt * 4;
      if (nv <= 0) this.shakes.delete(k);
      else this.shakes.set(k, nv);
    }
    for (const [k, a] of this.pickupAnims) {
      a.t -= dt;
      if (a.t <= 0) this.pickupAnims.delete(k);
    }
    if (this.phase === 'won' || this.phase === 'lost') {
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
