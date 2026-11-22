import { Platform } from 'react-native';

/**
 * Backend base URL. Priority:
 *   1. URL saved in the app (Settings -> Server) - lets you switch without rebuilding
 *   2. EXPO_PUBLIC_API_URL (set in .env / eas.json at build time)
 *   3. localhost (Android emulators reach the host machine at 10.0.2.2)
 * Physical phones can't reach "localhost": use your computer's LAN IP, e.g. http://192.168.1.5:5000/api
 */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api');

export const ORG_NAME = 'GKC Collection';
export const REQUEST_TIMEOUT_MS = 20000;
/** Refresh the (long-lived) token when it is older than this and we are online. */
export const TOKEN_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
/** Days of entries kept on the device (the server caps this at 62). */
export const PULL_DAYS = 14;
/** Operations sent per request. Small batches stay well inside the timeout even on a slow server. */
export const PUSH_CHUNK = 10;
/** Push / pull may take longer than a normal call. */
export const SYNC_TIMEOUT_MS = 45000;
/** After a plain save, don't download everything again if we already pulled this recently. */
export const PULL_MIN_INTERVAL_MS = 2 * 60 * 1000;
/** Incremental pulls are re-checked against a full pull at least this often (safety net). */
export const FULL_PULL_EVERY_MS = 6 * 60 * 60 * 1000;
