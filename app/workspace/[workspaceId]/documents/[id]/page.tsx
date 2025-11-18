"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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

  const searchParams = useSearchParams();
  const isNewRouting = (searchParams?.get?.("new") ?? "") === "true";

  useEffect(() => {
    try {
      if (workspaceId) {
        (window as any).__CURRENT_WORKSPACE_ID = workspaceId;
        console.debug("[DocPage] __CURRENT_WORKSPACE_ID set ->", workspaceId);
        return () => {
          try {
            delete (window as any).__CURRENT_WORKSPACE_ID;
            console.debug("[DocPage] __CURRENT_WORKSPACE_ID removed");
          } catch (e) {
            /* ignore cleanup errors */
          }
        };
      }
    } catch (e) {
      console.warn("[DocPage] Failed to set global workspace id", e);
    }
  }, [workspaceId]);

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
  // Use useMemo to prevent user object from changing on every render
  const user = useMemo(() => {
    if (sessionStatus === "loading") return null;

    if (session?.user) {
      const userId =
        (session.user as any).id || session.user.email || "anonymous";
      const displayName =
        (session.user as any).name || session.user.email || "Anonymous";
      const deterministicColor = getColorForUserId(userId);

      return {
        id: userId,
        name: displayName,
        email: (session.user as any).email || "",
        avatarUrl: (session.user as any).image || null,
        color: deterministicColor,
      };
    }

    if (sessionStatus === "unauthenticated") {
      // Fallback for unauthenticated (protected routes should prevent this)
      const fallbackId = "guest-" + Date.now();
      return {
        id: fallbackId,
        name: "Guest",
        email: "",
        avatarUrl: null,
        color: getColorForUserId(fallbackId),
      };
    }

    return null;
  }, [session, sessionStatus]);

  // Log user initialization only when it changes
  useEffect(() => {
    if (user) {
      console.log("[AUTH] User initialized from session:", {
        id: user.id,
        name: user.name,
        color: user.color,
      });
    }
  }, [user?.id]);

  // Fetch document metadata (separate endpoint)
  useEffect(() => {
    if (!docId) return;

    const fetchDocumentMeta = async () => {
      setIsLoadingDoc(true);
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(docId)}/meta`,
        );
        if (res.ok) {
          const data = await res.json();
          const title = data?.document?.title ?? "";
          // Title may be empty string (new doc)
          setDocumentTitle(title);
          setTitleInput(title);
          console.log("[META] Document metadata loaded:", { title });

          // If this route was flagged as new OR title is empty, enter edit mode
          if (isNewRouting || !title || title.trim() === "") {
            setIsEditingTitle(true);
            // focus will be handled by input's autoFocus prop
          }
        } else {
          let errMsg = `Failed to fetch document metadata (status ${res.status})`;
          try {
            const errData = await res.json();
            if (errData?.error) errMsg += `: ${errData.error}`;
          } catch {}
          console.warn(errMsg);
        }
      } catch (error) {
        console.error("Error fetching document metadata:", error);
      } finally {
        setIsLoadingDoc(false);
      }
    };

    fetchDocumentMeta();
  }, [docId, isNewRouting]);

  // Handle title edit
  const handleTitleSave = async () => {
    if (!docId || !titleInput.trim()) {
      setIsEditingTitle(false);
      return;
    }

    const trimmedTitle = titleInput.trim();
    const previousTitle = documentTitle;

    // Optimistic UI update
    setDocumentTitle(trimmedTitle);
    setIsEditingTitle(false);

    // Best-effort: write title into Y.Doc meta so other collaborators see change immediately
    try {
      const localYdoc = ydocRef.current ?? ydoc;
      if (localYdoc) {
        localYdoc.transact(() => {
          const meta = localYdoc.getMap("meta");
          meta.set("title", trimmedTitle);
        });
        console.log("[DocPage] wrote title to Y.Doc meta:", trimmedTitle);
      }
    } catch (e) {
      console.warn("[DocPage] failed to write title into ydoc meta:", e);
    }

    // Persist to server (authoritative)
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(docId)}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        },
      );

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        console.error(
          "Failed to rename document via API:",
          response.status,
          bodyText,
        );
        // Roll back on error
        setDocumentTitle(previousTitle);
        setTitleInput(previousTitle);
        alert("Failed to rename document. See console for details.");
        return;
      }

      // Keep UI synced with server returned title if provided
      try {
        const data = await response.json();
        if (data?.document?.title) {
          setDocumentTitle(data.document.title);
          setTitleInput(data.document.title);

          // Broadcast title change event so PageBlock components can update
          try {
            const event = new CustomEvent("document-title-changed", {
              detail: { docId, title: data.document.title },
            });
            window.dispatchEvent(event);
            console.log(
              "[DocPage] Broadcasted title change event:",
              data.document.title,
            );
          } catch (e) {
            console.warn("[DocPage] Failed to broadcast title change:", e);
          }
        }
      } catch (e) {
        /* ignore */
      }
    } catch (error) {
      console.error("Error renaming document:", error);
      // Roll back on error
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
      const response = await fetch(
        `/api/documents/${encodeURIComponent(docId)}/delete`,
        {
          method: "POST",
        },
      );

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

  // Use ref to track if already initialized to prevent re-initialization
  const isInitializedRef = useRef(false);
  const currentDocIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const docIdSafe = docId as string;
    if (!docIdSafe || !user) {
      if (!docId) {
        setError("No document ID provided");
      }
      return;
    }

    // Prevent re-initialization if doc and user haven't changed
    if (
      isInitializedRef.current &&
      currentDocIdRef.current === docIdSafe &&
      currentUserIdRef.current === user.id
    ) {
      console.log("[INIT] Already initialized, skipping re-init");
      return;
    }

    // If docId or userId changed, we need to cleanup and reinit
    if (
      isInitializedRef.current &&
      (currentDocIdRef.current !== docIdSafe ||
        currentUserIdRef.current !== user.id)
    ) {
      console.log("[INIT] Document or user changed, will reinitialize");
      isInitializedRef.current = false;
    }

    currentDocIdRef.current = docIdSafe;
    currentUserIdRef.current = user.id;

    let mounted = true;
    let cleanupCalled = false;

    // Idle disconnect timer (for visibility hidden)
    let idleDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const IDLE_DISCONNECT_MS = 300_000; // 300 seconds grace window

    // Save debounce state
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    const SAVE_DEBOUNCE_MS = 30000; // 30 seconds to reduce server load and improve performance
    let lastSaveTime = 0; // Track last save to prevent excessive saves
    const MIN_SAVE_INTERVAL = 10000; // Minimum 10 seconds between saves</parameter>

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
              { capture: true },
            );
            window.removeEventListener(
              "beforeunload",
              pAny.__clearPresenceHandler,
              { capture: true },
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
              pAny.__visibilityHandler,
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
            console.warn(
              "[CLEANUP] Error clearing provider awareness:",
              awaErr,
            );
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
                  err,
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
                  err,
                );
              }
            }
          } catch (awaErr) {
            console.warn(
              "[CLEANUP] Error clearing standalone awareness:",
              awaErr,
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
        const res = await fetch(
          `/api/documents/${encodeURIComponent(docIdSafe)}/snapshot`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshotBase64: base64Snapshot }),
          },
        );
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
          xhr.open(
            "POST",
            `/api/documents/${encodeURIComponent(docIdSafe)}/snapshot`,
            false,
          );
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

    // Debounced autosave scheduling with rate limiting
    const scheduleSave = () => {
      if (!ydocRef.current) return;

      // Clear existing timeout to restart debounce
      if (saveTimeout) clearTimeout(saveTimeout);

      saveTimeout = setTimeout(async () => {
        try {
          // Check if enough time has passed since last save
          const now = Date.now();
          if (now - lastSaveTime < MIN_SAVE_INTERVAL) {
            console.log("[SAVE] Skipping save, too soon after last save");
            saveTimeout = null;
            return;
          }

          const update = Y.encodeStateAsUpdate(ydocRef.current!);
          const base64 = bytesToBase64(update);

          // save locally first (fast, non-blocking)
          saveLocalBackup(base64);

          // attempt server save
          setIsSaving(true);
          const ok = await saveSnapshotToServer(base64);
          setIsSaving(false);

          if (ok) {
            lastSaveTime = now;
            console.log("[SAVE] snapshot saved to server");
          } else {
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
          const res = await fetch(
            `/api/documents/${encodeURIComponent(docIdSafe)}/snapshot`,
          );
          if (res.ok) {
            const data = await res.json();
            snapshotBase64 = data?.snapshotBase64 ?? null;
            console.log(
              "Fetched snapshot:",
              snapshotBase64 ? `${snapshotBase64.length} chars` : "none",
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

        // Observe Y.Doc updates -> schedule autosave (single, highly throttled mechanism)
        // Using a single observer to prevent duplicate save triggers
        let updateCount = 0;
        try {
          // Use 'update' event but only trigger save every 10 updates to reduce overhead
          ydoc.on("update", () => {
            updateCount++;
            // Throttle: only schedule save every 10 updates (reduces save frequency by 10x)
            if (updateCount % 10 === 0) {
              scheduleSave();
            }
          });
        } catch (e) {
          console.warn("[SAVE] Could not attach ydoc update listener", e);
        }

        // 3. Fetch WebSocket token (if you use one)
        let token: string | null = null;
        try {
          const tokenRes = await fetch(
            `/api/yjs/token?docId=${encodeURIComponent(docIdSafe)}`,
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
        const wsUrl = process.env.NEXT_PUBLIC_Y_WS_URL ?? "ws://localhost:1234";
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
                    "Provider or component unmounted during awareness setup",
                  ),
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
                `[AWARENESS] attempt ${attempts} - hasAwareness:${!!providerAwareness} setLocalState:${hasSetLocalState} getStates:${hasGetStates}`,
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
            console.log("[INIT] Component unmounted, aborting awareness setup");
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
              "Invalid awareness object returned from setupAwareness (missing setLocalState)",
            );
          }

          // Apply presence in a robust way (optimized, reduce logging)
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
              let stateSet = false;

              // try setLocalStateField first
              try {
                if (typeof pAny.setLocalStateField === "function") {
                  pAny.setLocalStateField("user", payload.user);
                  stateSet = true;
                  if (process.env.NODE_ENV === "development") {
                    console.log(
                      "[AWARENESS] Local state set via setLocalStateField",
                    );
                  }
                }
              } catch (err) {
                // Silently fall back
              }

              // ensure we call setLocalState as fallback
              if (!stateSet) {
                try {
                  if (typeof providerAwareness.setLocalState === "function") {
                    providerAwareness.setLocalState(payload);
                    stateSet = true;
                    if (process.env.NODE_ENV === "development") {
                      console.log(
                        "[AWARENESS] Local state set via setLocalState",
                      );
                    }
                  }
                } catch (err) {
                  console.warn("[AWARENESS] Failed to set local state", err);
                }
              }

              // Only validate in development mode to reduce overhead
              if (process.env.NODE_ENV === "development" && stateSet) {
                // Single validation check without retries
                setTimeout(() => {
                  try {
                    const statesMap = providerAwareness.getStates
                      ? providerAwareness.getStates()
                      : null;
                    const entries = statesMap
                      ? Array.from(statesMap.entries())
                      : [];
                    console.log("[AWARENESS] Active users:", entries.length);
                  } catch (err) {
                    // Ignore validation errors
                  }
                }, 1000);
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
            (providerAny.status === "connected" ||
              providerAny.wsconnected === true);
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
            (providerAny as any).__awarenessFallbackTimeout =
              fallbackApplyTimeout;
          }

          // Save awareness ref + state for UI
          awarenessRef.current = providerAwareness;
          setAwareness(providerAwareness);

          // Visibility handling: optimized with debouncing to reduce overhead
          let visibilityTimeout: NodeJS.Timeout | null = null;
          const onVisibilityChange = () => {
            // Debounce visibility changes to prevent rapid state changes
            if (visibilityTimeout) {
              clearTimeout(visibilityTimeout);
            }

            visibilityTimeout = setTimeout(() => {
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

                  // schedule idle disconnect (graceful) - increased timeout for better UX
                  if (idleDisconnectTimer) clearTimeout(idleDisconnectTimer);
                  idleDisconnectTimer = setTimeout(() => {
                    try {
                      if (p && typeof p.disconnect === "function")
                        p.disconnect();
                      // Don't destroy immediately, just disconnect
                      if (process.env.NODE_ENV === "development") {
                        console.log("[IDLE] provider disconnected after idle");
                      }
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

                  // Only re-apply presence if we still have a valid user
                  if (!user) return;

                  const userPayload = {
                    user: {
                      id: user.id,
                      name: user.name,
                      email: user.email,
                      avatarUrl: user.avatarUrl,
                      color: user.color,
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
                if (process.env.NODE_ENV === "development") {
                  console.warn("[VISIBILITY] error", err);
                }
              }
            }, 300); // 300ms debounce to prevent rapid state changes
          };

          // pagehide / beforeunload => final save, clear presence, disconnect/destroy provider
          const clearPresenceAndDisconnect = (ev?: any) => {
            // Clear any pending visibility timeouts
            if (visibilityTimeout) {
              clearTimeout(visibilityTimeout);
            }

            try {
              // final save sync attempt (but don't block)
              try {
                saveOnUnloadSync();
              } catch (e) {
                /* ignore */
              }

              const p = providerRef.current as any;
              const a = (awarenessRef.current ?? (p && p.awareness)) as any;

              // Clear awareness state
              if (a) {
                try {
                  if (typeof a.setLocalState === "function") {
                    a.setLocalState(null);
                  } else if (typeof a.setLocalStateField === "function") {
                    a.setLocalStateField("user", null);
                  }
                } catch (e) {
                  // Silently ignore to prevent blocking page unload
                }
              }

              // Disconnect provider
              if (p) {
                try {
                  if (typeof p.disconnect === "function") {
                    p.disconnect();
                  }
                  if (typeof p.destroy === "function") {
                    p.destroy();
                  }
                } catch (e) {
                  // Silently ignore to prevent blocking page unload
                }
              }
            } catch (err) {
              // Silently ignore to prevent blocking page unload
            }
          };

          // Attach handlers (use passive listeners where possible for better performance)
          window.addEventListener("pagehide", clearPresenceAndDisconnect, {
            capture: true,
            passive: true,
          });
          window.addEventListener("beforeunload", clearPresenceAndDisconnect, {
            capture: true,
          });
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
            console.warn(
              "[FALLBACK] Creating standalone awareness (no real-time sync)",
            );
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
            console.warn(
              "[FALLBACK] ⚠️ Using standalone awareness (changes won't sync to other users)",
            );

            if (mounted) {
              setIsReady(true);
              setStatus("connected");
              setError("Collaboration unavailable - working in offline mode");
            }
          } catch (fallbackErr) {
            console.error(
              "[FALLBACK] ❌ Failed to create fallback awareness:",
              fallbackErr,
            );
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

    init().then(() => {
      isInitializedRef.current = true;
    });

    return () => {
      mounted = false;
      cleanup();
    };
    // Only depend on primitive IDs to prevent unnecessary re-initialization
  }, [docId, user?.id]);

  // Observe Y.Doc meta.title for realtime rename propagation
  useEffect(() => {
    const theYdoc = ydoc ?? ydocRef.current;
    if (!theYdoc) return;

    try {
      const meta = theYdoc.getMap("meta");

      // Apply any existing meta.title immediately
      const initialTitle = meta.get("title");
      if (typeof initialTitle === "string") {
        setDocumentTitle(initialTitle);
        setTitleInput(initialTitle);
        // if blank and routing indicates new, enter edit mode
        if (!initialTitle && isNewRouting) {
          setIsEditingTitle(true);
        }
      }

      const handler = (evt: any) => {
        const newTitle = meta.get("title");
        if (typeof newTitle === "string") {
          setDocumentTitle(newTitle);
          setTitleInput(newTitle);
          console.log("[YJS META] title changed ->", newTitle);

          // Broadcast title change event so PageBlock components can update
          try {
            if (docId) {
              const event = new CustomEvent("document-title-changed", {
                detail: { docId, title: newTitle },
              });
              window.dispatchEvent(event);
              console.log(
                "[YJS META] Broadcasted title change event:",
                newTitle,
              );
            }
          } catch (e) {
            console.warn("[YJS META] Failed to broadcast title change:", e);
          }
        }
      };

      meta.observe(handler);
      return () => {
        try {
          meta.unobserve(handler);
        } catch (e) {
          /* ignore */
        }
      };
    } catch (err) {
      console.warn("[DocPage] failed to attach meta observer:", err);
    }
  }, [ydoc, isNewRouting]);

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
          padding: "12px 24px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 1000,
          minHeight: "60px", // Prevent layout shift during load
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
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 60,
          paddingTop: 24,
          minHeight: "400px", // Prevent layout shift when editor loads
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

  // explicit session handling to avoid showing "loading" for unauthenticated users
  if (sessionStatus === "loading") {
    return renderLoadingSession;
  }
  if (sessionStatus === "unauthenticated") {
    return renderUnauthenticated;
  }
  // still no user object (should be rare) — show loading
  if (!user) {
    return renderLoadingSession;
  }

  if (!docId) {
    return renderNoDocId;
  }

  // Default: render the main editor UI
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      {mainEditorUI}
    </div>
  );
}
