import { useState, useEffect, useCallback } from 'react';
import { get } from './api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(path: string, pollMs?: number): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await get<T>(path);
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    fetchData();

    if (pollMs && pollMs > 0) {
      const interval = setInterval(fetchData, pollMs);
      return () => clearInterval(interval);
    }
  }, [fetchData, pollMs]);

  return { data, loading, error, refetch: fetchData };
}
