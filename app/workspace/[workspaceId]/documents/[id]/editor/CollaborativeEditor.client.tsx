"use client";

import React, { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Placeholder from "@tiptap/extension-placeholder";
import axios from "axios";
import { PageBlock } from "@/components/extensions/PageBlock";

type Props = {
  documentId: string;
  user: { id: string; name?: string; color?: string; avatar?: string | null };
};

export default function CollaborativeEditor({ documentId, user }: Props) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Fetch and apply snapshot
    (async () => {
      try {
        const res = await axios.get(`/api/docs/${documentId}/snapshot`);
        if (res.data?.snapshot) {
          const raw = Uint8Array.from(atob(res.data.snapshot), (c) =>
            c.charCodeAt(0),
          );
          Y.applyUpdate(ydoc, raw);
          console.log("[CollaborativeEditor] Snapshot applied");
        }
      } catch {
        console.log("[CollaborativeEditor] No snapshot found");
      } finally {
        setReady(true);
      }
    })();

    const wsUrl = process.env.NEXT_PUBLIC_Y_WS_URL ?? "ws://localhost:1234";
    const provider = new WebsocketProvider(wsUrl, documentId, ydoc);
    providerRef.current = provider;

    // Presence setup
    const applyPresence = () => {
      const aw = (provider as any)?.awareness;
      if (!aw) return setTimeout(applyPresence, 100);
      try {
        if (typeof (aw as any).setLocalStateField === "function") {
          (aw as any).setLocalStateField("user", {
            id: user.id,
            name: user.name ?? "Anonymous",
            color: user.color ?? "#ffb86b",
            avatar: user.avatar ?? null,
          });
        } else if (typeof aw.setLocalState === "function") {
          aw.setLocalState({
            user: {
              id: user.id,
              name: user.name ?? "Anonymous",
              color: user.color ?? "#ffb86b",
              avatar: user.avatar ?? null,
            },
          });
        }
      } catch (err) {
        console.warn("[CollaborativeEditor] presence error:", err);
      }
    };
    applyPresence();

    // Cleanup on unmount
    return () => {
      const p = providerRef.current;
      const aw = (p as any)?.awareness;
      try {
        if (aw) {
          if (typeof (aw as any).setLocalStateField === "function") {
            (aw as any).setLocalStateField("user", null);
          } else if (typeof aw.setLocalState === "function") {
            aw.setLocalState(null);
          }
        }
        p?.disconnect();
        ydoc.destroy();
      } catch {}
    };
  }, [documentId, user]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      PageBlock,
      Placeholder.configure({
        placeholder: "Start typing...",
      }),
      Collaboration.configure({
        document: ydocRef.current ?? undefined,
      }),
      CollaborationCursor.configure({
        provider: providerRef.current
          ? (providerRef.current as any).awareness
          : undefined,
        user: {
          name: user.name ?? "Anon",
          color: user.color ?? "#ffb86b",
        },
      }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "tiptap-content focus:outline-none min-h-[300px] p-3 rounded-md border border-[var(--color-border)]",
        style:
          "background:var(--color-bg-primary);color:var(--color-text-primary);caret-color:var(--color-text-primary);min-height:300px;padding:12px;",
      },
    },
  });

  const saveSnapshot = async () => {
    if (!ydocRef.current) return;
    const update = Y.encodeStateAsUpdate(ydocRef.current);
    const base64 = btoa(String.fromCharCode(...update));
    await axios.post(`/api/docs/${documentId}/snapshot`, {
      snapshot: base64,
      userId: user.id,
    });
    alert("Snapshot saved!");
  };

  if (!ready) return <div>Loading document…</div>;

  return (
    <div>
      <button onClick={saveSnapshot} className="btn btn-primary mb-2">
        💾 Save Snapshot
      </button>

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
        .ProseMirror {
          background: var(--color-bg-primary) !important;
          color: var(--color-text-primary) !important;
          caret-color: var(--color-text-primary) !important;
        }
      `}</style>
    </div>
  );
}
