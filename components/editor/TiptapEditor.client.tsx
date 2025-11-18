"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import { PageBlock } from "../extensions/PageBlock";

type Props = {
  docId: string;
  initialContent?: any | null;
};

/**
 * Lightweight, autosaving TipTap editor
 * Used in non-collaborative contexts (single-user pages)
 */
export default function TiptapEditor({ docId, initialContent }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing here...",
      }),
      PageBlock,
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

  // Debounced autosave on document updates
  useEffect(() => {
    if (!editor) return;

    const handler = debounce(async () => {
      try {
        const json = editor.getJSON();
        const html = editor.getHTML();
        await fetch(`/api/docs/${encodeURIComponent(docId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentJson: json,
            contentHtml: html,
          }),
        });
        console.log("[TiptapEditor] Auto-saved");
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

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        background: "white",
      }}
    >
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
        /* Ensure readable text colors across themes */
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

/**
 * Safe debounce helper with cancel()
 */
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
