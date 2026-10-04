import type { PickupKind } from '../player/Fuel';
import { Entity } from './Entity';

/** A fuel pickup sitting on a pipe tile. Collected when a flame crosses the tile centre. */
export class Pickup extends Entity {
  readonly kind = 'pickup' as const;
  collected = false;
  /** Visual-only timer after collection. */
  collectAnim = 0;

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly fuelKind: PickupKind,
  ) {
    super();
    this.wx = x + 0.5;
    this.wy = y + 0.5;
  }

  update(dt: number): void {
    if (this.collected && this.collectAnim > 0) this.collectAnim = Math.max(0, this.collectAnim - dt);
  }
}
