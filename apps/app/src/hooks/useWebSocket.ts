import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createRealtimeCacheEffects } from "./realtime-cache-effects";
import { applyHostMemoryUsageSignal } from "./cache-owners/query-cache";
import { useDeletedResourceRouteOwner } from "./cache-owners/resource-route-owner";
import { wsManager } from "../lib/ws";

export function useWebSocket(): void {
  const queryClient = useQueryClient();
  const handleDeletedResourceRouteChange = useDeletedResourceRouteOwner();
  const deletedResourceRouteChangeRef = useRef(
    handleDeletedResourceRouteChange,
  );
  deletedResourceRouteChangeRef.current = handleDeletedResourceRouteChange;

  useEffect(() => {
    const cacheEffects = createRealtimeCacheEffects({ queryClient });
    const unsubscribeConnected = wsManager.onConnected(
      cacheEffects.handleConnected,
    );
    const unsubscribe = wsManager.onChanged((message) => {
      cacheEffects.handleChanged(message);
      deletedResourceRouteChangeRef.current(message);
    });
    const unsubscribeHostMemoryUsage = wsManager.onHostMemoryUsage(
      (signal) => {
        applyHostMemoryUsageSignal(queryClient, signal);
      },
    );

    wsManager.connect();

    return () => {
      cacheEffects.dispose();
      unsubscribeConnected();
      unsubscribe();
      unsubscribeHostMemoryUsage();
    };
  }, [queryClient]);
}
