"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Awareness } from "y-protocols/awareness";

/**
 * PresenceBar
 *
 * Props:
 *  - awareness: Yjs Awareness instance (could be provider.awareness or standalone Y.Awareness)
 *
 * Behavior:
 *  - subscribes to awareness 'update' events and re-reads awareness.getStates()
 *  - supports multiple presence shapes:
 *    - state = { user: { id, name, avatarUrl, color }, ts }
 *    - or legacy: state = { id, name, avatarUrl, color } (top-level)
 *
 *  - filters out null states and duplicates
 */

type UserPresence = {
  clientId: number | string;
  id?: string;
  name?: string;
  avatarUrl?: string | null;
  color?: string | null;
  ts?: number | null;
};

export default function PresenceBar({ awareness }: { awareness: Awareness | null }) {
  const [peers, setPeers] = useState<UserPresence[]>([]);

  useEffect(() => {
    if (!awareness) {
      setPeers([]);
      return;
    }

    const readStates = (): UserPresence[] => {
      try {
        const map = awareness.getStates ? awareness.getStates() : null;
        if (!map) return [];

        const entries = Array.from(map.entries()) as Array<[any, any]>;
        const parsed = entries
          .map(([clientId, state]) => {
            if (!state) return null;
            // state might be { user: {...}, ts } OR might be the user object itself
            let userData = null;
            if (state.user) {
              userData = state.user;
            } else if (state.name || state.id || state.avatarUrl || state.color) {
              // top-level user fields
              userData = {
                id: state.id,
                name: state.name,
                avatarUrl: state.avatarUrl ?? null,
                color: state.color ?? null,
              };
            } else {
              // unknown shape, skip
              return null;
            }

            return {
              clientId,
              id: userData.id,
              name: userData.name,
              avatarUrl: userData.avatarUrl ?? null,
              color: userData.color ?? null,
              ts: state.ts ?? null,
            } as UserPresence;
          })
          .filter(Boolean) as UserPresence[];

        // de-duplicate by user id (keep the latest ts)
        const byId = new Map<string, UserPresence>();
        for (const p of parsed) {
          const key = p.id ?? String(p.clientId);
          const existing = byId.get(key);
          if (!existing) {
            byId.set(key, p);
          } else {
            const existingTs = existing.ts ?? 0;
            const newTs = p.ts ?? 0;
            if (newTs > existingTs) {
              byId.set(key, p);
            }
          }
        }

        return Array.from(byId.values());
      } catch (err) {
        console.warn("[PresenceBar] readStates error:", err);
        return [];
      }
    };

    // subscribe to awareness updates
    const onAwarenessUpdate = () => {
      const list = readStates();
      setPeers(list);
    };

    try {
      // initial read
      setPeers(readStates());
    } catch (e) {
      // ignore
    }

    // some awareness implementations emit 'update' or 'change' events; subscribe to both defensively
    try {
      if (typeof (awareness as any).on === "function") {
        (awareness as any).on("update", onAwarenessUpdate);
        // some implementations use 'change'
        (awareness as any).on("change", onAwarenessUpdate);
      }
    } catch (e) {
      // ignore
    }

    return () => {
      try {
        if (typeof (awareness as any).off === "function") {
          (awareness as any).off("update", onAwarenessUpdate);
          (awareness as any).off("change", onAwarenessUpdate);
        }
      } catch (e) {
        // ignore
      }
    };
  }, [awareness]);

  const onlineCount = peers.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: -8 }}>
        {peers.slice(0, 5).map((p) => (
          <div
            key={p.clientId}
            title={p.name || String(p.clientId)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid white",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              background: p.color ?? "#e5e7eb",
            }}
          >
            {p.avatarUrl ? (
              <img
                src={p.avatarUrl}
                alt={p.name ?? "user"}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ fontSize: 12, color: "#111827", padding: 4 }}>
                {(p.name || "U").slice(0, 1)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ color: "#6b7280", fontSize: 13 }}>
        {onlineCount === 0 ? "No collaborators online" : `${onlineCount} collaborator${onlineCount > 1 ? "s" : ""} online`}
      </div>
    </div>
  );
}
