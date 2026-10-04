import type { AudioManager } from '../audio/AudioManager';
import { EventEmitter } from '../core/EventEmitter';
import type { LevelDef } from '../level/LevelDef';
import { emberUse, type EmberUseId } from '../player/Embers';
import { Lives } from '../player/Lives';
import type { Progress } from '../player/Progress';
import { computeLevelScore, type ScoreBreakdown } from '../player/Scoring';
import { CONFIG } from './Config';
import type { GameState } from './GameStates';
import { LevelSession, type DeathCause } from './LevelSession';

export interface GameEvents {
  stateChanged: { from: GameState; to: GameState };
  levelLoaded: { level: LevelDef; index: number };
  livesChanged: { lives: number };
  scoreChanged: { score: number };
  death: { cause: DeathCause; livesLeft: number };
  levelComplete: { level: LevelDef; breakdown: ScoreBreakdown; runScore: number; newHighScore: boolean; isLast: boolean };
  gameOver: { score: number; highScore: boolean; levelId: number };
  embersChanged: { embers: number };
  boostUsed: { id: EmberUseId; cost: number };
  boostRefused: { id: EmberUseId; cost: number };
}

/**
 * Top-level game controller and state machine. Owns the current run (lives,
 * score, level index) and the current LevelSession. DOM-free: the UI layer
 * subscribes to `events` and calls the public methods.
 */
export class Game {
  state: GameState = 'TITLE';
  readonly events = new EventEmitter<GameEvents>();
  session: LevelSession | null = null;
  levelIndex = 0;
  lives = new Lives(CONFIG.startingLives);
  score = 0;
  deathsThisLevel = 0;
  lastDeathCause: DeathCause = 'water';
  lastBreakdown: ScoreBreakdown | null = null;
  private deathTimer = 0;
  private stateBeforePause: GameState = 'PLAYING';
  /** A level injected by the debug tools (procedural preview). Cleared by loadLevel(). */
  private customLevel: LevelDef | null = null;

  constructor(
    public readonly levels: LevelDef[],
    public readonly progress: Progress,
    public readonly audio: AudioManager,
  ) {}

  get currentLevel(): LevelDef {
    return this.customLevel ?? this.levels[this.levelIndex];
  }

  private get isDebugLevel(): boolean {
    return !!this.currentLevel.tags?.includes('debug');
  }

  /** Debug: play an arbitrary level definition without touching progress. */
  loadCustomLevel(def: LevelDef): void {
    this.customLevel = { ...def, tags: [...(def.tags ?? []), 'debug'] };
    this.deathsThisLevel = 0;
    this.createSession();
  }

  setState(to: GameState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.events.emit('stateChanged', { from, to });
  }

  // ----- navigation ---------------------------------------------------------

  toTitle(): void {
    this.session = null;
    this.setState('TITLE');
  }

  toLevelSelect(): void {
    this.session = null;
    this.setState('LEVEL_SELECT');
  }

  toOptions(): void {
    this.setState('OPTIONS');
  }

  /** Start a fresh run (lives + score reset) at the given level index. */
  startRun(levelIndex = 0): void {
    this.lives.reset();
    this.score = 0;
    this.events.emit('livesChanged', { lives: this.lives.count });
    this.events.emit('scoreChanged', { score: this.score });
    this.loadLevel(levelIndex);
  }

  /** Continue from the title: jump to the furthest unlocked level. */
  continueRun(): void {
    const furthest = this.progress.furthestUnlocked;
    const idx = Math.min(this.levels.length - 1, Math.max(0, this.levels.findIndex((l) => l.id === furthest)));
    this.startRun(idx < 0 ? 0 : idx);
  }

  loadLevel(index: number): void {
    this.customLevel = null;
    this.levelIndex = Math.max(0, Math.min(this.levels.length - 1, index));
    this.deathsThisLevel = 0;
    this.progress.setCurrentLevel(this.currentLevel.id);
    this.createSession();
  }

  /** Spend embers on a boost during play. */
  useBoost(id: EmberUseId): boolean {
    if (this.state !== 'PLAYING' || !this.session || this.session.phase === 'won' || this.session.phase === 'lost') return false;
    const use = emberUse(id);
    if (!this.progress.spendEmbers(use.cost)) {
      this.events.emit('boostRefused', { id, cost: use.cost });
      return false;
    }
    this.session.applyBoost(id);
    this.events.emit('embersChanged', { embers: this.progress.embers });
    this.events.emit('boostUsed', { id, cost: use.cost });
    return true;
  }

