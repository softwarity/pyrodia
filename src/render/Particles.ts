export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

/** Tiny particle pool. Coordinates are in tile units (converted at draw time). */
export class ParticleSystem {
  particles: Particle[] = [];
  readonly max = 400;

  spawn(p: Omit<Particle, 'life'> & { life?: number }): void {
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push({ ...p, life: p.life ?? p.maxLife });
  }

  burst(x: number, y: number, count: number, colors: string[], speed: number, size: number, gravity = 0, life = 0.6): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        maxLife: life * (0.5 + Math.random() * 0.5),
        size: size * (0.5 + Math.random()),
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity,
      });
    }
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      out.push(p);
    }
    this.particles = out;
  }

  clear(): void {
    this.particles = [];
  }
}
