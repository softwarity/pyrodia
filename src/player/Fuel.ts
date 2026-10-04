/**
 * Fuel system. The flame burns fuel while it travels; pickups refill it.
 * All numbers live here so they are easy to tune.
 */
export type PickupKind = 'wood' | 'oil' | 'brazier' | 'ember';

export const FUEL_CONFIG = {
  defaultInitialFuel: 100,
  defaultMaxFuel: 100,
  /** Fuel burnt per tile travelled when a level does not specify it. */
  defaultFuelPerTile: 3,
  /** Fuel restored by each pickup kind. `null` means "refill to max". */
  pickupFuel: { wood: 10, oil: 30, brazier: null, ember: 20 } as Record<PickupKind, number | null>,
  /** Embers (persistent currency) granted by picking up each kind. */
  pickupEmbers: { wood: 0, oil: 0, brazier: 0, ember: 3 } as Record<PickupKind, number>,
  /** Below this ratio the flame is "low on fuel" (visual + audio warning). */
  lowFuelRatio: 0.25,
};

export const PICKUP_LABELS: Record<PickupKind, string> = { wood: 'Wood', oil: 'Oil', brazier: 'Brazier', ember: 'Rare ember' };

export class FuelTank {
  private value: number;

  constructor(
    public max: number,
    initial = max,
  ) {
    this.value = Math.min(max, initial);
  }

  get current(): number {
    return this.value;
  }

  get ratio(): number {
    return this.max > 0 ? this.value / this.max : 0;
  }

  get isEmpty(): boolean {
    return this.value <= 0;
  }

  get isLow(): boolean {
    return this.ratio <= FUEL_CONFIG.lowFuelRatio;
  }

  /** Burn fuel; returns true when the tank just ran dry. */
  burn(amount: number): boolean {
    if (this.value <= 0) return false;
    this.value = Math.max(0, this.value - amount);
    return this.value <= 0;
  }

  add(amount: number | null): number {
    const before = this.value;
    this.value = amount === null ? this.max : Math.min(this.max, this.value + amount);
    return this.value - before;
  }
}
