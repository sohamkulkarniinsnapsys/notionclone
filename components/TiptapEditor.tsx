"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness } from "y-protocols/awareness";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import {
  SlashCommand,
  createSlashCommandSuggestion,
} from "./editor/slash-command";
import { PageBlock } from "./extensions/PageBlock";

interface TiptapEditorProps {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  awareness: Awareness | null;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    color: string;
  } | null;
  docId: string;
  collab?: boolean;
}

/**
 * TiptapEditor
 *
 * - slash suggestion registered before collaboration for reliability
 * - robust presence set/clear logic (does not destroy provider)
 * - collaboration cursor uses either provider or simple shim exposing `.awareness`
 */
export default function TiptapEditor({
  ydoc,
  provider,
  awareness,
  user,
  docId,
  collab = true,
}: TiptapEditorProps) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  // Prefer awareness instance if provided directly or as provider.awareness
  const resolvedAwareness: Awareness | null =
    awareness ?? (provider && (provider as any).awareness) ?? null;

  // Build a provider-like object for CollaborationCursor.
  const collaborationCursorProvider =
    provider ??
    (resolvedAwareness ? { awareness: resolvedAwareness } : undefined);

  const shouldUseCollab = collab && (provider || resolvedAwareness);

  //
  // Editor: register SlashCommand BEFORE Collaboration so suggestion sees raw typing
  //
  const editor = useEditor({
    extensions: [
      // core
      StarterKit.configure({
        history: false, // Disable history when using collaboration
      }),

      PageBlock,

      // Slash suggestion early
      SlashCommand.configure({
        suggestion: createSlashCommandSuggestion(),
      }),

      // Placeholder + table support
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return "Heading";
          }
          return 'Type "/" for commands...';
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,

      // lists
      BulletList,
      OrderedList,

      // Link extension — ensures link marks render as <a> and we control click behavior
      Link.configure({
        openOnClick: false, // we intercept clicks to use next/router
        HTMLAttributes: {
          rel: "noopener noreferrer",
          // You can add className here if you want to style links
        },
      }),

      // Collaboration
      ...(shouldUseCollab
        ? [
            Collaboration.configure({
              document: ydoc,
            }),
            CollaborationCursor.configure({
              provider: collaborationCursorProvider as any,
              user: user
                ? {
                    name: user.name,
                    color: user.color,
                  }
                : {
                    name: "Anonymous",
                    color: "#000000",
                  },
            }),
          ]
        : []),
    ],
    editorProps: {
      attributes: {
        class: "tiptap-content focus:outline-none max-w-none",
        style: "min-height: 400px; padding: 20px; outline: none;",
      },

      /**
       * Intercept clicks inside the editor and handle anchor navigation:
       * - internal links (href starting with "/") -> router.push (SPA navigation)
       * - external links -> let browser handle (open in same tab or respect target attribute)
       *
       * Tiptap's handleClickOn signature: (view, pos, node, nodePos, event) => boolean
       * Return true when we handled the click (prevent default).
       */
      handleClickOn(
        view: any,
        _pos: number,
        _node: any,
        _nodePos: number,
        event: MouseEvent,
      ) {
        try {
          const target = event?.target as HTMLElement | null;
          if (!target) return false;

          // Find nearest anchor (support clicks on nested elements)
          const anchor =
            target.closest && (target.closest("a") as HTMLAnchorElement | null);
          if (anchor && anchor instanceof HTMLAnchorElement) {
            const href = anchor.getAttribute("href") ?? "";

            // If internal link (starts with "/"), use Next router for SPA navigation
            if (href.startsWith("/")) {
              // Avoid default navigation / reload
              // If user held ctrl/meta or middle-click: open in new tab
              const mouseEvent = event as MouseEvent & {
                metaKey?: boolean;
                ctrlKey?: boolean;
                button?: number;
              };
              const openInNewTab =
                mouseEvent.metaKey ||
                mouseEvent.ctrlKey ||
                mouseEvent.button === 1;
              if (openInNewTab) {
                window.open(href, "_blank");
              } else {
                // Use router.push for client-side navigation
                router.push(href);
              }
              event.preventDefault();
              return true; // handled
            }

            // For external links (http(s)...) allow default browser behavior.
            return false;
          }
        } catch (err) {
          // Fall back to default behavior on errors
          if (process.env.NODE_ENV === "development") {
            console.warn("handleClickOn error:", err);
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  //
  // Provider sync handlers (show "Syncing..." indicator)
  //
  useEffect(() => {
    if (!provider) return;
    let mounted = true;

    const handleSync = (synced: boolean) => {
      if (!mounted) return;
      setIsSyncing(!synced);
      if (synced) setIsReady(true);
      if (process.env.NODE_ENV === "development") {
        console.log("[Editor] Sync event:", synced);
      }
    };

    const handleStatus = ({ status }: { status: string }) => {
      if (!mounted) return;
      if (process.env.NODE_ENV === "development") {
        console.log("[Editor] Provider status:", status);
      }
      if (status === "connected") {
        setIsReady(true);
        setIsSyncing(false);
      } else if (status === "disconnected") {
        setIsSyncing(true);
      }
    };

    // initial state: check provider.synced if available
    try {
      if ((provider as any).synced) {
        setIsReady(true);
        setIsSyncing(false);
      }
    } catch (e) {
      // ignore
    }

    try {
      provider.on("sync", handleSync);
      provider.on("status", handleStatus);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Editor] provider event attach failed", e);
      }
    }

    // fallback: if sync never fired, set editor ready after 3s so UI isn't blocked
    const fallbackTimer = setTimeout(() => {
      if (mounted && !isReady) {
        setIsReady(true);
        setIsSyncing(false);
      }
    }, 3000);

    return () => {
      mounted = false;
      try {
        provider.off("sync", handleSync);
        provider.off("status", handleStatus);
      } catch (e) {
        /* ignore */
      }
      clearTimeout(fallbackTimer);
    };
    // provider is the only dependency intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  //
  // Presence: set local state once (optimized to prevent excessive updates)
  //
  useEffect(() => {
    const a = resolvedAwareness;
    if (!a || !user || !editor) return;

    let isActive = true;
    let updateThrottle: ReturnType<typeof setTimeout> | null = null;
    const THROTTLE_MS = 5000; // Only update presence every 5 seconds max

    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        color: user.color,
      },
      ts: Date.now(),
    };

    // Set initial presence state once
    try {
      if (typeof (a as any).setLocalStateField === "function") {
        (a as any).setLocalStateField("user", payload.user);
      } else if (typeof a.setLocalState === "function") {
        a.setLocalState(payload);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[TiptapEditor] Error setting presence:", err);
      }
    }

    // Throttled re-apply on updates to prevent excessive network traffic
    const onUpdate = () => {
      if (!isActive) return;
      if (updateThrottle) return;
      updateThrottle = setTimeout(() => {
        if (!isActive) return;
        try {
          if (typeof (a as any).setLocalStateField === "function") {
            (a as any).setLocalStateField("user", payload.user);
          } else if (typeof a.setLocalState === "function") {
            a.setLocalState(payload);
          }
        } catch (e) {
          // Silently ignore
        }
        updateThrottle = null;
      }, THROTTLE_MS);
    };

    if (typeof (a as any).on === "function") {
      try {
        (a as any).on("update", onUpdate);
      } catch (e) {
        // ignore
      }
    }

    // Clear presence on page unload
    const clearPresence = () => {
      isActive = false;
      if (updateThrottle) {
        clearTimeout(updateThrottle);
      }
      try {
        if (typeof (a as any).setLocalStateField === "function") {
          (a as any).setLocalStateField("user", null);
        } else if (typeof a.setLocalState === "function") {
          a.setLocalState(null);
        }
      } catch (e) {
        /* ignore */
      }
    };

    window.addEventListener("pagehide", clearPresence);
    window.addEventListener("beforeunload", clearPresence);

    return () => {
      isActive = false;
      if (updateThrottle) {
        clearTimeout(updateThrottle);
      }
      window.removeEventListener("pagehide", clearPresence);
      window.removeEventListener("beforeunload", clearPresence);
      if (typeof (a as any).off === "function") {
        try {
          (a as any).off("update", onUpdate);
        } catch (e) {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedAwareness, user?.id, editor]); // only re-run if user ID changes

  //
  // Render / fallbacks
  //
  if (!editor) {
    return (
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          minHeight: 400,
          background: "var(--color-bg-primary)",
          padding: 20,
          position: "relative",
        }}
      >
        {/* Skeleton loader with fixed dimensions to prevent layout shift */}
        <div
          style={{
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div
            style={{
              height: 32,
              width: "40%",
              background: "#e5e7eb",
              borderRadius: 4,
              marginBottom: 16,
            }}
          />
          <div
            style={{
              height: 20,
              width: "90%",
              background: "#f3f4f6",
              borderRadius: 4,
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 20,
              width: "75%",
              background: "#f3f4f6",
              borderRadius: 4,
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 20,
              width: "85%",
              background: "#f3f4f6",
              borderRadius: 4,
              marginBottom: 12,
            }}
          />
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {isSyncing && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            padding: "4px 8px",
            background: "#fef3c7",
            color: "#92400e",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            zIndex: 10,
          }}
        >
          Syncing...
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          minHeight: 400,
          background: "var(--color-bg-primary)",
          willChange: "contents",
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .tiptap-content,
        .tiptap-content .ProseMirror,
        .ProseMirror {
          color: var(--color-text-primary) !important;
          background: var(--color-bg-primary) !important;
          caret-color: var(--color-text-primary) !important;
        }

        .slash-menu {
          background: var(--color-bg-primary);
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
          padding: 8px;
          min-width: 280px;
          max-height: 400px;
          overflow-y: auto;
        }

        .slash-menu-header {
          padding: 8px 12px;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 4px;
        }

        .slash-menu-title {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .slash-menu-items {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .slash-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background-color 0.15s ease;
        }

        .slash-menu-item:hover,
        .slash-menu-item.selected {
          background: #f3f4f6;
        }

        .slash-menu-item-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f9fafb;
          border-radius: 6px;
          font-size: 16px;
          flex-shrink: 0;
        }

        .slash-menu-item.selected .slash-menu-item-icon {
          background: #e5e7eb;
        }

        .slash-menu-item-content {
          flex: 1;
          min-width: 0;
        }

        .slash-menu-item-title {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
          margin-bottom: 2px;
        }

        .slash-menu-item-description {
          font-size: 12px;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .slash-menu-empty {
          padding: 20px;
          text-align: center;
          color: #9ca3af;
        }

        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 1em 0;
          overflow: hidden;
        }

        .ProseMirror td,
        .ProseMirror th {
          min-width: 1em;
          border: 2px solid #e5e7eb;
          padding: 6px 8px;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }

        .ProseMirror th {
          font-weight: 600;
          text-align: left;
          background-color: #f9fafb;
        }

        .ProseMirror .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          background: rgba(200, 200, 255, 0.4);
          pointer-events: none;
        }

        .collaboration-cursor__caret {
          position: relative;
          margin-left: -1px;
          margin-right: -1px;
          border-left: 1px solid #0d0d0d;
          border-right: 1px solid #0d0d0d;
          word-break: normal;
          pointer-events: none;
        }

        .collaboration-cursor__label {
          position: absolute;
          top: -1.4em;
          left: -1px;
          font-size: 12px;
          font-style: normal;
          font-weight: 600;
          line-height: normal;
          user-select: none;
          color: #0d0d0d;
          padding: 0.1rem 0.3rem;
          border-radius: 3px 3px 3px 0;
          white-space: nowrap;
        }

        .tippy-box[data-theme~="slash-menu"] {
          background-color: transparent;
          padding: 0;
        }
        .tippy-box[data-theme~="slash-menu"] .tippy-content {
          padding: 0;
        }
      `}</style>
    </div>
  );
}
