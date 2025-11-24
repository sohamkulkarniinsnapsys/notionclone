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
import Image from "@tiptap/extension-image";

import DrawingOverlay from "@/components/drawing/DrawingOverlay.client";
import useDrawingUpload from "@/components/drawing/useDrawingUpload";

type Props = {
  documentId: string;
  user: { id: string; name?: string; color?: string; avatar?: string | null };
};

export default function CollaborativeEditor({ documentId, user }: Props) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [ready, setReady] = useState(false);

  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const { upload } = useDrawingUpload();

  // ref to editor container so overlays can be attached / clipped to editor area
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  // image preview overlay state: used after drawing upload completes to preview the image
  const [imageOverlay, setImageOverlay] = useState<{ visible: boolean; url?: string | null }>({
    visible: false,
    url: null,
  });

  // Initialize Y.Doc, fetch snapshot, provider, presence
  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

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

    // presence: apply user payload when awareness available
    const applyPresence = () => {
      const aw = (provider as any)?.awareness;
      if (!aw) return setTimeout(applyPresence, 100);
      try {
        const payloadUser = {
          id: user.id,
          name: user.name ?? "Anonymous",
          color: user.color ?? "#ffb86b",
          avatar: user.avatar ?? null,
        };
        if (typeof (aw as any).setLocalStateField === "function") {
          (aw as any).setLocalStateField("user", payloadUser);
        } else if (typeof aw.setLocalState === "function") {
          aw.setLocalState({ user: payloadUser });
        }
      } catch (err) {
        console.warn("[CollaborativeEditor] presence error:", err);
      }
    };
    applyPresence();

    // cleanup on unmount
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
      } catch (e) {
        /* ignore */
      }
      try {
        ydoc.destroy();
      } catch {}
    };
    // documentId/user are correct dependencies
  }, [documentId, user]);

  // tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "tiptap-image max-w-full rounded-md" },
      }),
      PageBlock,
      Placeholder.configure({
        placeholder: "Start typing...",
      }),
      Collaboration.configure({
        // pass current ydoc reference (may be null briefly; Collaboration handles updates)
        document: ydocRef.current ?? undefined,
      }),
      CollaborationCursor.configure({
        provider: providerRef.current ? (providerRef.current as any).awareness : undefined,
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

  useEffect(() => {
    (window as any).__tiptapEditor = editor ?? null;

    // Generic overlay API used by slash commands / helpers
    (window as any).__openOverlay = (name: string, opts?: Record<string, any>) => {
      try {
        if (name === "draw") {
          setIsDrawingOpen(true);
          return;
        }
        if (name === "image") {
          const url = opts?.url ?? null;
          setImageOverlay({ visible: true, url });
          return;
        }
      } catch (err) {
        console.warn("window.__openOverlay error:", err);
      }
    };

    // Backwards compatibility
    (window as any).__openDrawingOverlay = () => setIsDrawingOpen(true);

    const onLegacyDraw = () => setIsDrawingOpen(true);
    const onOpenOverlayEvent = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail;
        if (!detail) return;
        const name = detail.name;
        if (name === "draw") setIsDrawingOpen(true);
        if (name === "image" && detail.url) setImageOverlay({ visible: true, url: detail.url });
      } catch (err) {
        /* ignore */
      }
    };

    window.addEventListener("slash:open-draw-overlay", onLegacyDraw);
    window.addEventListener("slash:open-overlay", onOpenOverlayEvent);

    return () => {
      try {
        delete (window as any).__tiptapEditor;
        delete (window as any).__openDrawingOverlay;
        delete (window as any).__openOverlay;
      } catch {}
      window.removeEventListener("slash:open-draw-overlay", onLegacyDraw);
      window.removeEventListener("slash:open-overlay", onOpenOverlayEvent);
    };
  }, [editor]);


  // helper: set drawing presence flag in awareness
  const setDrawingPresence = (flag: boolean) => {
    try {
      const p = providerRef.current as any;
      const a = p?.awareness;
      if (!a) return;
      if (typeof a.setLocalStateField === "function") {
        try {
          a.setLocalStateField("isDrawing", flag);
          return;
        } catch {}
      }
      if (typeof a.setLocalState === "function") {
        try {
          const prev = typeof a.getLocalState === "function" ? a.getLocalState() : a.getState ? a.getState() : null;
          const merged = Object.assign({}, prev ?? {}, { isDrawing: flag });
          a.setLocalState(merged);
        } catch {}
      }
    } catch (err) {
      console.warn("[CollaborativeEditor] setDrawingPresence error:", err);
    }
  };

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

  // Drawing overlay handlers
  const handleDrawingCancel = () => {
    setIsDrawingOpen(false);
    setDrawingPresence(false);
  };

    // Helper to insert image into the editor (called from preview overlay Insert button)
  const insertImageIntoEditor = async (url: string) => {
    if (!url) return;
    try {
      if (editor && typeof editor.chain === "function") {
        editor.chain().focus().setImage({ src: url }).run();
      } else {
        // fallback: dispatch event for other consumers
        window.dispatchEvent(new CustomEvent("slash:insert-image-url", { detail: { url } }));
      }
    } catch (err) {
      console.error("[CollaborativeEditor] insertImageIntoEditor failed:", err);
      try {
        // try fallback commands
        (editor as any).commands?.setImage && (editor as any).commands.setImage({ src: url });
      } catch (e) {
        console.error("[CollaborativeEditor] fallback insert failed:", e);
      }
    } finally {
      // after inserting hide preview
      setImageOverlay({ visible: false, url: null });
    }
  };

  const handleDrawingComplete = async (blob: Blob, meta?: Record<string, any>) => {
    setDrawingPresence(false);
    try {
      const result = await upload(blob, { filename: meta?.filename ?? `drawing-${Date.now()}.png` });
      const url = result?.url;
      if (!url) throw new Error("Upload did not return url");

      // Instead of inserting directly, show an in-editor image preview overlay and
      // let the user decide to Insert into doc or Close.
      setImageOverlay({ visible: true, url });

      // Close the drawing UI
    } catch (err) {
      console.error("[CollaborativeEditor] drawing upload failed:", err);
      try {
        window.alert && window.alert("Failed to upload drawing. See console.");
      } catch {}
    } finally {
      setIsDrawingOpen(false);
    }
  };


  // When overlay opens, mark presence
  useEffect(() => {
    if (isDrawingOpen) {
      setDrawingPresence(true);
    }
    // when closed, handled in cancel/complete flows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawingOpen]);

  if (!ready) return <div>Loading document…</div>;

  return (
    <div>
      <div className="mb-2 flex gap-2 items-center">
        <button onClick={saveSnapshot} className="btn btn-primary">
          💾 Save Snapshot
        </button>

        <button
          onClick={() => {
            setIsDrawingOpen(true);
          }}
          className="btn btn-outline"
          title="Open drawing overlay"
        >
          ✎ Draw
        </button>
      </div>

      <DrawingOverlay
        visible={isDrawingOpen}
        attachTo={editorContainerRef.current}
        positionMode="absolute"
        onCancel={handleDrawingCancel}
        onComplete={handleDrawingComplete}
      />

      <div
        ref={editorContainerRef}
        style={{
          position: "relative", // required so preview overlay and drawing overlay can absolute-position inside it
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          minHeight: 400,
          background: "white",
          overflow: "hidden",
        }}
      >
        <EditorContent editor={editor} />

        {/* Image preview overlay shown after drawing upload completes.
            It sits above the editor content and won't be affected by editing. */}
        {imageOverlay.visible && imageOverlay.url && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 12000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.45)",
              pointerEvents: "auto",
            }}
          >
            <div style={{ position: "relative", maxWidth: "90%", maxHeight: "90%", borderRadius: 8, overflow: "hidden", background: "#111" }}>
              <img
                src={imageOverlay.url}
                alt="Drawing preview"
                style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
              />
              <div style={{ display: "flex", gap: 8, padding: 8, justifyContent: "center", background: "rgba(255,255,255,0.9)" }}>
                <button
                  onClick={() => insertImageIntoEditor(imageOverlay.url!)}
                  className="btn btn-primary"
                  type="button"
                >
                  Insert into document
                </button>
                <button
                  onClick={() => setImageOverlay({ visible: false, url: null })}
                  className="btn btn-outline"
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
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
