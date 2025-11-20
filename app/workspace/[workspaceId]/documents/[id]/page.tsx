"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness as YAwareness } from "y-protocols/awareness";
import TiptapEditor from "@/components/TiptapEditor";
import PresenceBar from "@/components/PresenceBar";
import InviteForm from "@/components/InviteForm";
import Breadcrumb from "@/components/breadcrumbs/Breadcrumb";
import { DocumentWithBreadcrumb } from "@/lib/services/documentService";
import { BreadcrumbItem } from "@/lib/types";

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
  const [breadcrumbItems, setBreadcrumbItems] = useState<
  { id: string; title: string }[] | null
>(null);


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
      // IMPORTANT: fetch the main endpoint that returns breadcrumb
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`);

      if (res.ok) {
        const data = await res.json();

        // ------- TITLE -------
        const title = data?.document?.title ?? "";
        setDocumentTitle(title);
        setTitleInput(title);
        console.log("[META] Document metadata loaded:", { title });

        // ------- BREADCRUMB -------
        if (Array.isArray(data?.breadcrumb) && data.breadcrumb.length > 0) {
          // explicitly type the 'b' parameter so TS isn't implicit any
          const items: BreadcrumbItem[] = data.breadcrumb.map((b: { id: string; title?: string; href?: string }) => ({
            id: b.id,
            title: b.title ?? "Untitled",
            href: b.href ?? undefined,
          }));
          setBreadcrumbItems(items);
        } else if (data?.document?.workspaceId) {
          const workspaceName = data.document.workspaceName ?? "Workspace";
          const fallback: BreadcrumbItem[] = [
            {
              id: data.document.workspaceId,
              title: workspaceName,
              href: `/workspace/${data.document.workspaceId}`,
            },
            {
              id: data.document.id,
              title: title || "Untitled",
              href: `/workspace/${data.document.workspaceId}/documents/${data.document.id}`,
            },
          ];
          setBreadcrumbItems(fallback);
        } else {
          setBreadcrumbItems([]);
        }

        // ------- TITLE EDITING MODE -------
        if (isNewRouting || !title || title.trim() === "") {
          setIsEditingTitle(true);
        }
      } else {
        let errMsg = `Failed to fetch document (status ${res.status})`;
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

  // Create a new document (child of current doc)
  const createChildPage = async (title = "Untitled") => {
    if (!workspaceId || !docId) {
      console.warn("[createChildPage] missing workspaceId or docId");
      return null;
    }

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          workspaceId,
          parentId: docId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[createChildPage] failed", res.status, err);
        alert(err?.error || "Failed to create page");
        return null;
      }

      const data = await res.json();
      const newId = data?.id;
      if (!newId) {
        console.warn("[createChildPage] no id in response", data);
        return null;
      }

      // Navigate to newly created child document
      router.push(`/workspace/${workspaceId}/documents/${newId}`);
      return newId;
    } catch (e) {
      console.error("[createChildPage] error", e);
      alert("Error creating page");
      return null;
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
    const MIN_SAVE_INTERVAL = 2000; // Minimum 2 seconds between saves</parameter>

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
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          Authentication Required
        </h2>
        <p className="text-base text-[var(--color-text-secondary)] mb-4">
          Please sign in to access this document
        </p>
        <Link href="/auth/signin" className="btn btn-primary">
          Sign In
        </Link>
      </div>
    </div>
  );

  const renderNoDocId = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-error)] mb-2">
          No Document ID
        </h2>
        <p className="text-base text-[var(--color-text-secondary)]">
          Please provide a valid document ID in the URL.
        </p>
      </div>
    </div>
  );

  // The main editor UI (extracted from your original main return)
  const mainEditorUI = (
    <div className="flex flex-col h-full">
      {/* Document Header */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] sticky top-0 z-[var(--z-sticky)]">
        <div className="editor-container py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Breadcrumb & Title */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {breadcrumbItems ? (
                  <Breadcrumb
                    items={breadcrumbItems}
                    workspaceId={workspaceId ?? ""}
                    maxVisible={28}
                    onNavigate={(pageId: string) => {
                      if (!workspaceId) return;
                      router.push(`/workspace/${workspaceId}/documents/${pageId}`);
                    }}
                    className="mr-2"
                  />
                ) : (
                  <Link
                    href={`/workspace/${workspaceId}/documents`}
                    className="text-base text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 12L6 8l4-4" />
                    </svg>
                    Documents
                  </Link>
                )}

              </div>
              {/* Document Title */}
              {isLoadingDoc ? (
                <div className="w-40 h-6 skeleton" />
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
                  className="input text-xl font-semibold py-1 px-2 w-64"
                />
              ) : (
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  className="text-xl font-semibold text-[var(--color-text-primary)] cursor-pointer px-2 py-1 rounded hover:bg-[var(--color-bg-hover)] transition-colors truncate"
                >
                  {documentTitle || "Untitled"}
                </h1>
              )}
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Saving indicator */}
              {isSaving && (
                <span className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1">
                  <span className="animate-pulse">●</span>
                  Saving...
                </span>
              )}

              {/* Save button */}
              <button
                onClick={async () => {
                  try {
                    // defensive: call manualSaveRef if available
                    if (manualSaveRef.current) {
                      await manualSaveRef.current();
                    } else {
                      console.warn("manualSaveRef not ready");
                    }
                  } catch (err) {
                    console.error("Save button error:", err);
                  }
                }}
                disabled={!isReady || isSaving}
                title={isReady ? "Save (Ctrl/Cmd + S)" : "Save unavailable"}
                className={`btn text-base ${!isReady || isSaving ? "btn-disabled" : "btn-primary"}`}
                type="button"
              >
                {/* simple save icon + label */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                  aria-hidden
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M17 21v-8H7v8" />
                  <path d="M7 3v6h10" />
                </svg>
                Save
              </button>

              {/* Share button */}
              <button
                onClick={() => setShowInviteModal(true)}
                className="btn btn-ghost text-base"
                type="button"
              >
                Share
              </button>

              {/* Delete / Trash */}
              <button
                onClick={() => setShowDeleteModal(true)}
                className="btn btn-ghost text-base text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                type="button"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 4h12" />
                  <path d="M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
                  <path d="M6.5 7.5v4" />
                  <path d="M9.5 7.5v4" />
                  <path d="M3.5 4v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4" />
                </svg>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="editor-container animate-fadeIn">
          <PresenceBar awareness={awareness} />

          {error && (
            <div className="mb-4 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error)] rounded-md text-base text-[var(--color-error)]">
              {error}
            </div>
          )}

          {!isReady ? (
            <div className="text-center py-20">
              <div className="text-lg text-[var(--color-text-secondary)] mb-2">
                {status === "error"
                  ? "❌ Failed to load"
                  : status === "connecting"
                    ? "🔄 Connecting..."
                    : "⏳ Loading..."}
              </div>
              <div className="text-base text-[var(--color-text-tertiary)]">
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
            <div className="text-center py-12 text-[var(--color-text-secondary)]">
              <div className="text-base mb-2">
                Waiting for collaboration subsystem...
              </div>
              <div className="text-xs text-[var(--color-text-tertiary)]">
                Presence or provider not fully initialized yet. If this
                persists, try refreshing the page.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {/* Delete Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[var(--z-modal-backdrop)] animate-fadeIn"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        >
          <div
            className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-[var(--shadow-xl)] w-full max-w-md mx-4 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--color-border)]">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Delete Document
              </h2>
            </div>
            <div className="p-4">
              <p className="text-base text-[var(--color-text-secondary)] mb-2">
                Are you sure you want to delete this document?
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                This action cannot be undone.
              </p>
            </div>
            <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="btn btn-ghost"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDocument}
                disabled={isDeleting}
                className="btn btn-primary bg-[var(--color-error)] hover:bg-[var(--color-error)]/90"
                type="button"
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
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[var(--z-modal-backdrop)] animate-fadeIn"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-[var(--shadow-xl)] w-full max-w-md mx-4 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--color-border)]">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Share Document
              </h2>
            </div>
            <div className="p-4">
              <InviteForm
                resourceId={docId!}
                resourceType="document"
                onClose={() => setShowInviteModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
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
  return mainEditorUI;
}
