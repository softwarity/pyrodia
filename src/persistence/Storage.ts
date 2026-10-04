/** Storage abstraction so the persistence backend can be swapped (localStorage, native prefs, cloud...). */
export interface KeyValueStorage {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export class LocalStorageAdapter implements KeyValueStorage {
  constructor(private prefix = 'pyrodia.') {}

  get<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.localStorage?.getItem(this.prefix + key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      globalThis.localStorage?.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode, quota) */
    }
  }

  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
  }
}

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  get<T>(key: string, fallback: T): T {
    const raw = this.map.get(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  }
  set<T>(key: string, value: T): void {
    this.map.set(key, JSON.stringify(value));
  }
  remove(key: string): void {
    this.map.delete(key);
  }
}
