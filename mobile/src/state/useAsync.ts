import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";

/**
 * Load-on-mount with error and reload, the pattern every list screen needs.
 * `key` re-runs the load when it changes (e.g. the portfolio id); the latest `fn` is always used.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string | number = "") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });

  // State is only set from the promise callbacks, never synchronously in the effect body.
  const settle = useCallback((p: Promise<T>, isLive: () => boolean) => {
    p.then(
      (v) => {
        if (isLive()) {
          setData(v);
          setError(null);
        }
      },
      (e: unknown) => isLive() && setError(errorText(e)),
    ).finally(() => isLive() && setLoading(false));
  }, []);

  useEffect(() => {
    let live = true;
    settle(latest.current(), () => live);
    return () => {
      live = false;
    };
  }, [key, settle]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await latest.current());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, error, loading, reload, setData };
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}
