import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

export function useScreenQuery<T>(query: () => Promise<T>) {
  const queryRef = useRef(query);
  queryRef.current = query;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        setData(await queryRef.current());
      } catch (queryError) {
        setError(
          queryError instanceof Error ? queryError.message : "Unable to load data.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => load(true),
    retry: () => load(),
  };
}
