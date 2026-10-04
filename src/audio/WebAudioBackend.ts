import type { AudioBackend, SoundEvent } from './AudioManager';

type Wave = OscillatorType;

interface Note {
  freq: number;
  endFreq?: number;
  dur: number;
  type?: Wave;
  gain?: number;
  delay?: number;
}

/** Procedural placeholder sounds built from oscillators and noise. */
export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  unlock(): void {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  play(event: SoundEvent): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    switch (event) {
      case 'slideTile':
        this.notes([{ freq: 300, endFreq: 520, dur: 0.09, type: 'triangle', gain: 0.3 }]);
        this.noise(0.08, 0.15, 1500);
        break;
      case 'slideDenied':
        this.notes([{ freq: 180, endFreq: 120, dur: 0.12, type: 'sawtooth', gain: 0.3 }]);
        break;
      case 'flameMove':
        this.notes([{ freq: 300, endFreq: 420, dur: 0.05, type: 'triangle', gain: 0.08 }]);
        break;
      case 'flameBounce':
        this.notes([{ freq: 440, endFreq: 330, dur: 0.1, type: 'triangle', gain: 0.25 }]);
        break;
      case 'flameDanger':
        this.notes([
          { freq: 880, dur: 0.08, type: 'square', gain: 0.2 },
          { freq: 880, dur: 0.08, type: 'square', gain: 0.2, delay: 0.14 },
        ]);
        break;
      case 'flameDeath':
        this.notes([{ freq: 400, endFreq: 60, dur: 0.5, type: 'sawtooth', gain: 0.3 }]);
        break;
      case 'waterSplash':
        this.noise(0.35, 0.5, 900);
        break;
      case 'levelComplete':
        this.notes([
          { freq: 523, dur: 0.12, type: 'square', gain: 0.25 },
          { freq: 659, dur: 0.12, type: 'square', gain: 0.25, delay: 0.12 },
          { freq: 784, dur: 0.12, type: 'square', gain: 0.25, delay: 0.24 },
          { freq: 1046, dur: 0.3, type: 'square', gain: 0.3, delay: 0.36 },
        ]);
        break;
      case 'gameOver':
        this.notes([
          { freq: 392, dur: 0.25, type: 'sawtooth', gain: 0.25 },
          { freq: 330, dur: 0.25, type: 'sawtooth', gain: 0.25, delay: 0.25 },
          { freq: 262, dur: 0.6, type: 'sawtooth', gain: 0.3, delay: 0.5 },
        ]);
        break;
      case 'buttonClick':
        this.notes([{ freq: 700, endFreq: 900, dur: 0.05, type: 'square', gain: 0.18 }]);
        break;
      case 'fuelCollected':
        this.notes([
          { freq: 740, dur: 0.07, type: 'triangle', gain: 0.25 },
          { freq: 1100, dur: 0.12, type: 'triangle', gain: 0.25, delay: 0.07 },
        ]);
        break;
      case 'lowFuel':
        this.notes([{ freq: 330, endFreq: 260, dur: 0.25, type: 'triangle', gain: 0.22 }]);
        break;
      case 'perfectLevel':
        this.notes([
          { freq: 659, dur: 0.1, type: 'square', gain: 0.22 },
          { freq: 880, dur: 0.1, type: 'square', gain: 0.22, delay: 0.1 },
          { freq: 1318, dur: 0.1, type: 'square', gain: 0.22, delay: 0.2 },
          { freq: 1760, dur: 0.45, type: 'square', gain: 0.28, delay: 0.3 },
        ]);
        break;
      case 'boost':
        this.notes([{ freq: 400, endFreq: 1200, dur: 0.25, type: 'sawtooth', gain: 0.2 }]);
        break;
      case 'warp':
        this.notes([
          { freq: 900, endFreq: 300, dur: 0.12, type: 'sine', gain: 0.22 },
          { freq: 300, endFreq: 1200, dur: 0.16, type: 'sine', gain: 0.22, delay: 0.1 },
        ]);
        break;
      case 'ready':
        this.notes([{ freq: 660, dur: 0.1, type: 'triangle', gain: 0.25 }, { freq: 990, dur: 0.18, type: 'triangle', gain: 0.25, delay: 0.12 }]);
        break;
    }
  }

  private notes(list: Note[]): void {
    const ctx = this.ctx!;
    const master = this.master!;
    for (const n of list) {
      const t0 = ctx.currentTime + (n.delay ?? 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.freq, t0);
      if (n.endFreq) osc.frequency.exponentialRampToValueAtTime(n.endFreq, t0 + n.dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(n.gain ?? 0.2, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.02);
    }
  }

  private noise(dur: number, gain: number, cutoff: number): void {
    const ctx = this.ctx!;
    const master = this.master!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start();
  }
}
