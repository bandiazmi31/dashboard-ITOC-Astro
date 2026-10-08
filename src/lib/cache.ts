// Simple In-Memory Cache with TTL
interface CacheItem<T> {
  value: T;
  expiry: number;
}

const cache = new Map<string, CacheItem<any>>();

export function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

export function setCached<T>(key: string, value: T, ttlSeconds: number = 300): void {
  const expiry = Date.now() + ttlSeconds * 1000;
  cache.set(key, { value, expiry });
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
