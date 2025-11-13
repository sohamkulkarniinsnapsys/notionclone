"use client";

import React, { useEffect, useState } from "react";
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

interface TiptapEditorProps {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
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
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  // Prefer awareness instance if provided directly or as provider.awareness
  const resolvedAwareness: Awareness | null =
    awareness ?? (provider && (provider as any).awareness) ?? null;

  // Build a provider-like object for CollaborationCursor.
  const collaborationCursorProvider =
    provider ?? (resolvedAwareness ? { awareness: resolvedAwareness } : undefined);

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
      console.log("[Editor] Sync event:", synced);
    };

    const handleStatus = ({ status }: { status: string }) => {
      if (!mounted) return;
      console.log("[Editor] Provider status:", status);
      if (status === "connected") {
        setIsReady(true);
        setIsSyncing(false);
      } else if (status === "disconnected") {
        setIsSyncing(true);
      }
    };

    // initial state
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
      console.warn("[Editor] provider event attach failed", e);
    }

    // fallback: if sync never fired, set editor ready after 2s so UI isn't blocked
    const fallbackTimer = setTimeout(() => {
      if (!isReady) {
        setIsReady(true);
        setIsSyncing(false);
      }
    }, 2000);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  //
  // Presence: set local state in a cross-version-safe way
  //
  useEffect(() => {
    const a = resolvedAwareness;
    if (!a || !user || !editor) return;

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

    // prefer setLocalStateField when available (common with y-websocket)
    try {
      if (typeof (a as any).setLocalStateField === "function") {
        (a as any).setLocalStateField("user", payload.user);
      } else if (typeof a.setLocalState === "function") {
        a.setLocalState(payload);
      } else {
        console.warn("[TiptapEditor] Awareness has no setLocalState* API");
      }
    } catch (err) {
      console.warn("[TiptapEditor] Error setting local presence:", err);
    }

    // Re-apply on updates (some servers re-create the awareness object)
    const onUpdate = () => {
      try {
        if (typeof (a as any).setLocalStateField === "function") {
          (a as any).setLocalStateField("user", payload.user);
        } else if (typeof a.setLocalState === "function") {
          a.setLocalState(payload);
        }
      } catch (e) {
        /* ignore */
      }
    };

    if (typeof (a as any).on === "function") {
      try {
        (a as any).on("update", onUpdate);
      } catch (e) {
        // ignore
      }
    }

    // Clear presence quickly on pagehide to avoid duplicates on refresh
    const clearPresence = () => {
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

    window.addEventListener("pagehide", clearPresence, { capture: true });
    window.addEventListener("beforeunload", clearPresence, { capture: true });

    return () => {
      try {
        if (typeof (a as any).off === "function") {
          (a as any).off("update", onUpdate);
        }
      } catch (e) {
        /* ignore */
      }
      window.removeEventListener("pagehide", clearPresence, { capture: true });
      window.removeEventListener("beforeunload", clearPresence, { capture: true });
      // best-effort clear on unmount
      clearPresence();
    };
  }, [resolvedAwareness, editor, user]);

  //
  // Render / fallbacks
  //
  if (!editor) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#9ca3af",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
        }}
      >
        Loading editor...
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
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          minHeight: 400,
          background: "white",
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .tiptap-content,
        .tiptap-content .ProseMirror,
        .ProseMirror {
          color: #111827 !important;
          background: #ffffff !important;
          caret-color: #111827 !important;
        }

        .slash-menu {
          background: white;
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
