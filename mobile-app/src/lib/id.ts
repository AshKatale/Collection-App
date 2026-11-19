import * as Crypto from 'expo-crypto';

/** Collision-safe id for idempotent requests (offline replays, retries). */
export function uuid(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
