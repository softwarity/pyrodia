import type { KeyValueStorage } from '../persistence/Storage';

export interface LevelRecord {
  completed: boolean;
  stars: number;
  bestScore: number;
  bestTime: number; // best remaining time
  attempts: number;
  /** Objectives met on the best run, by objective index. */
  objectives?: boolean[];
}

export interface Settings {
  sound: boolean;
  music: boolean;
  showHints: boolean;
}

interface ProgressData {
  levels: Record<string, LevelRecord>;
  highScore: number;
  embers: number;
  embersEarnedTotal: number;
  currentLevel: number;
  settings: Settings;
  unlockAll: boolean;
}

const KEY = 'progress.v1';

const DEFAULT: ProgressData = {
  levels: {},
  highScore: 0,
  embers: 0,
  embersEarnedTotal: 0,
  currentLevel: 1,
  settings: { sound: true, music: true, showHints: true },
  unlockAll: false,
};

/** Persistent player progress (per-level results, high score, settings). */
export class Progress {
  private data: ProgressData;

  constructor(private storage: KeyValueStorage) {
    const loaded = storage.get<Partial<ProgressData>>(KEY, {});
    this.data = { ...DEFAULT, ...loaded, settings: { ...DEFAULT.settings, ...(loaded.settings ?? {}) }, levels: loaded.levels ?? {} };
  }

  private save(): void {
    this.storage.set(KEY, this.data);
  }

  get highScore(): number {
    return this.data.highScore;
  }

  get embers(): number {
    return this.data.embers;
  }

  get embersEarnedTotal(): number {
    return this.data.embersEarnedTotal;
  }

  addEmbers(n: number): void {
    if (n <= 0) return;
    this.data.embers += n;
    this.data.embersEarnedTotal += n;
    this.save();
  }

  /** Returns false when the player cannot afford it. */
  spendEmbers(n: number): boolean {
    if (this.data.embers < n) return false;
    this.data.embers -= n;
    this.save();
    return true;
  }

  get currentLevel(): number {
    return this.data.currentLevel;
  }

  setCurrentLevel(id: number): void {
    this.data.currentLevel = id;
    this.save();
  }

  /** Serializable snapshot of the player profile. */
  profile(): { highScore: number; embers: number; currentLevel: number; unlockedLevels: number; totalStars: number; levelResults: Record<string, LevelRecord> } {
    return {
      highScore: this.data.highScore,
      embers: this.data.embers,
      currentLevel: this.data.currentLevel,
      unlockedLevels: this.furthestUnlocked,
      totalStars: this.totalStars,
      levelResults: this.data.levels,
    };
  }

  get settings(): Settings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  record(levelId: number): LevelRecord | undefined {
    return this.data.levels[String(levelId)];
  }

  isCompleted(levelId: number): boolean {
    return !!this.record(levelId)?.completed;
  }

  isUnlocked(levelId: number): boolean {
    if (this.data.unlockAll || levelId <= 1) return true;
    return this.isCompleted(levelId - 1);
  }

  /** Highest level the player may play. */
  get furthestUnlocked(): number {
    let id = 1;
    while (this.isCompleted(id)) id++;
    return id;
  }

  noteAttempt(levelId: number): void {
    const r = this.data.levels[String(levelId)] ?? { completed: false, stars: 0, bestScore: 0, bestTime: 0, attempts: 0 };
    r.attempts++;
    this.data.levels[String(levelId)] = r;
    this.save();
  }

  noteCompletion(levelId: number, stars: number, score: number, timeRemaining: number, objectives: boolean[] = []): void {
    const r = this.data.levels[String(levelId)] ?? { completed: false, stars: 0, bestScore: 0, bestTime: 0, attempts: 0 };
    r.completed = true;
    r.stars = Math.max(r.stars, stars);
    r.bestScore = Math.max(r.bestScore, score);
    r.bestTime = Math.max(r.bestTime, timeRemaining);
    r.objectives = objectives.map((met, i) => met || !!r.objectives?.[i]);
    this.data.levels[String(levelId)] = r;
    this.save();
  }

  /** Returns true if this is a new high score. */
  submitRunScore(score: number): boolean {
    if (score > this.data.highScore) {
      this.data.highScore = score;
      this.save();
      return true;
    }
    return false;
  }

  /** Sum of best scores across levels. */
  get totalBestScore(): number {
    return Object.values(this.data.levels).reduce((a, r) => a + r.bestScore, 0);
  }

  get totalStars(): number {
    return Object.values(this.data.levels).reduce((a, r) => a + r.stars, 0);
  }

  setUnlockAll(v: boolean): void {
    this.data.unlockAll = v;
    this.save();
  }

  get unlockAll(): boolean {
    return this.data.unlockAll;
  }

  reset(): void {
    this.data = { ...DEFAULT, levels: {}, settings: { ...this.data.settings } };
    this.save();
  }
}
