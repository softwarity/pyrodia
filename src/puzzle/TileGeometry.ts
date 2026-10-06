import { E, N, S, opposite, type Dir } from './Direction';
import type { TileKind } from './Tile';

/** Midpoint of a tile side, in tile-local coordinates (0..1). */
export function sideMid(d: Dir): { x: number; y: number } {
  switch (d) {
    case N:
      return { x: 0.5, y: 0 };
    case E:
      return { x: 1, y: 0.5 };
    case S:
      return { x: 0.5, y: 1 };
    default:
      return { x: 0, y: 0.5 };
  }
}

/** Corner of the tile shared by two adjacent sides. */
function sharedCorner(a: Dir, b: Dir): { x: number; y: number } {
  const ma = sideMid(a);
  const mb = sideMid(b);
  return { x: ma.x === 0.5 ? mb.x : ma.x, y: ma.y === 0.5 ? mb.y : ma.y };
}

export function usesArc(kind: TileKind, entry: Dir, exit: Dir): boolean {
  return (kind === 'corner' || kind === 'double') && entry !== exit && opposite(entry) !== exit;
}

/**
 * Position of the flame inside a tile given the side it entered, the side it
 * will exit and its progress 0..1 (0 = entering, 0.5 = centre, 1 = leaving).
 * Corners use a quarter arc; everything else goes through the centre.
 */
export function tileLocalPosition(kind: TileKind, entry: Dir, exit: Dir, t: number): { x: number; y: number } {
  const p = Math.min(1, Math.max(0, t));
  if (usesArc(kind, entry, exit)) {
    const c = sharedCorner(entry, exit);
    const a = sideMid(entry);
    const b = sideMid(exit);
    const angA = Math.atan2(a.y - c.y, a.x - c.x);
    let angB = Math.atan2(b.y - c.y, b.x - c.x);
    let diff = angB - angA;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    angB = angA + diff;
    const ang = angA + (angB - angA) * p;
    return { x: c.x + Math.cos(ang) * 0.5, y: c.y + Math.sin(ang) * 0.5 };
  }
  const a = sideMid(entry);
  const b = sideMid(exit);
  if (p < 0.5) {
    const k = p * 2;
    return { x: a.x + (0.5 - a.x) * k, y: a.y + (0.5 - a.y) * k };
  }
  const k = (p - 0.5) * 2;
  return { x: 0.5 + (b.x - 0.5) * k, y: 0.5 + (b.y - 0.5) * k };
}
