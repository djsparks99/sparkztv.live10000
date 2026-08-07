import { useEffect } from "react";
import { api } from "@/lib/api";

export function useLivepeerAutoPoll(channelIdentifier) {
  const resolvedIdentifier = channelIdentifier || "djsparkz";

  useEffect(() => {
    let cancelled = false;

    const pollStatus = async () => {
      try {
        if (!resolvedIdentifier) return;

        // Call backend check-status route which performs Amazon IVS AWS SDK checks and updates Firestore securely
        await api.post("/ivs/check-status", {
          channel_id: resolvedIdentifier,
          stream_id: resolvedIdentifier,
          username: resolvedIdentifier,
        }).catch(() => null);
      } catch (e) {
        // Silent error handling for background polling
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3000); // Polling every 3 seconds for active checks

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [resolvedIdentifier]);
}
