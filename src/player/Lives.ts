/**
 * Life system. Deliberately abstract ("resource") so it can later be swapped
 * for hearts, energy, retries, rewarded revives...
 */
export class Lives {
  private value: number;

  constructor(
    public readonly max: number,
    initial = max,
  ) {
    this.value = initial;
  }

  get count(): number {
    return this.value;
  }

  lose(): number {
    this.value = Math.max(0, this.value - 1);
    return this.value;
  }

  gain(n = 1): number {
    this.value = Math.min(this.max, this.value + n);
    return this.value;
  }

  reset(): void {
    this.value = this.max;
  }

  get isEmpty(): boolean {
    return this.value <= 0;
  }
}
