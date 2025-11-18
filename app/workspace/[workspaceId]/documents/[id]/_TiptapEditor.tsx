"use client";

import React, { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness as YAwareness } from "y-protocols/awareness";
import {
  SlashCommand,
  createSlashCommandSuggestion,
} from "@/components/editor/slash-command";

type Props = {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  awareness?: YAwareness | null;
  user: { id: string; name: string; color: string; avatarUrl?: string | null };
  docId: string;
  collab?: boolean;
};

export default function TiptapEditor({
  ydoc,
  provider,
  awareness,
  user,
  docId,
  collab = true,
}: Props) {
  const providerAwareness: YAwareness | null =
    (provider as any)?.awareness ?? awareness ?? null;

  /** Unified awareness setter */
  const setLocalUserState = (a: YAwareness | null, value: any) => {
    if (!a) return;
    try {
      if (typeof (a as any).setLocalStateField === "function") {
        (a as any).setLocalStateField("user", value);
      } else if (typeof a.setLocalState === "function") {
        a.setLocalState(value);
      }
    } catch (err) {
      console.warn("[TiptapEditor] setLocalUserState failed:", err);
    }
  };

  const clearLocalUserState = (a: YAwareness | null) => {
    try {
      setLocalUserState(a, null);
    } catch {}
  };

  /** Presence payload */
  const buildUserPresence = () => ({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    color: user.color ?? "#4ECDC4",
    ts: Date.now(),
  });

  /** TipTap Editor setup */
  const hasAwareness = !!providerAwareness;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      // Slash first
      SlashCommand.configure({ suggestion: createSlashCommandSuggestion() }),
      Placeholder.configure({
        placeholder: "Type '/' for commands or start writing...",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ...(collab
        ? [
            Collaboration.configure({ document: ydoc }),
            ...(hasAwareness
              ? [
                  CollaborationCursor.configure({
                    provider: providerAwareness as any,
                    user: {
                      name: user.name ?? "Anonymous",
                      color: user.color ?? "#ffb86b",
                    },
                  }),
                ]
              : []),
          ]
        : []),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "tiptap-content focus:outline-none min-h-[320px] p-3",
        spellCheck: "true",
        style:
          "background:var(--color-bg-primary);color:var(--color-text-primary);caret-color:var(--color-text-primary);min-height:320px;padding:12px;",
      },
    },
  });

  /** Convert Uint8Array → Blob */
  const uint8ArrayToBlob = (u8: Uint8Array) => {
    const copy = new Uint8Array(u8);
    return new Blob([copy], { type: "application/octet-stream" });
  };

  /** Awareness setup */
  useEffect(() => {
    if (!providerAwareness) return;
    setLocalUserState(providerAwareness, { user: buildUserPresence() });

    const onUpdate = () =>
      setLocalUserState(providerAwareness, { user: buildUserPresence() });

    (providerAwareness as any)?.on?.("update", onUpdate);

    const cleanup = () => clearLocalUserState(providerAwareness);
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("beforeunload", cleanup);

    return () => {
      (providerAwareness as any)?.off?.("update", onUpdate);
      cleanup();
      window.removeEventListener("pagehide", cleanup);
      window.removeEventListener("beforeunload", cleanup);
    };
  }, [providerAwareness, user]);

  /** Debounced autosave */
  useEffect(() => {
    if (!editor) return;

    const debounced = debounce(async () => {
      try {
        const update = Y.encodeStateAsUpdate(ydoc);
        const blob = uint8ArrayToBlob(update);
        await fetch(`/api/documents/${encodeURIComponent(docId)}/persist`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
        });
        console.log("[TiptapEditor] auto-saved");
      } catch (err) {
        console.warn("[TiptapEditor] autosave failed", err);
      }
    }, 2000);

    editor.on("transaction", debounced);
    return () => {
      editor.off("transaction", debounced);
      debounced.cancel?.();
    };
  }, [editor, ydoc, docId]);

  /** Manual snapshot save */
  const manualSave = async () => {
    try {
      const update = Y.encodeStateAsUpdate(ydoc);
      const blob = uint8ArrayToBlob(update);
      await fetch(`/api/documents/${encodeURIComponent(docId)}/persist`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });
      alert("Snapshot saved!");
    } catch {
      alert("Save failed!");
    }
  };

  if (!provider || !providerAwareness)
    return <div>Waiting for collaboration provider...</div>;

  return (
    <div>
      <button onClick={manualSave} className="btn btn-primary mb-2">
        💾 Save Snapshot
      </button>

      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          minHeight: 400,
          background: "var(--color-bg-primary)",
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .tiptap-content,
        .ProseMirror {
          background: var(--color-bg-primary) !important;
          color: var(--color-text-primary) !important;
          caret-color: var(--color-text-primary) !important;
        }
      `}</style>
    </div>
  );
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms = 200) {
  let t: ReturnType<typeof setTimeout> | null = null;
  let canceled = false;
  const wrapper = (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      if (!canceled) fn(...args);
    }, ms);
  };
  (wrapper as any).cancel = () => {
    canceled = true;
    if (t) clearTimeout(t);
  };
  return wrapper as T & { cancel?: () => void };
}
