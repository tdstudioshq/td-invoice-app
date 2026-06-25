import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

import { isSupabaseConfigured, supabase } from "@/src/lib/supabase";

export interface RealtimeSource {
  /** Postgres table to watch, e.g. "invoices". */
  table: string;
  /** Optional row filter, e.g. `client_id=eq.${clientId}`. */
  filter?: string;
}

/**
 * Re-runs `onChange` (debounced) whenever any watched table changes, while the
 * screen is focused. The Supabase channel is torn down on blur/unmount so we
 * never leak subscriptions across tabs. No-op when Supabase env is missing.
 *
 * Pair with `useScreenQuery` by passing its silent `retry` as `onChange`.
 */
export function useRealtimeRefresh(
  channelName: string,
  sources: RealtimeSource[],
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Serialize the watch set so the focus effect only re-subscribes when it
  // actually changes (and the callback parses it back, keeping deps honest).
  const sourcesKey = JSON.stringify(sources);

  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured) return;

      const watched: RealtimeSource[] = JSON.parse(sourcesKey);
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const trigger = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => onChangeRef.current(), 400);
      };

      const channel = supabase.channel(channelName);
      for (const source of watched) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: source.table,
            ...(source.filter ? { filter: source.filter } : {}),
          },
          trigger,
        );
      }
      channel.subscribe();

      return () => {
        if (timeout) clearTimeout(timeout);
        void supabase.removeChannel(channel);
      };
    }, [channelName, sourcesKey]),
  );
}
