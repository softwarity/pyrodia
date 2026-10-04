/**
 * Base class for everything that lives on the board and has behaviour over time.
 * Flame is the first entity; Water, Oil, Wind... can derive from this later.
 */
export type EntityKind = 'flame' | 'pickup' | 'water' | 'wind' | 'wood' | 'ice' | 'oil' | 'extinguisher';

let nextId = 1;

export abstract class Entity {
  readonly id = nextId++;
  abstract readonly kind: EntityKind;
  /** World position in tile units (0..width, 0..height). */
  wx = 0;
  wy = 0;
  alive = true;

  abstract update(dt: number): void;
}
