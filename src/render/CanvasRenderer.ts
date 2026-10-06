import { CONFIG } from '../game/Config';
import type { Game } from '../game/Game';
import type { LevelSession } from '../game/LevelSession';
import { DIRS, dirDelta, maskToDirs, type Dir } from '../puzzle/Direction';
import type { SlideMove } from '../puzzle/Grid';
import { predictPath, type PathPrediction } from '../puzzle/PathSim';
import { E, N, S, W } from '../puzzle/Direction';
import { isSlidable, tileMask, tileSegments, type Tile } from '../puzzle/Tile';
import { sideMid, tileLocalPosition, usesArc } from '../puzzle/TileGeometry';
import { formatScore } from '../player/Scoring';
import type { PickupKind } from '../player/Fuel';
import { computeLayout, type BoardLayout } from './Layout';
import { ParticleSystem } from './Particles';
import { THEME } from './Theme';

export interface DebugView {
  showConnections: boolean;
  showPath: boolean;
  showSolution: boolean;
  /** Slides to perform, in order. */
  solution: SlideMove[] | null;
}

/**
 * Canvas 2D renderer for the board, water, flame, effects and in-game HUD.
 * Reads game state, never mutates it. Everything here could be re-implemented
 * on another backend (WebGL, native) without touching the game logic.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  layout: BoardLayout | null = null;
  readonly particles = new ParticleSystem();
  time = 0;
  private goalPulse = 0;
  private shake = 0;
  private flashAlpha = 0;
  private flashColor = '#ffffff';
  debug: DebugView = { showConnections: false, showPath: false, showSolution: false, solution: null };
  /** Bottom area (CSS px) covered by DOM overlays; the board is laid out above it. */
  bottomReserve = 0;
  private layoutReserve = -1;
  private lastFlamePos: { x: number; y: number } | null = null;
  private emberTimer = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.layout = null;
  }

  /** Converts a CSS pixel position into a grid cell, or null when outside the board. */
  cellAt(px: number, py: number, session: LevelSession): { x: number; y: number } | null {
    const l = this.ensureLayout(session);
    const x = Math.floor((px - l.originX) / l.tileSize);
    const y = Math.floor((py - l.originY) / l.tileSize);
    if (!session.grid.inBounds(x, y)) return null;
    return { x, y };
  }

  // ----- effects triggered by the UI layer -----------------------------------

  triggerGoalPulse(): void {
    this.goalPulse = 1;
  }

  triggerShake(amount = 1): void {
    this.shake = Math.max(this.shake, amount);
  }

  flash(color: string, alpha = 0.5): void {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  splash(wx: number, wy: number): void {
    this.particles.burst(wx, wy, 40, ['#8fd3ff', '#cfeeff', '#3f8fe0'], 2.2, 0.08, 6, 0.8);
    this.particles.burst(wx, wy - 0.1, 14, ['rgba(200,200,200,0.8)', 'rgba(150,150,150,0.6)'], 0.8, 0.14, -1.2, 1.0);
    this.triggerShake(1);
  }

  celebrate(gx: number, gy: number): void {
    this.particles.burst(gx + 0.5, gy + 0.5, 70, ['#ffd54a', '#ff7a1a', '#fff7c2', '#ff4a4a'], 2.8, 0.1, 2, 1.2);
    this.goalPulse = 1;
  }

  // ----- main draw ------------------------------------------------------------

  private ensureLayout(session: LevelSession): BoardLayout {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const gw = session.grid.width;
    const gh = session.grid.height;
    if (
      !this.layout ||
      this.layout.canvasW !== w ||
      this.layout.canvasH !== h ||
      this.layout.gridW !== gw ||
      this.layout.gridH !== gh ||
      this.layoutReserve !== this.bottomReserve
    ) {
      this.layout = computeLayout(w, h, gw, gh, this.bottomReserve);
      this.layoutReserve = this.bottomReserve;
    }
    return this.layout;
  }

  render(game: Game, dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    this.goalPulse = Math.max(0, this.goalPulse - dt * 1.2);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);

    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(w, h);

    const session = game.session;
    if (!session) return;
    const layout = this.ensureLayout(session);

    ctx.save();
    if (this.shake > 0) {
      const s = this.shake * 6;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.drawWater(layout, w, h);
    this.drawBoard(session, layout);
    this.drawPreview(session, layout);
    if (this.debug.showPath) this.drawDebugPath(session, layout);
    if (this.debug.showSolution && this.debug.solution) this.drawSolution(this.debug.solution, layout);
    if (this.debug.showConnections) this.drawConnections(session, layout);
    this.drawFlame(session, layout, dt);
    this.drawParticles(layout);
    ctx.restore();

    this.drawHud(game, session, layout, w);
    if (this.flashAlpha > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  private drawBackground(w: number, h: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.35, Math.max(w, h) * 0.8);
    g.addColorStop(0, THEME.bgGlow);
    g.addColorStop(1, THEME.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawWater(l: BoardLayout, w: number, h: number): void {
    const ctx = this.ctx;
    const top = l.waterTop + 6;
    const grad = ctx.createLinearGradient(0, top, 0, h);
    grad.addColorStop(0, THEME.water);
    grad.addColorStop(1, THEME.waterDeep);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, top);
    const amp = Math.max(3, l.tileSize * 0.08);
    for (let x = 0; x <= w; x += 8) {
      const y = top + Math.sin(x * 0.03 + this.time * 2.2) * amp + Math.sin(x * 0.07 - this.time * 1.4) * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // foam line
    ctx.strokeStyle = THEME.waterFoam;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = top + Math.sin(x * 0.03 + this.time * 2.2) * amp + Math.sin(x * 0.07 - this.time * 1.4) * amp * 0.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawBoard(session: LevelSession, l: BoardLayout): void {
    const ctx = this.ctx;
    const ts = l.tileSize;
    // shadow
    ctx.fillStyle = THEME.boardShadow;
    session.grid.forEach((t, x, y) => {
      if (t.kind !== 'none') ctx.fillRect(l.originX + x * ts - 3, l.originY + y * ts - 3, ts + 6, ts + 8);
    });
    if (session.grid.wrap) this.drawWrapMarkers(session, l);

    session.grid.forEach((tile, x, y) => {
      const px = l.originX + x * ts;
      const py = l.originY + y * ts;
      this.drawCellBackground(tile, px, py, ts, x, y);
    });
    // slidable tiles get a soft rim so the player sees what can move
    const canPlay = session.phase === 'ready' || session.phase === 'running';
    session.grid.forEach((tile, x, y) => {
      if (tile.kind === 'empty' || tile.kind === 'none') return;
      const idx = y * session.grid.width + x;
      const anim = session.slideAnims.get(idx);
      const shake = session.shakes.get(idx) ?? 0;
      let px = l.originX + x * ts;
      let py = l.originY + y * ts;
      if (anim) {
        const ease = 1 - Math.pow(1 - anim.t, 3);
        px += anim.dx * ts * (1 - ease);
        py += anim.dy * ts * (1 - ease);
      }
      if (shake > 0) px += Math.sin(shake * 40) * shake * ts * 0.06;
      const lit = this.isLit(session, x, y);
      const slidable = canPlay && isSlidable(tile) && !!session.grid.slideTarget(x, y);
      this.drawTile(tile, px, py, ts, lit, slidable, session);
      if (tile.pickup && tile.pickupId !== undefined) {
        this.drawPickup(tile.pickup, px + ts / 2, py + ts / 2, ts, session.previouslyCollected.has(tile.pickupId), x, y);
      }
    });
    for (const a of session.pickupAnims.values()) {
      const k = 1 - a.t / 0.6;
      const cx = l.originX + (a.x + 0.5) * ts;
      const cy = l.originY + (a.y + 0.5) * ts - k * ts * 0.4;
      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.scale(1 + k, 1 + k);
      this.ctx.globalAlpha = 1 - k;
      this.drawPickupIcon(a.kind, ts * 0.3);
      this.ctx.restore();
    }
  }

  /** Small chevrons outside the board where a pipe opens onto an edge: the route continues on the other side. */
  private drawWrapMarkers(session: LevelSession, l: BoardLayout): void {
    const ctx = this.ctx;
    const ts = l.tileSize;
    const g = session.grid;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 200, 90, 0.55)';
    const chevron = (cx: number, cy: number, dir: Dir) => {
      const { dx, dy } = dirDelta(dir);
      const size = ts * 0.14;
      ctx.beginPath();
      ctx.moveTo(cx + dx * size, cy + dy * size);
      ctx.lineTo(cx - dy * size * 0.8 - dx * size * 0.4, cy - dx * size * 0.8 - dy * size * 0.4);
      ctx.lineTo(cx + dy * size * 0.8 - dx * size * 0.4, cy + dx * size * 0.8 - dy * size * 0.4);
      ctx.closePath();
      ctx.fill();
    };
    g.forEach((t, x, y) => {
      if (t.kind === 'empty') return;
      const mask = tileMask(t);
      const edges: Dir[] = [];
      if (y === 0 && mask & 1) edges.push(1 as Dir);
      if (x === g.width - 1 && mask & 2) edges.push(2 as Dir);
      if (y === g.height - 1 && mask & 4) edges.push(4 as Dir);
      if (x === 0 && mask & 8) edges.push(8 as Dir);
      for (const d of edges) {
        const m = sideMid(d);
        const { dx, dy } = dirDelta(d);
        chevron(l.originX + (x + m.x) * ts + dx * ts * 0.16, l.originY + (y + m.y) * ts + dy * ts * 0.16, d);
      }
    });
    ctx.restore();
  }

  private isLit(session: LevelSession, x: number, y: number): boolean {
    const f = session.flame;
    return (f.status === 'moving' || f.status === 'waiting') && f.x === x && f.y === y;
  }

  private drawCellBackground(tile: Tile, px: number, py: number, ts: number, x: number, y: number): void {
    const ctx = this.ctx;
    if (tile.kind === 'none') {
      // outside the playfield (Blodia's white cells): just a faint outline
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
      return;
    }
    if (tile.kind === 'empty') {
      // the void: a hole with water glinting far below
      const wave = Math.sin(this.time * 2 + x * 0.9 + y * 1.3) * 0.08;
      const g = ctx.createRadialGradient(px + ts / 2, py + ts / 2, ts * 0.1, px + ts / 2, py + ts / 2, ts * 0.75);
      g.addColorStop(0, '#061a38');
      g.addColorStop(1, '#0b2d5c');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, ts, ts);
      ctx.fillStyle = `rgba(120, 190, 255, ${0.12 + wave})`;
      ctx.fillRect(px + ts * 0.2, py + ts * (0.6 + wave), ts * 0.6, ts * 0.05);
      ctx.fillStyle = `rgba(120, 190, 255, ${0.08 - wave * 0.5})`;
      ctx.fillRect(px + ts * 0.3, py + ts * (0.4 - wave), ts * 0.4, ts * 0.04);
      // inner shadow rim
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = Math.max(2, ts * 0.05);
      ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
      return;
    }
    ctx.fillStyle = tile.locked && tile.kind !== 'source' && tile.kind !== 'goal' ? THEME.cellPipeBgLocked : THEME.cellPipeBg;
    ctx.fillRect(px, py, ts, ts);
    ctx.strokeStyle = THEME.cellBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
  }

  private drawTile(tile: Tile, px: number, py: number, ts: number, lit: boolean, slidable: boolean, session: LevelSession): void {
    const ctx = this.ctx;
    ctx.save();
    // tile plate (drawn here too so sliding tiles carry their background)
    ctx.fillStyle = tile.locked && tile.kind !== 'source' && tile.kind !== 'goal' ? THEME.cellPipeBgLocked : THEME.cellPipeBg;
    ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
    if (slidable) {
      const pulse = 0.35 + 0.25 * Math.sin(this.time * 4);
      ctx.strokeStyle = `rgba(255, 200, 90, ${pulse})`;
      ctx.lineWidth = Math.max(2, ts * 0.04);
      ctx.strokeRect(px + 2, py + 2, ts - 4, ts - 4);
    }
    ctx.translate(px + ts / 2, py + ts / 2);
    const baseRotation = tile.kind === 'straight' ? tile.rotation % 2 : tile.kind === 'cross' ? 0 : tile.rotation;
    ctx.rotate(baseRotation * (Math.PI / 2));
    const mask = tileMask({ ...tile, rotation: 0 });
    switch (tile.kind) {
      case 'blank':
        this.drawBlank(ts);
        break;
      case 'source':
        this.drawSource(ts, lit);
        break;
      case 'goal':
        this.drawGoal(ts);
        break;
      case 'cross': {
        // bridge: the horizontal pipe passes under the vertical one
        const segs = tileSegments(tile);
        this.drawPipe(E | W, 'straight', ts, tile.locked, lit, session.isCovered(tile, segs[0][0], segs[0][1]));
        this.drawPipe(N | S, 'straight', ts, tile.locked, lit, session.isCovered(tile, segs[1][0], segs[1][1]));
        break;
      }
      case 'double': {
        const segs = tileSegments(tile);
        this.drawPipe(N | E, 'corner', ts, tile.locked, lit, session.isCovered(tile, segs[0][0], segs[0][1]));
        this.drawPipe(S | W, 'corner', ts, tile.locked, lit, session.isCovered(tile, segs[1][0], segs[1][1]));
        break;
      }
      case 'warp':
        this.drawPipe(mask, 'straight', ts, tile.locked, lit);
        ctx.rotate(-baseRotation * (Math.PI / 2)); // keep the number upright
        this.drawWarpRing(ts, tile.warpId ?? 1, lit);
        break;
      default: {
        const segs = tileSegments(tile);
        const covered = segs.length === 1 && session.isCovered(tile, segs[0][0], segs[0][1]);
        this.drawPipe(mask, tile.kind, ts, tile.locked, lit, covered);
      }
    }
    ctx.restore();
  }

  private static WARP_COLORS = ['#4fd1ff', '#ff6ad5', '#7dff8a', '#ffd54a', '#b48bff', '#ff9a4a', '#4affd0', '#ff4a6a', '#d0ff4a'];

  /** Numbered ring of a warp tile: enter here, come out of the twin with the same number. */
  private drawWarpRing(ts: number, id: number, lit: boolean): void {
    const ctx = this.ctx;
    const color = CanvasRenderer.WARP_COLORS[(id - 1) % CanvasRenderer.WARP_COLORS.length];
    const r = ts * 0.26;
    const spin = this.time * 1.2;
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.6);
    glow.addColorStop(0, `${color}55`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c1020';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, ts * 0.05);
    ctx.setLineDash([r * 0.6, r * 0.35]);
    ctx.lineDashOffset = -spin * r;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1.5, ts * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = lit ? '#fff7c2' : color;
    ctx.font = `800 ${Math.max(10, ts * 0.3)}px 'Rubik', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(id), 0, ts * 0.01);
  }

  /** A solid tile without a pipe: a plain plate with four rivets. */
  private drawBlank(ts: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(-ts * 0.42, -ts * 0.42, ts * 0.84, ts * 0.84);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * ts * 0.34, sy * ts * 0.34, Math.max(1.5, ts * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private pipeWidths(ts: number): { outer: number; inner: number } {
    return { outer: ts * 0.42, inner: ts * 0.26 };
  }

  private drawPipe(mask: number, kind: Tile['kind'], ts: number, locked: boolean, lit: boolean, covered = false): void {
    const ctx = this.ctx;
    const { outer, inner } = this.pipeWidths(ts);
    const h = ts / 2;
    const dirs = maskToDirs(mask);
    // travelled pipes glow ember-orange so the player sees what is left to cover
    const outerColor = lit ? THEME.pipeLitOuter : covered ? '#8a3f12' : locked ? THEME.pipeLockedOuter : THEME.pipeOuter;
    const innerColor = lit ? THEME.pipeLitInner : covered ? '#f0a052' : locked ? THEME.pipeLockedInner : THEME.pipeInner;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    const strokePath = (width: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      if (kind === 'corner' && dirs.length === 2) {
        // quarter arc centred on the shared corner
        const a = sideMid(dirs[0]);
        const b = sideMid(dirs[1]);
        const cx = (a.x === 0.5 ? b.x : a.x) - 0.5;
        const cy = (a.y === 0.5 ? b.y : a.y) - 0.5;
        const angA = Math.atan2(a.y - 0.5 - cy, a.x - 0.5 - cx);
        const angB = Math.atan2(b.y - 0.5 - cy, b.x - 0.5 - cx);
        let diff = angB - angA;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ctx.arc(cx * ts, cy * ts, h, angA, angA + diff, diff < 0);
      } else {
        for (const d of dirs) {
          const m = sideMid(d);
          ctx.moveTo(0, 0);
          ctx.lineTo((m.x - 0.5) * ts, (m.y - 0.5) * ts);
        }
      }
      ctx.stroke();
    };
    strokePath(outer + Math.max(2, ts * 0.05), 'rgba(8, 10, 20, 0.75)'); // dark outline: tube look
    strokePath(outer, outerColor);
    strokePath(inner, innerColor);
    // highlight stripe
    ctx.globalAlpha = 0.6;
    strokePath(inner * 0.3, THEME.pipeHighlight);
    ctx.globalAlpha = 1;

    if (kind === 'cap') {
      // dead end: a flat plug bolted across the pipe (base orientation opens North)
      ctx.fillStyle = outerColor;
      ctx.fillRect(-outer * 0.75, -outer * 0.15, outer * 1.5, outer * 0.42);
      ctx.fillStyle = '#1a1e2e';
      ctx.fillRect(-outer * 0.75, outer * 0.27, outer * 1.5, outer * 0.08);
      ctx.fillStyle = '#c9d2e8';
      for (const bx of [-outer * 0.5, outer * 0.5]) {
        ctx.beginPath();
        ctx.arc(bx, outer * 0.06, outer * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // flange rings at the openings
    ctx.fillStyle = outerColor;
    for (const d of dirs) {
      const m = sideMid(d);
      const fx = (m.x - 0.5) * ts;
      const fy = (m.y - 0.5) * ts;
      const horizontal = m.y === 0.5;
      const ringLen = ts * 0.1;
      ctx.fillRect(
        horizontal ? fx - (m.x > 0.5 ? ringLen : 0) : fx - outer * 0.6,
        horizontal ? fy - outer * 0.6 : fy - (m.y > 0.5 ? ringLen : 0),
        horizontal ? ringLen : outer * 1.2,
        horizontal ? outer * 1.2 : ringLen,
      );
    }
    if (locked) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(h * 0.62, h * 0.62, ts * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8c88a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h * 0.62, h * 0.62 - ts * 0.02, ts * 0.045, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#e8c88a';
      ctx.fillRect(h * 0.62 - ts * 0.05, h * 0.62 - ts * 0.015, ts * 0.1, ts * 0.07);
    }
  }

  private drawSource(ts: number, lit: boolean): void {
    const ctx = this.ctx;
    const { outer, inner } = this.pipeWidths(ts);
    // brazier bowl
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.arc(0, 0, ts * 0.36, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, ts * 0.36);
    glow.addColorStop(0, lit ? '#ffd27a' : '#c9561a');
    glow.addColorStop(1, 'rgba(255,122,26,0.05)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, ts * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // opening to the north (base orientation)
    ctx.strokeStyle = THEME.pipeOuter;
    ctx.lineWidth = outer;
    ctx.beginPath();
    ctx.moveTo(0, -ts * 0.2);
    ctx.lineTo(0, -ts / 2);
    ctx.stroke();
    ctx.strokeStyle = THEME.pipeInner;
    ctx.lineWidth = inner;
    ctx.beginPath();
    ctx.moveTo(0, -ts * 0.2);
    ctx.lineTo(0, -ts / 2);
    ctx.stroke();
    // rim
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = Math.max(2, ts * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, ts * 0.36, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawGoal(ts: number): void {
    const ctx = this.ctx;
    const { outer, inner } = this.pipeWidths(ts);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    const boost = this.goalPulse;
    // hearth / fireplace block
    ctx.fillStyle = THEME.goalBase;
    const s = ts * 0.78;
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s, ts * 0.12);
    ctx.fill();
    ctx.strokeStyle = '#8a6a4a';
    ctx.lineWidth = Math.max(2, ts * 0.04);
    ctx.stroke();
    // opening north
    ctx.strokeStyle = THEME.pipeOuter;
    ctx.lineWidth = outer;
    ctx.beginPath();
    ctx.moveTo(0, -ts * 0.3);
    ctx.lineTo(0, -ts / 2);
    ctx.stroke();
    ctx.strokeStyle = THEME.pipeInner;
    ctx.lineWidth = inner;
    ctx.beginPath();
    ctx.moveTo(0, -ts * 0.3);
    ctx.lineTo(0, -ts / 2);
    ctx.stroke();
    // inner hearth
    ctx.fillStyle = '#1a0f0a';
    ctx.beginPath();
    ctx.roundRect(-s * 0.32, -s * 0.15, s * 0.64, s * 0.5, ts * 0.06);
    ctx.fill();
    // glow / target ring
    const glow = ctx.createRadialGradient(0, s * 0.1, 1, 0, s * 0.1, s * 0.5);
    glow.addColorStop(0, `rgba(255,179,71,${0.25 + pulse * 0.25 + boost * 0.5})`);
    glow.addColorStop(1, 'rgba(255,179,71,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, s * 0.1, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // logs
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = Math.max(2, ts * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.28);
    ctx.lineTo(s * 0.2, s * 0.18);
    ctx.moveTo(-s * 0.2, s * 0.18);
    ctx.lineTo(s * 0.2, s * 0.28);
    ctx.stroke();
    if (boost > 0) {
      ctx.strokeStyle = `rgba(255,230,150,${boost})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.6 + (1 - boost) * ts * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ----- preview / debug overlays --------------------------------------------

  /** Preview polylines in canvas px; a new polyline starts whenever the route wraps around the board. */
  private pathPolylines(session: LevelSession, pred: PathPrediction, l: BoardLayout): { x: number; y: number }[][] {
    const lines: { x: number; y: number }[][] = [[]];
    let pts = lines[0];
    const ts = l.tileSize;
    const f = session.flame;
    const push = (wx: number, wy: number) => pts.push({ x: l.originX + wx * ts, y: l.originY + wy * ts });
    // from the flame to the exit of its current tile
    const curTile = session.grid.get(f.x, f.y);
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = f.progress + (1 - f.progress) * (i / steps);
      const p = tileLocalPosition(curTile.kind, f.entry, f.exit, t);
      push(f.x + p.x, f.y + p.y);
    }
    for (const s of pred.steps) {
      const tile = session.grid.get(s.x, s.y);
      if (s.wrapped) {
        pts = [];
        lines.push(pts);
        const p0 = tileLocalPosition(tile.kind, s.entry, s.exit, 0);
        push(s.x + p0.x, s.y + p0.y);
      }
      const n = usesArc(tile.kind, s.entry, s.exit) ? 6 : 2;
      for (let i = 1; i <= n; i++) {
        const p = tileLocalPosition(tile.kind, s.entry, s.exit, i / n);
        push(s.x + p.x, s.y + p.y);
      }
    }
    return lines;
  }

  private drawPreview(session: LevelSession, l: BoardLayout): void {
    const pred = session.prediction;
    if (!pred || session.def.lookahead <= 0) return;
    if (session.flame.status !== 'moving' && session.flame.status !== 'waiting') return;
    const ctx = this.ctx;
    const lines = this.pathPolylines(session, pred, l);
    const danger = pred.end.type === 'fall';
    ctx.save();
    ctx.setLineDash([l.tileSize * 0.12, l.tileSize * 0.14]);
    ctx.lineDashOffset = -this.time * l.tileSize * 0.8;
    ctx.strokeStyle = danger ? 'rgba(255,90,90,0.75)' : THEME.preview;
    ctx.lineWidth = Math.max(2, l.tileSize * 0.07);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pts of lines) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (danger) {
      const end = pred.end as { x: number; y: number; dir: Dir };
      const m = sideMid(end.dir);
      const ex = l.originX + (end.x + m.x) * l.tileSize;
      const ey = l.originY + (end.y + m.y) * l.tileSize;
      const r = l.tileSize * (0.14 + 0.03 * Math.sin(this.time * 8));
      ctx.fillStyle = 'rgba(255,60,60,0.85)';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, l.tileSize * 0.05);
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.5, ey - r * 0.5);
      ctx.lineTo(ex + r * 0.5, ey + r * 0.5);
      ctx.moveTo(ex + r * 0.5, ey - r * 0.5);
      ctx.lineTo(ex - r * 0.5, ey + r * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDebugPath(session: LevelSession, l: BoardLayout): void {
    const f = session.flame;
    if (f.status !== 'moving' && f.status !== 'waiting') return;
    const pred = predictPath(session.grid, f.x, f.y, f.exit, CONFIG.debugPathSteps);
    const lines = this.pathPolylines(session, pred, l);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = THEME.debugPath;
    ctx.lineWidth = 3;
    for (const pts of lines) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSolution(moves: SlideMove[], l: BoardLayout): void {
    const ctx = this.ctx;
    const ts = l.tileSize;
    ctx.save();
    ctx.font = `700 ${Math.max(10, ts * 0.28)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    moves.forEach((m, i) => {
      const fx = l.originX + (m.from.x + 0.5) * ts;
      const fy = l.originY + (m.from.y + 0.5) * ts;
      const tx = l.originX + (m.to.x + 0.5) * ts;
      const ty = l.originY + (m.to.y + 0.5) * ts;
      const alpha = i === 0 ? 1 : 0.55;
      ctx.strokeStyle = `rgba(80, 200, 255, ${alpha})`;
      ctx.fillStyle = `rgba(80, 200, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + (tx - fx) * 0.7, fy + (ty - fy) * 0.7);
      ctx.stroke();
      const ang = Math.atan2(ty - fy, tx - fx);
      ctx.beginPath();
      ctx.moveTo(fx + (tx - fx) * 0.8, fy + (ty - fy) * 0.8);
      ctx.lineTo(fx + (tx - fx) * 0.6 + Math.cos(ang + 2.3) * ts * 0.12, fy + (ty - fy) * 0.6 + Math.sin(ang + 2.3) * ts * 0.12);
      ctx.lineTo(fx + (tx - fx) * 0.6 + Math.cos(ang - 2.3) * ts * 0.12, fy + (ty - fy) * 0.6 + Math.sin(ang - 2.3) * ts * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.arc(fx, fy, ts * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(80, 200, 255, ${alpha})`;
      ctx.fillText(`${i + 1}`, fx, fy);
    });
    ctx.restore();
  }

  private drawConnections(session: LevelSession, l: BoardLayout): void {
    const ctx = this.ctx;
    const ts = l.tileSize;
    ctx.save();
    session.grid.forEach((tile, x, y) => {
      if (tile.kind === 'empty') return;
      const mask = tileMask(tile);
      for (const d of DIRS) {
        if (!(mask & d)) continue;
        const m = sideMid(d);
        const px = l.originX + (x + m.x) * ts;
        const py = l.originY + (y + m.y) * ts;
        const { dx, dy } = dirDelta(d);
        const connected = session.grid.isConnected(x, y, d);
        ctx.fillStyle = connected ? 'rgba(0,255,120,0.9)' : 'rgba(255,60,60,0.9)';
        ctx.beginPath();
        ctx.arc(px - dx * ts * 0.08, py - dy * ts * 0.08, ts * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `${Math.max(9, ts * 0.18)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${tile.kind[0].toUpperCase()}${tile.rotation}`, l.originX + x * ts + 3, l.originY + y * ts + 2);
    });
    ctx.restore();
  }

  // ----- pickups -----------------------------------------------------------------

  private drawPickup(kind: PickupKind, cx: number, cy: number, ts: number, alreadyCollected: boolean, x: number, y: number): void {
    const ctx = this.ctx;
    const bob = Math.sin(this.time * 3 + x * 1.7 + y) * ts * 0.03;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.globalAlpha = alreadyCollected ? 0.45 : 1;
    const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, ts * 0.34);
    halo.addColorStop(0, alreadyCollected ? 'rgba(200,200,220,0.35)' : 'rgba(255,230,160,0.55)');
    halo.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, ts * 0.34, 0, Math.PI * 2);
    ctx.fill();
    if (alreadyCollected) ctx.filter = 'grayscale(0.7)';
    this.drawPickupIcon(kind, ts * 0.3);
    ctx.restore();
  }

  private drawPickupIcon(kind: PickupKind, r: number): void {
    const ctx = this.ctx;
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    switch (kind) {
      case 'wood': {
        ctx.save();
        ctx.rotate(-0.5);
        ctx.fillStyle = '#8a5a2b';
        ctx.strokeStyle = '#4a2d12';
        ctx.beginPath();
        ctx.roundRect(-r, -r * 0.32, r * 2, r * 0.64, r * 0.3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#d9a96a';
        ctx.beginPath();
        ctx.ellipse(r * 0.95, 0, r * 0.18, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'oil': {
        ctx.fillStyle = '#2b2f3a';
        ctx.strokeStyle = '#11141c';
        ctx.beginPath();
        ctx.roundRect(-r * 0.7, -r * 0.9, r * 1.4, r * 1.8, r * 0.25);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffb02e';
        ctx.fillRect(-r * 0.7, -r * 0.2, r * 1.4, r * 0.4);
        ctx.fillStyle = '#11141c';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'brazier': {
        ctx.fillStyle = '#4a3a2a';
        ctx.beginPath();
        ctx.arc(0, r * 0.3, r * 0.9, 0, Math.PI);
        ctx.fill();
        const flick = 1 + Math.sin(this.time * 15) * 0.1;
        ctx.fillStyle = THEME.flameOuter;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.3 * flick);
        ctx.bezierCurveTo(r * 0.8, -r * 0.3, r * 0.7, r * 0.3, 0, r * 0.4);
        ctx.bezierCurveTo(-r * 0.7, r * 0.3, -r * 0.8, -r * 0.3, 0, -r * 1.3 * flick);
        ctx.fill();
        ctx.fillStyle = THEME.flameCore;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.6);
        ctx.bezierCurveTo(r * 0.35, -r * 0.1, r * 0.3, r * 0.2, 0, r * 0.3);
        ctx.bezierCurveTo(-r * 0.3, r * 0.2, -r * 0.35, -r * 0.1, 0, -r * 0.6);
        ctx.fill();
        break;
      }
      case 'ember': {
        ctx.save();
        ctx.rotate(this.time * 1.5);
        ctx.fillStyle = '#ffe36a';
        ctx.strokeStyle = '#ff8a2e';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.45;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }

  // ----- flame -----------------------------------------------------------------

  private drawFlame(session: LevelSession, l: BoardLayout, dt: number): void {
    const f = session.flame;
    if (f.status === 'dead') return;
    const ctx = this.ctx;
    const ts = l.tileSize;
    let px = l.originX + f.wx * ts;
    let py = l.originY + f.wy * ts;
    if (f.status === 'moving' || f.status === 'waiting' || f.status === 'arrived') {
      const anim = session.slideAnims.get(f.y * session.grid.width + f.x);
      if (anim) {
        const ease = 1 - Math.pow(1 - anim.t, 3);
        px += anim.dx * ts * (1 - ease);
        py += anim.dy * ts * (1 - ease);
      }
    }
    // fuel drives the flame size: a starving flame is visibly smaller
    const ext = f.extinguishRatio;
    const scale = ts * 0.3 * (0.72 + 0.45 * f.intensity) * (1 - ext * 0.8);
    const arrived = f.status === 'arrived';
    if (f.status === 'extinguishing') {
      this.emberTimer += dt;
      if (this.emberTimer > 0.05) {
        this.emberTimer = 0;
        this.particles.spawn({
          x: f.wx + (Math.random() - 0.5) * 0.2,
          y: f.wy,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.8,
          maxLife: 0.9,
          size: 0.12,
          color: 'rgba(170,170,180,0.7)',
          gravity: -0.5,
        });
      }
    }
    // low fuel: the flame flickers nervously
    const lowFuel = f.fuel.isLow && f.status === 'moving';

    // embers trail
    this.emberTimer += dt;
    if ((f.status === 'moving' || f.status === 'falling') && this.emberTimer > (session.fastForward ? 0.015 : 0.04)) {
      this.emberTimer = 0;
      this.particles.spawn({
        x: f.wx + (Math.random() - 0.5) * 0.15,
        y: f.wy + (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.4 - Math.random() * 0.4,
        maxLife: 0.35 + Math.random() * 0.3,
        size: 0.05 + Math.random() * 0.04,
        color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f',
        gravity: -0.8,
      });
    }

    // squash/stretch along the heading
    let sx = 1;
    let sy = 1;
    if (f.status === 'moving' && this.lastFlamePos) {
      const vx = f.wx - this.lastFlamePos.x;
      const vy = f.wy - this.lastFlamePos.y;
      const stretch = Math.min(0.25, Math.hypot(vx, vy) * 6);
      if (Math.abs(vx) > Math.abs(vy)) {
        sx = 1 + stretch;
        sy = 1 - stretch * 0.6;
      } else {
        sy = 1 + stretch;
        sx = 1 - stretch * 0.6;
      }
    }
    this.lastFlamePos = { x: f.wx, y: f.wy };

    const flicker = 1 + Math.sin(this.time * 23) * (lowFuel ? 0.16 : 0.06) + Math.sin(this.time * 41) * 0.04;
    const fallFade = f.status === 'falling' ? Math.max(0.3, 1 - (f.wy - (l.boardH / ts - 0.5)) * 0.4) : 1 - ext * 0.9;

    ctx.save();
    ctx.translate(px, py);
    // glow
    const glowR = scale * 2.6 * flicker * (arrived ? 1.6 : 1);
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, glowR);
    glow.addColorStop(0, `rgba(255,140,40,${0.45 * fallFade})`);
    glow.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(sx, sy);
    ctx.globalAlpha = fallFade;
    const drawTongue = (r: number, color: string, wobble: number, lift: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      const tip = -r * (1.6 + Math.sin(this.time * 17 + wobble) * 0.25) - lift;
      const side = Math.sin(this.time * 13 + wobble) * r * 0.25;
      ctx.moveTo(0, tip);
      ctx.bezierCurveTo(r * 1.1 + side, -r * 0.6, r * 1.05, r * 0.6, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 1.05, r * 0.6, -r * 1.1 + side, -r * 0.6, 0, tip);
      ctx.closePath();
      ctx.fill();
    };
    drawTongue(scale * flicker, THEME.flameOuter, 0, 0);
    drawTongue(scale * 0.7 * flicker, THEME.flameMid, 2, scale * 0.1);
    drawTongue(scale * 0.4, THEME.flameCore, 4, scale * 0.15);
    // eyes: the flame is alive
    ctx.fillStyle = '#2a1a10';
    const eyeY = scale * 0.1;
    ctx.beginPath();
    ctx.arc(-scale * 0.22, eyeY, scale * 0.09, 0, Math.PI * 2);
    ctx.arc(scale * 0.22, eyeY, scale * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(l: BoardLayout): void {
    const ctx = this.ctx;
    const ts = l.tileSize;
    for (const p of this.particles.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(l.originX + p.x * ts, l.originY + p.y * ts, p.size * ts * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ----- HUD ---------------------------------------------------------------------

  private drawHud(game: Game, session: LevelSession, l: BoardLayout, w: number): void {
    const ctx = this.ctx;
    const h = l.hudHeight;
    const pad = 14;
    const fontSize = Math.max(12, Math.min(20, h * 0.26, w / 26));
    const row1 = h * 0.26;
    const row2 = h * 0.66;
    const font = (weight: number, size: number) => `${weight} ${size}px 'Rubik', 'Segoe UI', sans-serif`;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'middle';

    // row 1: score | level | lives
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.hudText;
    ctx.font = font(700, fontSize);
    ctx.fillText(`SCORE ${formatScore(game.score)}`, pad, row1);
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${session.def.id}`, w / 2, row1);
    const rightInset = 48; // room for the DOM pause button
    const lifeR = fontSize * 0.42;
    let lx = w - pad - rightInset - lifeR;
    for (let i = 0; i < game.lives.max; i++) {
      this.drawMiniFlame(lx, row1, lifeR, i < game.lives.count);
      lx -= lifeR * 2.6;
    }

    // row 2: fuel bar | time, countdown or pipes left | embers
    const ready = session.phase === 'ready';
    const hasLimit = session.def.timeLimit > 0;
    const ratio = hasLimit ? Math.max(0, Math.min(1, session.timeRemaining / session.def.timeLimit)) : 1;
    let centreText: string;
    let barRatio = ratio;
    if (ready && session.countdown > 0) {
      centreText = `COUNTDOWN ${Math.max(0, Math.ceil(session.readyTimer))}`;
      barRatio = Math.max(0, session.readyTimer / session.countdown);
    } else if (ready) {
      centreText = w < 520 ? 'TAP TO START' : 'READY · SLIDE A TILE OR TAP THE FLAME';
    } else if (session.coverMode) {
      centreText = `PIPES ${session.coveredSegments.size}/${session.segmentsTotal}`;
      barRatio = session.segmentsTotal > 0 ? session.coveredSegments.size / session.segmentsTotal : 0;
    } else {
      centreText = `${session.timeRemaining.toFixed(1)}s`;
    }
    ctx.font = ready ? font(800, fontSize * 0.9) : font(700, fontSize);
    const centreW = ctx.measureText(centreText).width;
    const fuel = session.flame.fuel;
    const fuelEnabled = session.flame.fuelPerTile > 0;
    const barH = Math.max(10, fontSize * 0.6);
    const fx = pad + fontSize * 2.2;
    const numberW = fontSize * 1.9;
    if (fuelEnabled) {
      // the bar never runs into the centred text
      const barW = Math.max(36, Math.min(220, w * 0.22, (w - centreW) / 2 - 10 - fx - numberW));
      ctx.textAlign = 'left';
      ctx.fillStyle = THEME.hudDim;
      ctx.font = font(600, fontSize * 0.7);
      ctx.fillText('FUEL', pad, row2);
      ctx.fillStyle = THEME.timeBarBg;
      ctx.beginPath();
      ctx.roundRect(fx, row2 - barH / 2, barW, barH, barH / 2);
      ctx.fill();
      const low = fuel.isLow;
      const pulse = low ? 0.6 + 0.4 * Math.sin(this.time * 10) : 1;
      ctx.fillStyle = low ? `rgba(255,74,74,${pulse})` : '#ff9a2e';
      if (fuel.ratio > 0) {
        ctx.beginPath();
        ctx.roundRect(fx, row2 - barH / 2, Math.max(barH, barW * fuel.ratio), barH, barH / 2);
        ctx.fill();
      }
      ctx.fillStyle = THEME.hudText;
      ctx.font = font(700, fontSize * 0.7);
      ctx.fillText(`${Math.ceil(fuel.current)}`, fx + barW + 8, row2);
    }

    ctx.textAlign = 'center';
    if (ready) {
      const p = 0.65 + 0.35 * Math.sin(this.time * 5);
      ctx.fillStyle = `rgba(255, 213, 74, ${p})`;
      ctx.font = font(800, fontSize * 0.9);
      ctx.fillText(centreText, w / 2, row2);
    } else {
      ctx.fillStyle = hasLimit && ratio < 0.25 ? THEME.timeBarLow : THEME.hudText;
      ctx.font = font(700, fontSize);
      ctx.fillText(centreText, w / 2, row2);
      if (session.fastForward && w >= 520) {
        ctx.fillStyle = `rgba(255, 213, 74, ${0.6 + 0.4 * Math.sin(this.time * 12)})`;
        ctx.font = font(800, fontSize * 0.7);
        ctx.fillText('⏩ TURBO', w / 2 + centreW / 2 + fontSize * 2.2, row2);
      }
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = THEME.hudText;
    ctx.font = font(700, fontSize * 0.85);
    ctx.fillText(`${game.embers}`, w - pad - rightInset, row2);
    const emberX = w - pad - rightInset - ctx.measureText(`${game.embers}`).width - fontSize * 0.7;
    this.drawEmberIcon(emberX, row2, fontSize * 0.36);
    ctx.fillStyle = THEME.hudDim;
    ctx.font = font(600, fontSize * 0.6);
    ctx.fillText('EMBERS', emberX - fontSize * 0.6, row2);

    // time bar under the hud
    const tbH = 6;
    ctx.fillStyle = THEME.timeBarBg;
    ctx.fillRect(0, h - tbH, w, tbH);
    ctx.fillStyle = hasLimit && !ready && ratio < 0.25 ? THEME.timeBarLow : THEME.timeBar;
    ctx.fillRect(0, h - tbH, w * barRatio, tbH);
    ctx.restore();
  }

  private drawEmberIcon(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.time * 1.5);
    ctx.fillStyle = '#ffe36a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawMiniFlame(x: number, y: number, r: number, alive: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alive ? 1 : 0.25;
    ctx.fillStyle = alive ? THEME.flameOuter : '#777';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.5);
    ctx.bezierCurveTo(r, -r * 0.5, r, r * 0.6, 0, r);
    ctx.bezierCurveTo(-r, r * 0.6, -r, -r * 0.5, 0, -r * 1.5);
    ctx.fill();
    if (alive) {
      ctx.fillStyle = THEME.flameCore;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6);
      ctx.bezierCurveTo(r * 0.45, -r * 0.1, r * 0.45, r * 0.5, 0, r * 0.7);
      ctx.bezierCurveTo(-r * 0.45, r * 0.5, -r * 0.45, -r * 0.1, 0, -r * 0.6);
      ctx.fill();
    }
    ctx.restore();
  }
}

