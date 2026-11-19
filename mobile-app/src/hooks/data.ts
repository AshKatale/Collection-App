import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheRead, cacheWrite, isDbOpen } from '@/db';
import { errorMessage, isNetworkError } from '@/lib/format';
import { useSync } from '@/sync/engine';

/** Runs a local-database query and re-runs it whenever local data or the sync state changes. */
export function useLocal<T>(fn: () => Promise<T>, deps: unknown[], initial: T): { data: T; loading: boolean; reload: () => Promise<void> } {
  const { version } = useSync();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async () => {
    if (!isDbOpen()) return;
    const n = ++seq.current;
    try {
      const out = await fnRef.current();
      if (n === seq.current) setData(out);
    } catch (e) {
      console.warn('local query failed', e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, reload, ...deps]);

  return { data, loading, reload };
}

export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** The data shown is the last copy saved on this phone (we are offline). */
  fromCache: boolean;
  savedAt: number | null;
  reload: () => Promise<void>;
};

/**
 * Loads a server screen. Online: fresh data (and saves a copy). Offline: the last saved copy.
 * `key` must identify the request (including its parameters).
 */
export function useApi<T>(key: string, fetcher: () => Promise<T>, deps: unknown[] = [], enabled = true): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  useEffect(() => {
    fetchRef.current = fetcher;
  });

  const reload = useCallback(async () => {
    if (!enabled) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const out = await fetchRef.current();
      if (n !== seq.current) return;
      setData(out);
      setError(null);
      setFromCache(false);
      setSavedAt(Date.now());
      void cacheWrite(key, out);
    } catch (err) {
      if (n !== seq.current) return;
      if (isNetworkError(err)) {
        const cached = await cacheRead<T>(key);
        if (n !== seq.current) return;
        if (cached) {
          setData(cached.data);
          setFromCache(true);
          setSavedAt(cached.savedAt);
          setError(null);
        } else {
          setData(null);
          setError('You are offline and this has not been opened before.');
        }
      } else {
        setError(errorMessage(err));
      }
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [key, enabled]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  return { data, loading, error, fromCache, savedAt, reload };
}
