"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness as YAwareness } from "y-protocols/awareness";
import TiptapEditor from "@/components/TiptapEditor";
import PresenceBar from "@/components/PresenceBar";
import InviteForm from "@/components/InviteForm";

// Types
type Params = {
  id: string;
  workspaceId: string;
};

type ConnectionStatus =
  | "initializing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

// Deterministic color generation from userId
function getColorForUserId(userId: string): string {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#F8B739",
    "#52B788",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Helpers for base64 <-> Uint8Array
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function DocPage() {
  const params = useParams() as Params | null;
  const router = useRouter();
  const docIdRaw = params?.id ?? null;
  const docId = docIdRaw ? String(docIdRaw) : null;
  const workspaceId = params?.workspaceId ?? null;

  // Get authenticated session for user info
  const { data: session, status: sessionStatus } = useSession();

  // Document metadata
  const [documentTitle, setDocumentTitle] = useState<string>("");
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Save button enabled state
  const [isSaving, setIsSaving] = useState(false);

  // User info derived from session - deterministic colors
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    color: string;
  } | null>(null);

  // Initialize user from session data
  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (session?.user && !user) {
      const userId =
        (session.user as any).id || session.user.email || "anonymous";
      const displayName =
        (session.user as any).name || session.user.email || "Anonymous";
      const deterministicColor = getColorForUserId(userId);

      setUser({
        id: userId,
        name: displayName,
        email: (session.user as any).email || "",
        avatarUrl: (session.user as any).image || null,
        color: deterministicColor,
      });

      console.log("[AUTH] User initialized from session:", {
        id: userId,
        name: displayName,
        color: deterministicColor,
      });
    } else if (sessionStatus === "unauthenticated" && !user) {
      // Fallback for unauthenticated (shouldn't happen on protected routes)
      const fallbackId = "guest-" + Date.now();
      setUser({
        id: fallbackId,
        name: "Guest",
        email: "",
        avatarUrl: null,
        color: getColorForUserId(fallbackId),
      });
      console.warn("[AUTH] No session found, using guest fallback");
    }
  }, [session, sessionStatus, user]);

  // Fetch document metadata
  useEffect(() => {
    if (!docId) return;

    const fetchDocument = async () => {
      try {
        const response = await fetch(`/api/documents/${docId}`);
        if (response.ok) {
          const data = await response.json();
          setDocumentTitle(data.document?.title || "Untitled");
          setTitleInput(data.document?.title || "Untitled");
        } else {
          console.error("Failed to fetch document");
        }
      } catch (error) {
        console.error("Error fetching document:", error);
      } finally {
        setIsLoadingDoc(false);
      }
    };

    fetchDocument();
  }, [docId]);

  // Handle title edit
  const handleTitleSave = async () => {
    if (!docId || !titleInput.trim()) {
      setIsEditingTitle(false);
      return;
    }

    const trimmedTitle = titleInput.trim();
    const previousTitle = documentTitle;

    // Optimistic update
    setDocumentTitle(trimmedTitle);
    setIsEditingTitle(false);

    try {
      const response = await fetch(`/api/documents/${docId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      if (!response.ok) {
        // Rollback on error
        setDocumentTitle(previousTitle);
        setTitleInput(previousTitle);
        alert("Failed to rename document");
      }
    } catch (error) {
      console.error("Error renaming document:", error);
      // Rollback on error
      setDocumentTitle(previousTitle);
      setTitleInput(previousTitle);
      alert("Error renaming document");
    }
  };

  // Handle document deletion
  const handleDeleteDocument = async () => {
    if (!docId || !workspaceId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/documents/${docId}/delete`, {
        method: "POST",
      });

      if (response.ok) {
        // Redirect to workspace
        router.push(`/workspace/${workspaceId}/documents`);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete document");
        setIsDeleting(false);
        setShowDeleteModal(false);
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Error deleting document");
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // refs to hold ydoc/provider for lifecycle
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const awarenessRef = useRef<YAwareness | null>(null);

  // State for rendering (to avoid ref access during render)
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [awareness, setAwareness] = useState<YAwareness | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("initializing");
  const [error, setError] = useState<string | null>(null);

  // Save helpers refs (so header Save button can call)
  const manualSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Utility to check awareness validity before we attempt to call methods on it
  const hasValidAwareness = useMemo(() => {
    const a: any = awareness;
    if (!a) return false;
    return (
      typeof a.setLocalState === "function" ||
      typeof a.setLocalStateField === "function"
    );
  }, [awareness]);

  useEffect(() => {
    const docIdSafe = docId as string;
    if (!docIdSafe || !user) {
 
      if (!docId) {
        setError("No document ID provided");
      }
      return;
    }

    let mounted = true;
    let cleanupCalled = false;

    // Idle disconnect timer (for visibility hidden)
    let idleDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const IDLE_DISCONNECT_MS = 300_000; // 300 seconds grace window

    // Save debounce state
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    const SAVE_DEBOUNCE_MS = 2000;

    const cleanup = () => {
      if (cleanupCalled) return;
      cleanupCalled = true;

      console.log("[CLEANUP] Starting Yjs resource cleanup...");

      // remove visibility handlers attached on provider
      const pAny = providerRef.current as any;
      if (pAny) {
        try {
          if (pAny.__clearPresenceHandler) {
            window.removeEventListener(
              "pagehide",
              pAny.__clearPresenceHandler,
              { capture: true }
            );
            window.removeEventListener(
              "beforeunload",
              pAny.__clearPresenceHandler,
              { capture: true }
            );
            delete pAny.__clearPresenceHandler;
          }
        } catch (err) {
          /* ignore */
        }

        try {
          if (pAny.__visibilityHandler) {
            document.removeEventListener(
              "visibilitychange",
              pAny.__visibilityHandler
            );
            delete pAny.__visibilityHandler;
          }
        } catch (err) {
          /* ignore */
        }
      }

      try {
        // Clear local presence first - defensive
        const currentProvider = providerRef.current;
        const currentAwareness = awarenessRef.current;

        if (currentProvider?.awareness) {
          try {
            if (typeof currentProvider.awareness.setLocalState === "function") {
              try {
                currentProvider.awareness.setLocalState(null);
                console.log("[CLEANUP] Cleared provider awareness state");
              } catch (err) {
                console.warn("[CLEANUP] setLocalState(null) failed:", err);
              }
            }
            if (typeof currentProvider.awareness.destroy === "function") {
              try {
                currentProvider.awareness.destroy();
                console.log("[CLEANUP] Destroyed provider awareness");
              } catch (err) {
                console.warn("[CLEANUP] Destroy awareness failed:", err);
              }
            }
          } catch (awaErr) {
            console.warn("[CLEANUP] Error clearing provider awareness:", awaErr);
          }
        }

        if (
          currentAwareness &&
          currentAwareness !== currentProvider?.awareness
        ) {
          try {
            if (typeof currentAwareness.setLocalState === "function") {
              try {
                currentAwareness.setLocalState(null);
                console.log("[CLEANUP] Cleared standalone awareness state");
              } catch (err) {
                console.warn(
                  "[CLEANUP] standalone setLocalState(null) failed:",
                  err
                );
              }
            }
            if (typeof currentAwareness.destroy === "function") {
              try {
                currentAwareness.destroy();
                console.log("[CLEANUP] Destroyed standalone awareness");
              } catch (err) {
                console.warn(
                  "[CLEANUP] Destroy standalone awareness failed:",
                  err
                );
              }
            }
          } catch (awaErr) {
            console.warn(
              "[CLEANUP] Error clearing standalone awareness:",
              awaErr
            );
          }
        }
      } catch (err) {
        console.warn("[CLEANUP] Error clearing awareness state:", err);
      }

      try {
        if (providerRef.current) {
          if (typeof providerRef.current.disconnect === "function") {
            try {
              providerRef.current.disconnect();
            } catch (err) {
              console.warn("[CLEANUP] provider.disconnect() failed:", err);
            }
          }
          if (typeof providerRef.current.destroy === "function") {
            try {
              providerRef.current.destroy();
            } catch (err) {
              console.warn("[CLEANUP] provider.destroy() failed:", err);
            }
          }
          console.log("[CLEANUP] Disconnected and destroyed provider");
        }
      } catch (err) {
        console.warn("[CLEANUP] Error disconnecting provider:", err);
      }

      try {
        if (ydocRef.current && typeof ydocRef.current.destroy === "function") {
          try {
            ydocRef.current.destroy();
            console.log("[CLEANUP] Destroyed Y.Doc");
          } catch (err) {
            console.warn("[CLEANUP] Error destroying ydoc:", err);
          }
        }
      } catch (err) {
        console.warn("[CLEANUP] Error destroying ydoc:", err);
      }

      // Reset refs
      providerRef.current = null;
      ydocRef.current = null;
      awarenessRef.current = null;

      if (mounted) {
        setYdoc(null);
        setProvider(null);
        setAwareness(null);
        setIsReady(false);
        setStatus("disconnected");
      }

      // clear timers
      if (idleDisconnectTimer) {
        clearTimeout(idleDisconnectTimer);
        idleDisconnectTimer = null;
      }
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
    };

    // Server save endpoint helper
    async function saveSnapshotToServer(base64Snapshot: string) {
      try {
        // adapt endpoint to your server's expected payload
        const res = await fetch(`/api/documents/${encodeURIComponent(docIdSafe)}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotBase64: base64Snapshot }),
        });
        if (!res.ok) {
          console.warn("[SAVE] server save returned non-ok:", res.status);
          return false;
        }
        console.log("[SAVE] snapshot saved to server");
        return true;
      } catch (err) {
        console.warn("[SAVE] failed to save snapshot to server:", err);
        return false;
      }
    }

    // LocalStorage backup helpers
    function saveLocalBackup(base64Snapshot: string) {
      try {
        localStorage.setItem(`doc-snapshot:${docId}`, base64Snapshot);
        console.log("[LOCAL] backup saved");
      } catch (e) {
        console.warn("[LOCAL] failed to save backup:", e);
      }
    }
    function restoreLocalBackupIfPresent(ydoc: Y.Doc) {
      try {
        const stored = localStorage.getItem(`doc-snapshot:${docId}`);
        if (stored) {
          const bytes = base64ToBytes(stored);
          Y.applyUpdate(ydoc, bytes);
          console.log("[LOCAL] restored backup snapshot");
        }
      } catch (e) {
        console.warn("[LOCAL] restore failed", e);
      }
    }

    // sendBeacon save for unload
    function saveOnUnloadSync() {
      try {
        const ydoc = ydocRef.current;
        if (!ydoc) return;
        const update = Y.encodeStateAsUpdate(ydoc);
        const base64 = bytesToBase64(update);
        saveLocalBackup(base64); // keep local backup always

        // try sendBeacon
        try {
          const url = `/api/documents/${encodeURIComponent(docIdSafe)}/snapshot`;
          const blob = new Blob([JSON.stringify({ snapshotBase64: base64 })], {
            type: "application/json",
          });
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, blob);
            console.log("[SAVE] sendBeacon snapshot queued");
            return;
          }
        } catch (e) {
          // fallthrough to sync XHR fallback
        }

        // fallback synchronous XHR (last resort)
        try {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/documents/${encodeURIComponent(docIdSafe)}/snapshot`, false);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.send(JSON.stringify({ snapshotBase64: base64 }));
          console.log("[SAVE] synchronous snapshot sent (fallback)");
        } catch (e) {
          console.warn("[SAVE] sync fallback failed", e);
        }
      } catch (err) {
        console.warn("[SAVE] saveOnUnloadSync error", err);
      }
    }

    // Debounced autosave scheduling
    const scheduleSave = () => {
      if (!ydocRef.current) return;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          const update = Y.encodeStateAsUpdate(ydocRef.current!);
          const base64 = bytesToBase64(update);
          // save locally first
          saveLocalBackup(base64);
          // attempt server save
          setIsSaving(true);
          const ok = await saveSnapshotToServer(base64);
          setIsSaving(false);
          if (!ok) {
            console.warn("[SAVE] server save failed, kept local backup");
          }
        } catch (err) {
          setIsSaving(false);
          console.warn("[SAVE] error during debounced save", err);
        } finally {
          saveTimeout = null;
        }
      }, SAVE_DEBOUNCE_MS);
    };

    // Manual save API (exposed via ref to header button)
    const manualSave = async () => {
      if (!ydocRef.current) return;
      try {
        const update = Y.encodeStateAsUpdate(ydocRef.current);
        const base64 = bytesToBase64(update);
        saveLocalBackup(base64);
        setIsSaving(true);
        const ok = await saveSnapshotToServer(base64);
        setIsSaving(false);
        if (!ok) {
          alert("Save failed (server). Local backup kept.");
        }
      } catch (err) {
        setIsSaving(false);
        console.warn("[SAVE] manual save failed", err);
        alert("Manual save failed. See console for details.");
      }
    };
    manualSaveRef.current = manualSave;

    const init = async () => {
      try {
        setStatus("initializing");
        setError(null);

        console.log("Initializing Yjs for document:", docId);

        // 1. Fetch persisted snapshot (server should return base64 of raw update bytes)
        let snapshotBase64: string | null = null;
        try {
          const res = await fetch(`/api/documents/${encodeURIComponent(docIdSafe)}`);
          if (res.ok) {
            const data = await res.json();
            snapshotBase64 = data?.snapshotBase64 ?? null;
            console.log(
              "Fetched snapshot:",
              snapshotBase64 ? `${snapshotBase64.length} chars` : "none"
            );
          } else {
            console.warn("Could not fetch snapshot, status:", res.status);
          }
        } catch (err) {
          console.warn("Could not fetch snapshot:", err);
        }

        // 2. Create Y.Doc and apply snapshot if present
        const ydoc = new Y.Doc();

        if (snapshotBase64) {
          try {
            const bytes = base64ToBytes(snapshotBase64);
            Y.applyUpdate(ydoc, bytes);
            console.log("Applied snapshot to Y.Doc (server)");
          } catch (err) {
            console.warn("Failed to apply server snapshot", err);
          }
        } else {
          // no server snapshot - try local backup restore
          try {
            restoreLocalBackupIfPresent(ydoc);
          } catch (err) {
            console.warn("[LOCAL] restore attempt failed", err);
          }
        }

        ydocRef.current = ydoc;
        setYdoc(ydoc);

        // Observe Y.Doc updates -> schedule autosave
        try {
          // prefer 'update' event
          ydoc.on("update", () => {
            scheduleSave();
          });
        } catch (e) {
          // fallback to transaction-based strategy
          try {
            (ydoc as any).on("afterTransaction", () => {
              scheduleSave();
            });
          } catch (e2) {
            console.warn("[SAVE] Could not attach ydoc update listeners", e2);
          }
        }

        // 3. Fetch WebSocket token (if you use one)
        let token: string | null = null;
        try {
          const tokenRes = await fetch(
            `/api/yjs/token?docId=${encodeURIComponent(docIdSafe)}`
          );
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            token = tokenData.token;
            console.log("Fetched WS token");
          } else {
            console.warn("Could not fetch WS token, status", tokenRes.status);
          }
        } catch (err) {
          console.warn("Could not fetch WS token:", err);
        }

        if (!mounted) return cleanup();

        setStatus("connecting");

        // 4. Create provider (y-websocket)
        const wsUrl =
          process.env.NEXT_PUBLIC_Y_WS_URL ?? "ws://localhost:1234";
        console.log("Connecting to WebSocket:", wsUrl);

        const provider = new WebsocketProvider(wsUrl, docIdSafe, ydoc, {
          params: token ? { token } : {},
        });

        if (!mounted) {
          try {
            provider.destroy();
          } catch {}
          return cleanup();
        }

        providerRef.current = provider;
        setProvider(provider);

        // Provider events
        provider.on("status", (event: any) => {
          console.log("Provider status:", event.status);
          if (event.status === "connected") {
            setStatus("connected");
          } else if (event.status === "disconnected") {
            setStatus("disconnected");
          }
        });

        provider.on("sync", (isSynced: boolean) => {
          console.log("Provider synced:", isSynced);
        });

        // Wait for provider.awareness to be available and for provider to be connected.
        const setupAwareness = () => {
          return new Promise<YAwareness>((resolve, reject) => {
            const overallTimeout = setTimeout(() => {
              reject(new Error("Awareness setup timeout after 10 seconds"));
            }, 10000); // 10s overall timeout

            let attempts = 0;
            const attempt = async () => {
              attempts++;
              if (!provider || !mounted) {
                clearTimeout(overallTimeout);
                reject(
                  new Error(
                    "Provider or component unmounted during awareness setup"
                  )
                );
                return;
              }

              const providerAny = provider as any;
              const providerAwareness = providerAny.awareness as
                | YAwareness
                | undefined;

              const hasSetLocalState =
                providerAwareness &&
                typeof providerAwareness.setLocalState === "function";
              const hasGetStates =
                providerAwareness &&
                typeof providerAwareness.getStates === "function";

              console.log(
                `[AWARENESS] attempt ${attempts} - hasAwareness:${!!providerAwareness} setLocalState:${hasSetLocalState} getStates:${hasGetStates}`
              );

              if (
                providerAwareness &&
                (hasSetLocalState ||
                  typeof (providerAwareness as any).setLocalStateField ===
                    "function") &&
                hasGetStates
              ) {
                clearTimeout(overallTimeout);
                resolve(providerAwareness);
                return;
              }

              if (attempts * 150 >= 10000) {
                clearTimeout(overallTimeout);
                reject(new Error("Awareness not ready after attempts"));
                return;
              }

              setTimeout(attempt, 150);
            };

            attempt();
          });
        };

        try {
          const providerAwareness = await setupAwareness();

          if (!mounted) {
            console.log(
              "[INIT] Component unmounted, aborting awareness setup"
            );
            return cleanup();
          }

          // Final validation
          if (
            !providerAwareness ||
            (typeof providerAwareness.setLocalState !== "function" &&
              typeof (providerAwareness as any).setLocalStateField !==
                "function")
          ) {
            throw new Error(
              "Invalid awareness object returned from setupAwareness (missing setLocalState)"
            );
          }

          // Apply presence in a robust way
          const applyLocalState = () => {
            try {
              const payload = {
                user: {
                  id: user!.id,
                  name: user!.name,
                  email: user!.email,
                  avatarUrl: user!.avatarUrl,
                  color: user!.color,
                },
                ts: Date.now(),
              };

              const pAny = providerAwareness as any;
              // try setLocalStateField first
              try {
                if (typeof pAny.setLocalStateField === "function") {
                  pAny.setLocalStateField("user", payload.user);
                  console.log(
                    "[AWARENESS] setLocalStateField('user') ->",
                    payload.user
                  );
                }
              } catch (err) {
                console.warn(
                  "[AWARENESS] setLocalStateField failed, falling back",
                  err
                );
              }

              // ensure we call setLocalState as fallback
              try {
                if (typeof providerAwareness.setLocalState === "function") {
                  providerAwareness.setLocalState(payload);
                  console.log("[AWARENESS] setLocalState(payload) ->", payload);
                }
              } catch (err) {
                console.warn("[AWARENESS] setLocalState(payload) failed", err);
              }

              // inspect presence quickly and retry once if empty
              const dumpStates = () => {
                try {
                  const statesMap = providerAwareness.getStates
                    ? providerAwareness.getStates()
                    : null;
                  const entries = statesMap ? Array.from(statesMap.entries()) : [];
                  console.log(
                    "[AWARENESS] getStates dump after setLocalState:",
                    entries
                  );
                  return entries;
                } catch (err) {
                  console.warn("[AWARENESS] getStates() failed:", err);
                  return [];
                }
              };

              const entriesNow = dumpStates();
              if (!entriesNow || entriesNow.length === 0) {
                setTimeout(() => {
                  try {
                    const entriesRetry = dumpStates();
                    if (!entriesRetry || entriesRetry.length === 0) {
                      console.warn(
                        "[AWARENESS] presence still empty after retry - server may delay broadcasts"
                      );
                    } else {
                      console.log(
                        "[AWARENESS] presence visible after retry",
                        entriesRetry
                      );
                    }
                  } catch (e) {
                    /* ignore */
                  }
                }, 500);
              }
            } catch (err) {
              console.error("[AWARENESS] Failed to apply local state:", err);
            }
          };

          // Listen for provider 'status' to ensure presence is applied when connected
          const providerAny = provider as any;
          let applied = false;

          const statusHandler = (ev: any) => {
            try {
              if (ev?.status === "connected") {
                if (!applied) {
                  applyLocalState();
                  applied = true;
                }
              }
            } catch (err) {
              console.warn("[AWARENESS] statusHandler error:", err);
            }
          };

          try {
            provider.on("status", statusHandler);
          } catch (err) {
            // ignore if provider.on fails
          }

          // If provider looks connected now, apply immediately
          const providerAppearsConnected =
            providerAny &&
            (providerAny.status === "connected" || providerAny.wsconnected === true);
          if (providerAppearsConnected) {
            applyLocalState();
            applied = true;
          } else {
            // fallback apply after a short delay
            const fallbackApplyTimeout = setTimeout(() => {
              if (!applied) {
                console.log("[AWARENESS] fallback apply after delay");
                applyLocalState();
                applied = true;
              }
            }, 1500);
            (providerAny as any).__awarenessFallbackTimeout = fallbackApplyTimeout;
          }

          // Save awareness ref + state for UI
          awarenessRef.current = providerAwareness;
          setAwareness(providerAwareness);

          // Visibility handling: clear presence quickly on hide, but don't destroy provider immediately.
          const onVisibilityChange = () => {
            try {
              const p = providerRef.current as any;
              const a = (awarenessRef.current ?? (p && p.awareness)) as any;
              if (!a) return;

              if (document.visibilityState === "hidden") {
                // remove presence quickly
                try {
                  if (typeof a.setLocalStateField === "function") {
                    a.setLocalStateField("user", null);
                  } else if (typeof a.setLocalState === "function") {
                    a.setLocalState(null);
                  }
                } catch (e) {
                  /* ignore */
                }

                // schedule idle disconnect (graceful)
                if (idleDisconnectTimer) clearTimeout(idleDisconnectTimer);
                idleDisconnectTimer = setTimeout(() => {
                  try {
                    if (p && typeof p.disconnect === "function") p.disconnect();
                    if (p && typeof p.destroy === "function") p.destroy();
                    console.log("[IDLE] provider disconnected after idle");
                  } catch (e) {
                    /* ignore */
                  }
                }, IDLE_DISCONNECT_MS);
              } else {
                // page visible again: cancel scheduled disconnect and re-apply presence
                if (idleDisconnectTimer) {
                  clearTimeout(idleDisconnectTimer);
                  idleDisconnectTimer = null;
                }

                const userPayload = {
                  user: {
                    id: user!.id,
                    name: user!.name,
                    email: user!.email,
                    avatarUrl: user!.avatarUrl,
                    color: user!.color,
                  },
                  ts: Date.now(),
                };

                try {
                  if (typeof a.setLocalStateField === "function") {
                    a.setLocalStateField("user", userPayload.user);
                  } else if (typeof a.setLocalState === "function") {
                    a.setLocalState(userPayload);
                  }
                } catch (e) {
                  /* ignore */
                }
              }
            } catch (err) {
              console.warn("[VISIBILITY] error", err);
            }
          };

          // pagehide / beforeunload => final save, clear presence, disconnect/destroy provider
          const clearPresenceAndDisconnect = (ev?: any) => {
            try {
              // final save sync attempt
              try {
                saveOnUnloadSync();
              } catch (e) {
                /* ignore */
              }

              const p = providerRef.current as any;
              const a = (awarenessRef.current ?? (p && p.awareness)) as any;

              if (a && typeof a.setLocalState === "function") {
                try {
                  a.setLocalState(null);
                  console.log("[UNLOAD] Cleared local awareness state via setLocalState(null)");
                } catch (e) {
                  console.warn("[UNLOAD] setLocalState(null) failed", e);
                }
              } else if (a && typeof a.setLocalStateField === "function") {
                try {
                  a.setLocalStateField("user", null);
                } catch (e) {
                  // ignore
                }
              }

              if (p) {
                try {
                  if (typeof p.disconnect === "function") {
                    p.disconnect();
                    console.log("[UNLOAD] provider.disconnect()");
                  }
                } catch (e) {
                  console.warn("[UNLOAD] provider.disconnect() failed", e);
                }
                try {
                  if (typeof p.destroy === "function") {
                    p.destroy();
                    console.log("[UNLOAD] provider.destroy()");
                  }
                } catch (e) {
                  // ignore
                }
              }
            } catch (err) {
              console.warn("[UNLOAD] Error clearing awareness on unload:", err);
            }
          };

          // Attach handlers
          window.addEventListener("pagehide", clearPresenceAndDisconnect, { capture: true });
          window.addEventListener("beforeunload", clearPresenceAndDisconnect, { capture: true });
          document.addEventListener("visibilitychange", onVisibilityChange);

          // Save references so cleanup can remove them
          (provider as any).__clearPresenceHandler = clearPresenceAndDisconnect;
          (provider as any).__visibilityHandler = onVisibilityChange;

          if (mounted) {
            setIsReady(true);
            setStatus("connected");
            console.log("[INIT] ✅ Editor ready! Collaboration active.");
          }
        } catch (err) {
          console.error("[INIT] ❌ Failed to set up awareness:", err);

          // Fallback: create standalone awareness (won't sync with others)
          try {
            console.warn("[FALLBACK] Creating standalone awareness (no real-time sync)");
            const standaloneAwareness = new YAwareness(ydoc);

            if (
              typeof standaloneAwareness.setLocalState !== "function" ||
              typeof standaloneAwareness.getStates !== "function"
            ) {
              throw new Error("Standalone awareness missing required methods");
            }

            // clear then set
            try {
              standaloneAwareness.setLocalState(null);
            } catch (err) {
              // ignore
            }

            standaloneAwareness.setLocalState({
              user: {
                id: user!.id,
                name: user!.name,
                email: user!.email,
                avatarUrl: user!.avatarUrl,
                color: user!.color,
              },
              ts: Date.now(),
            });

            awarenessRef.current = standaloneAwareness;
            setAwareness(standaloneAwareness);
            console.warn("[FALLBACK] ⚠️ Using standalone awareness (changes won't sync to other users)");

            if (mounted) {
              setIsReady(true);
              setStatus("connected");
              setError("Collaboration unavailable - working in offline mode");
            }
          } catch (fallbackErr) {
            console.error("[FALLBACK] ❌ Failed to create fallback awareness:", fallbackErr);
            setError("Failed to initialize editor. Please refresh the page.");
            setStatus("error");
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
    // Note: user and docId are intentionally dependencies
  }, [docId, user]);

  //
  // -- SINGLE RETURN: build the JSX branches and render one final return --
  //

  // Loading session or initial user not available yet
  const renderLoadingSession = (
    <div
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 20,
        paddingTop: 100,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 16 }}>⏳</div>
      <div style={{ color: "#6b7280" }}>
        {sessionStatus === "loading" ? "Loading session..." : "Initializing..."}
      </div>
    </div>
  );

  const renderUnauthenticated = (
    <div
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 20,
        paddingTop: 100,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 16 }}>🔒</div>
      <div style={{ color: "#6b7280", marginBottom: 16 }}>
        Please sign in to access this document
      </div>
      <a
        href="/api/auth/signin"
        style={{
          display: "inline-block",
          padding: "8px 16px",
          background: "#3b82f6",
          color: "white",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Sign In
      </a>
    </div>
  );

  const renderNoDocId = (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: "#ef4444" }}>Error: No Document ID</h2>
      <p>Please provide a valid document ID in the URL.</p>
    </div>
  );

  // The main editor UI (extracted from your original main return)
  const mainEditorUI = (
    <>
      {/* Document Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #e5e7eb",
          background: "#ffffff",
          position: "sticky",
          top: 60,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Breadcrumb */}
          <div
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}
          >
            <button
              onClick={() => router.push(`/workspace/${workspaceId}/documents`)}
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                cursor: "pointer",
                fontSize: 14,
                padding: "4px 8px",
                borderRadius: 4,
              }}
            >
              ← Documents
            </button>
            <span style={{ color: "#d1d5db" }}>/</span>

            {/* Document Title */}
            {isLoadingDoc ? (
              <div
                style={{
                  width: 200,
                  height: 28,
                  background: "#f3f4f6",
                  borderRadius: 4,
                  animation: "pulse 1.5s infinite",
                }}
              />
            ) : isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitleInput(documentTitle);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#111827",
                  border: "1px solid #3b82f6",
                  borderRadius: 4,
                  padding: "4px 8px",
                  outline: "none",
                  width: 300,
                }}
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#111827",
                  margin: 0,
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 4,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f9fafb")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {documentTitle || "Untitled"}
              </h1>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                if (manualSaveRef.current) {
                  manualSaveRef.current();
                }
              }}
              disabled={isSaving}
              style={{
                padding: "6px 12px",
                background: isSaving ? "#c7d2fe" : "#10b981",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: isSaving ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              title={isSaving ? "Saving..." : "Save"}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={() => setShowInviteModal(true)}
              style={{
                padding: "6px 12px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 2a3 3 0 100 6 3 3 0 000-6zM4 8a4 4 0 118 0 4 4 0 01-8 0zm9.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-2.5 1.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0z" />
                <path d="M12 13h.5a.5.5 0 01.5.5v.5a.5.5 0 01-1 0v-.5a.5.5 0 01.5-.5zM4.5 14h7a.5.5 0 010 1h-7a.5.5 0 010-1z" />
              </svg>
              Invite
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{
                padding: "6px 12px",
                background: "transparent",
                color: "#ef4444",
                border: "1px solid #ef4444",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 20,
          paddingTop: 20,
        }}
      >
        <PresenceBar awareness={awareness} />

        {error && (
          <div
            style={{
              padding: 12,
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {!isReady ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 18, color: "#6b7280", marginBottom: 8 }}>
              {status === "error"
                ? "❌ Failed to load"
                : status === "connecting"
                ? "🔄 Connecting..."
                : "⏳ Loading..."}
            </div>
            <div style={{ fontSize: 14, color: "#9ca3af" }}>
              {status === "error"
                ? error || "Please refresh the page"
                : status === "connecting"
                ? "Establishing connection to collaboration server..."
                : "Initializing editor..."}
            </div>
          </div>
        ) : ydoc && provider && hasValidAwareness ? (
          <TiptapEditor
            ydoc={ydoc!}
            provider={provider!}
            awareness={awareness}
            user={user!}
            docId={docId!}
            collab={true}
          />
        ) : (
          <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>
              Waiting for collaboration subsystem...
            </div>
            <div style={{ fontSize: 13 }}>
              Presence or provider not fully initialized yet. If this persists,
              try refreshing the page.
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600 }}>
              Delete Document
            </h2>
            <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
              Are you sure you want to delete "{documentTitle}"? This action
              cannot be undone.
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
            >
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                style={{
                  padding: "8px 16px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 6,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDocument}
                disabled={isDeleting}
                style={{
                  padding: "8px 16px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowInviteModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600 }}>
              Invite Collaborator
            </h2>
            <InviteForm
              documentId={docId!}
              onClose={() => setShowInviteModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );

  //
  // Decide which branch to render and return it once
  //
  if (sessionStatus === "loading" || !user) {
    // when user is not yet initialized, show the session loading UI
    return renderLoadingSession;
  }

  if (sessionStatus === "unauthenticated") {
    // Not signed in
    return renderUnauthenticated;
  }

  if (!docId) {
    return renderNoDocId;
  }

  // Default: render the main editor UI
  return <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>{mainEditorUI}</div>;
}
