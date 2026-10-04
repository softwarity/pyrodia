/**
 * Audio abstraction. Game code only ever calls these named events; the backend
 * decides how to play them. The default backend synthesises placeholder sounds
 * with WebAudio so no asset files are needed. Replace `WebAudioBackend` with a
 * sample based one (or a native bridge) later without touching gameplay code.
 */
export type SoundEvent =
  | 'slideTile'
  | 'slideDenied'
  | 'flameMove'
  | 'flameDanger'
  | 'flameBounce'
  | 'flameDeath'
  | 'waterSplash'
  | 'levelComplete'
  | 'gameOver'
  | 'buttonClick'
  | 'fuelCollected'
  | 'lowFuel'
  | 'perfectLevel'
  | 'boost'
  | 'ready';

export interface AudioBackend {
  play(event: SoundEvent): void;
  setEnabled(enabled: boolean): void;
  unlock(): void;
}

export class AudioManager {
  private enabled = true;

  constructor(private backend: AudioBackend) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.backend.setEnabled(enabled);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Browsers need a user gesture before audio can start. */
  unlock(): void {
    this.backend.unlock();
  }

  play(event: SoundEvent): void {
    if (!this.enabled) return;
    this.backend.play(event);
  }

  slideTile(): void {
    this.play('slideTile');
  }
  slideDenied(): void {
    this.play('slideDenied');
  }
  flameMove(): void {
    this.play('flameMove');
  }
  flameDanger(): void {
    this.play('flameDanger');
  }
  flameBounce(): void {
    this.play('flameBounce');
  }
  flameDeath(): void {
    this.play('flameDeath');
  }
  waterSplash(): void {
    this.play('waterSplash');
  }
  levelComplete(): void {
    this.play('levelComplete');
  }
  gameOver(): void {
    this.play('gameOver');
  }
  buttonClick(): void {
    this.play('buttonClick');
  }
  ready(): void {
    this.play('ready');
  }
  fuelCollected(): void {
    this.play('fuelCollected');
  }
  lowFuel(): void {
    this.play('lowFuel');
  }
  perfectLevel(): void {
    this.play('perfectLevel');
  }
  boost(): void {
    this.play('boost');
  }
}

export class SilentAudioBackend implements AudioBackend {
  play(): void {}
  setEnabled(): void {}
  unlock(): void {}
}
