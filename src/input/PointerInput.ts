export interface PointerHandler {
  /** Tap / click at CSS pixel coordinates. `button` 0 = primary, 2 = secondary. */
  onTap(x: number, y: number, button: number): void;
  /** Swipe starting at (x,y) in a cardinal direction (dx,dy) with |dx|+|dy| = 1. */
  onSwipe(x: number, y: number, dx: number, dy: number): void;
}

/**
 * Unified mouse + touch input: taps and four-direction swipes.
 */
export class PointerInput {
  private start: { x: number; y: number; t: number; id: number } | null = null;
  private moved = false;

  constructor(
    private el: HTMLElement,
    private handler: PointerHandler,
  ) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.start) return;
    const p = this.local(e);
    this.start = { ...p, t: performance.now(), id: e.pointerId };
    this.moved = false;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.start || e.pointerId !== this.start.id) return;
    const p = this.local(e);
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > 24) this.moved = true;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.start || e.pointerId !== this.start.id) return;
    const p = this.local(e);
    const dx = p.x - this.start.x;
    const dy = p.y - this.start.y;
    const dist = Math.hypot(dx, dy);
    const s = this.start;
    this.start = null;
    if (dist > 30) {
      if (Math.abs(dx) > Math.abs(dy)) this.handler.onSwipe(s.x, s.y, dx > 0 ? 1 : -1, 0);
      else this.handler.onSwipe(s.x, s.y, 0, dy > 0 ? 1 : -1);
    } else if (!this.moved) {
      this.handler.onTap(s.x, s.y, e.button);
    }
  };

  private onCancel = (): void => {
    this.start = null;
  };

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onCancel);
  }
}
