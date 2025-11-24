"use client";

import React, { useEffect, useState, useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { PageBlock } from "../extensions/PageBlock";
import Image from "@tiptap/extension-image";

import DrawingOverlay from "../drawing/DrawingOverlay.client";
import useDrawingUpload from "../drawing/useDrawingUpload";
import { createDrawCommand, getSlashCommands } from "./slash-command";

type Props = {
  docId: string;
  initialContent?: any | null;
};

export default function TiptapEditor({ docId, initialContent }: Props) {
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const { upload, uploading, progress } = useDrawingUpload();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing here..." }),
      PageBlock,
      Image,
    ],
    content: initialContent ?? "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap-content focus:outline-none min-h-[300px] p-3 rounded-md border border-[var(--color-border)]",
        style:
          "background:var(--color-bg-primary); color:var(--color-text-primary); caret-color:var(--color-text-primary); font-size:15px; line-height:1.6;",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const handler = debounce(async () => {
      try {
        const json = editor.getJSON();
        const html = editor.getHTML();

        const res = await fetch(
          `/api/documents/${encodeURIComponent(docId)}/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contentJson: json,
              contentHtml: html,
            }),
          },
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(
            `[TiptapEditor] autosave returned non-ok (${res.status}):`,
            body,
          );
        } else {
          console.log("[TiptapEditor] Auto-saved");
        }
      } catch (err) {
        console.warn("[TiptapEditor] Autosave failed", err);
      }
    }, 1500);

    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
      handler.cancel && handler.cancel();
    };
  }, [editor, docId]);

  const openDrawingOverlay = useCallback(() => setIsDrawingOpen(true), []);
  const closeDrawingOverlay = useCallback(() => setIsDrawingOpen(false), []);

  useEffect(() => {
    const registry = (getSlashCommands as unknown as () => any)();
    let unregister: undefined | (() => void);

    if (registry && typeof registry.register === "function") {
      unregister = registry.register(
        createDrawCommand(() => {
          openDrawingOverlay();
        }),
      );
    } else if (registry && typeof registry.registerSlashCommand === "function") {
      unregister = registry.registerSlashCommand(
        createDrawCommand(() => {
          openDrawingOverlay();
        }),
      );
    }

    return () => {
      if (typeof unregister === "function") {
        try {
          unregister();
        } catch (e) {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDrawingOverlay]);

  const handleDrawingComplete = useCallback(
    async (blob: Blob, meta?: Record<string, any>) => {
      if (!editor) {
        closeDrawingOverlay();
        return;
      }

      try {
        const { url } = await upload(blob, {
          filename: meta?.filename ?? `drawing-${Date.now()}.png`,
        });

        if (!url) throw new Error("Upload did not return a URL");

        editor.chain().focus().setImage({ src: url }).run();
        closeDrawingOverlay();
      } catch (err) {
        console.error("[TiptapEditor] Failed to upload/insert drawing", err);
        closeDrawingOverlay();
      }
    },
    [editor, upload, closeDrawingOverlay],
  );

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        background: "white",
      }}
    >
      <DrawingOverlay
        visible={isDrawingOpen}
        onCancel={closeDrawingOverlay}
        onComplete={handleDrawingComplete}
      />

      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: 24,
            color: "#9ca3af",
          }}
        >
          Loading editor…
        </div>
      )}

      <style jsx global>{`
        .tiptap-content,
        .ProseMirror {
          background: var(--color-bg-primary) !important;
          color: var(--color-text-primary) !important;
          caret-color: var(--color-text-primary) !important;
        }

        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
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