  get embers(): number {
    return this.progress.embers;
  }

  setFastForward(on: boolean): void {
    this.session?.setFastForwardHeld(on && this.state === 'PLAYING');
  }

  private createSession(): void {
    const def = this.currentLevel;
    const session = new LevelSession(def, this.isDebugLevel ? [] : this.progress.collectedPickups(def.id));
    this.session = session;
    if (!this.isDebugLevel) this.progress.noteAttempt(def.id);
    session.events.on('death', ({ cause }) => this.onDeath(cause));
    session.events.on('won', ({ timeRemaining }) => this.onWon(timeRemaining));
    this.events.emit('levelLoaded', { level: def, index: this.levelIndex });
    this.setState('PLAYING');
  }

  restartLevel(): void {
    if (!this.session) return;
    this.createSession();
  }

  nextLevel(): void {
    if (this.levelIndex + 1 >= this.levels.length) {
      this.toLevelSelect();
      return;
    }
    this.loadLevel(this.levelIndex + 1);
  }

  previousLevel(): void {
    this.loadLevel(this.levelIndex - 1);
  }

  pause(): void {
    if (this.state !== 'PLAYING') return;
    this.stateBeforePause = this.state;
    this.setState('PAUSED');
  }

  resume(): void {
    if (this.state !== 'PAUSED') return;
    this.setState(this.stateBeforePause);
  }

  togglePause(): void {
    if (this.state === 'PAUSED') this.resume();
    else this.pause();
  }

  /** After game over: same level, fresh lives, score reset. */
  continueAfterGameOver(): void {
    this.startRun(this.levelIndex);
  }

  // ----- input --------------------------------------------------------------

  slideAt(x: number, y: number): void {
    if (this.state !== 'PLAYING' || !this.session) return;
    this.session.slide(x, y);
  }

  // ----- simulation ---------------------------------------------------------

  update(dt: number): void {
    if (this.state === 'PLAYING' && this.session) {
      this.session.update(dt);
    } else if (this.state === 'DEATH' && this.session) {
      this.session.update(dt);
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.afterDeath();
    } else if (this.state === 'LEVEL_COMPLETE' && this.session) {
      this.session.update(dt);
    }
  }

  private onDeath(cause: DeathCause): void {
    this.lastDeathCause = cause;
    this.deathsThisLevel++;
    const left = this.lives.lose();
    this.events.emit('livesChanged', { lives: left });
    this.events.emit('death', { cause, livesLeft: left });
    this.deathTimer = CONFIG.deathDelay;
    this.setState('DEATH');
  }

  /** Called when the death animation is over (or the player taps through it). */
  afterDeath(): void {
    if (this.state !== 'DEATH') return;
    if (this.lives.isEmpty) {
      const newHigh = this.progress.submitRunScore(this.score);
      this.events.emit('gameOver', { score: this.score, highScore: newHigh, levelId: this.currentLevel.id });
      this.setState('GAME_OVER');
    } else {
      this.createSession();
    }
  }

  private onWon(timeRemaining: number): void {
    const def = this.currentLevel;
    const session = this.session!;
    const outcome = { ...session.outcome(), deathsThisLevel: this.deathsThisLevel };
    const breakdown = computeLevelScore(def, outcome, this.lives.count, session.maxFuel);
    this.lastBreakdown = breakdown;
    this.score += breakdown.total;
    this.events.emit('scoreChanged', { score: this.score });
    if (!this.isDebugLevel) {
      // Rewards for pickups are granted once per level: remember what was collected.
      this.progress.notePickups(def.id, session.collected);
      this.progress.noteCompletion(
        def.id,
        breakdown.stars,
        breakdown.total,
        timeRemaining,
        breakdown.objectives.map((o) => o.met),
      );
      this.progress.addEmbers(breakdown.embersEarned + session.embersCollected);
      this.events.emit('embersChanged', { embers: this.progress.embers });
    }
    const newHigh = this.isDebugLevel ? false : this.progress.submitRunScore(this.score);
    this.events.emit('levelComplete', {
      level: def,
      breakdown,
      runScore: this.score,
      newHighScore: newHigh,
      isLast: this.levelIndex + 1 >= this.levels.length,
    });
    this.setState('LEVEL_COMPLETE');
  }
}
