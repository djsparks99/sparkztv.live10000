import { useState, useEffect, useRef } from "react";

export function useStableLiveChannels(channels, gracePeriodMs = 6000) {
  const [stableChannels, setStableChannels] = useState(channels);
  const pendingOfflinesRef = useRef({}); // channelUsername/id -> timeoutId

  // Prevent false negatives: immediately update stableChannels if empty but incoming channels are loaded
  if (stableChannels.length === 0 && channels.length > 0) {
    setStableChannels(channels);
  }

  useEffect(() => {
    setStableChannels((prevStable) => {
      const incomingMap = new Map(channels.map((c) => [c.username?.toLowerCase() || c.id, c]));
      const updatedStable = [];

      // We will map over the existing stable channels first to maintain stable transitions
      const processedKeys = new Set();

      prevStable.forEach((existing) => {
        const key = existing.username?.toLowerCase() || existing.id;
        const incoming = incomingMap.get(key);

        if (!incoming) {
          // Channel was deleted or removed from the database, let's let it drop
          if (pendingOfflinesRef.current[key]) {
            clearTimeout(pendingOfflinesRef.current[key]);
            delete pendingOfflinesRef.current[key];
          }
          return;
        }

        processedKeys.add(key);

        const incomingLive = Boolean(incoming.is_live || incoming.isLive);
        const stableLive = Boolean(existing.is_live || existing.isLive);

        if (incomingLive) {
          // If it is live in incoming, clear any pending offline timeout immediately
          if (pendingOfflinesRef.current[key]) {
            clearTimeout(pendingOfflinesRef.current[key]);
            delete pendingOfflinesRef.current[key];
          }
          updatedStable.push(incoming);
        } else if (stableLive) {
          // Channel went offline but is currently stable-live. Start/continue grace period.
          if (!pendingOfflinesRef.current[key]) {
            const timeoutId = setTimeout(() => {
              delete pendingOfflinesRef.current[key];
              setStableChannels((current) =>
                current.map((c) => {
                  const cKey = c.username?.toLowerCase() || c.id;
                  if (cKey === key) {
                    return { ...c, is_live: false, isLive: false };
                  }
                  return c;
                })
              );
            }, gracePeriodMs);
            pendingOfflinesRef.current[key] = timeoutId;
          }
          // Retain live status in stable state for now
          updatedStable.push({ ...incoming, is_live: true, isLive: true });
        } else {
          // Already offline in stable state, update with incoming
          updatedStable.push(incoming);
        }
      });

      // Add any new channels that weren't in prevStable
      channels.forEach((incoming) => {
        const key = incoming.username?.toLowerCase() || incoming.id;
        if (!processedKeys.has(key)) {
          const incomingLive = Boolean(incoming.is_live || incoming.isLive);
          if (incomingLive) {
            // Clear any pending timeout if it existed
            if (pendingOfflinesRef.current[key]) {
              clearTimeout(pendingOfflinesRef.current[key]);
              delete pendingOfflinesRef.current[key];
            }
          }
          updatedStable.push(incoming);
        }
      });

      return updatedStable;
    });
  }, [channels, gracePeriodMs]);

  useEffect(() => {
    return () => {
      Object.values(pendingOfflinesRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  return stableChannels;
}
