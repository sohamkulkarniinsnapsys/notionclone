import React from "react";
import { Editor } from "@tiptap/core";

export interface CommandHelpers {
  openOverlay?: (name: string, opts?: Record<string, any>) => void;
  openFilePicker?: (accept?: string) => Promise<File | null>;
  uploadFile?: (file: File | Blob, opts?: Record<string, any>) => Promise<{ url: string; filename?: string; size?: number }>;
  notify?: (message: string, opts?: { type?: "info" | "success" | "error" }) => void;
}

export type CommandAction = (editor: Editor, helpers?: CommandHelpers) => void | Promise<void>;

export interface CommandItem {
  title: string;
  description: string;
  icon: string | React.ReactNode;
  command: CommandAction;
  aliases?: string[];
  category?: "basic" | "advanced" | "media" | "structure";
}

export interface CommandGroup {
  name: string;
  commands: CommandItem[];
}

export function getSlashCommands(): CommandItem[] {
  return [
    {
      title: "Text",
      description: "Start writing with plain text",
      icon: "📝",
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().setParagraph().run();
      },
      aliases: ["paragraph", "p"],
    },
    {
      title: "Heading 1",
      description: "Big section heading",
      icon: "H1",
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().setHeading({ level: 1 }).run();
      },
      aliases: ["h1", "title"],
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      icon: "H2",
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().setHeading({ level: 2 }).run();
      },
      aliases: ["h2", "subtitle"],
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      icon: "H3",
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().setHeading({ level: 3 }).run();
      },
      aliases: ["h3", "subheading"],
    },
    {
      title: "Page",
      description: "Create a new page as a block",
      icon: "📄",
      category: "structure",
      aliases: ["page", "link page", "subpage"],
      command: async (editor) => {
        try {
          const workspaceFromWindow = (window as any).__CURRENT_WORKSPACE_ID ?? null;
          const parentFromWindow = (window as any).__CURRENT_DOCUMENT_ID ?? null;
          const guessWorkspace = (() => {
            try {
              const m = window.location.pathname.match(/\/workspace\/([^/]+)/);
              return m ? m[1] : null;
            } catch {
              return null;
            }
          })();
          const workspaceId = workspaceFromWindow || guessWorkspace || "personal";
          const parentId = parentFromWindow ?? null;
          const res = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              title: "Untitled",
              parentId,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("Failed to create document for page block: ", res.status, text);
            alert("Failed to create page. See console for details.");
            return;
          }
          const data = await res.json();
          const doc = data.document;
          if (!doc || !doc.id) {
            console.error("API returned unexpected document:", data);
            alert("Failed to create page (invalid response).");
            return;
          }
          editor.chain().focus().insertPageBlock({
            docId: doc.id,
            title: doc.title || "Untitled",
            workspaceId: doc.workspaceId || workspaceId,
          }).run();
        } catch (err) {
          console.error("Error creating page in slash command:", err);
          alert("Error creating page. See console for details.");
        }
      },
    },
    {
      title: "Bullet List",
      description: "Create a simple bulleted list",
      icon: "•",
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().toggleBulletList().run();
      },
      aliases: ["ul", "unordered", "list"],
    },
    {
      title: "Numbered List",
      description: "Create a numbered list",
      icon: "1.",
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().toggleOrderedList().run();
      },
      aliases: ["ol", "ordered", "numbers"],
    },
    {
      title: "Image",
      description: "Upload an image from your files",
      icon: "🖼️",
      category: "media",
      command: (editor, helpers) => {
        try {
          if (helpers?.openFilePicker) {
            helpers.openFilePicker("image/*").then(async (file) => {
              if (!file) return;
              let url: string | undefined;
              if (helpers?.uploadFile) {
                try {
                  const out = await helpers.uploadFile(file);
                  url = out?.url;
                } catch (err) {
                  console.error("[Slash] helpers.uploadFile failed", err);
                }
              }
                            if (!url) {
                const fd = new FormData();
                fd.append("file", file, (file as File).name);
                const res = await fetch("/api/uploads", { method: "POST", body: fd });
                if (!res.ok) {
                  const txt = await res.text().catch(() => "");
                  console.error("[Slash] upload failed:", res.status, txt);
                  alert("Image upload failed");
                  return;
                }
                const json = await res.json().catch(() => null);
                url = json?.url ?? json?.data?.url;
              }
              if (!url) {
                console.error("[Slash] upload returned no url");
                alert("Upload succeeded but no image URL returned");
                return;
              }
              try {
                if (helpers?.openOverlay && typeof helpers.openOverlay === "function") {
                  try {
                    await helpers.openOverlay("image", { url, filename: (file as File).name });
                    try { editor.commands.focus(); } catch {}
                    return;
                  } catch (overlayErr) {
                    console.warn("[Slash] helpers.openOverlay failed, falling back to insert:", overlayErr);
                  }
                }
                (editor as any).chain().focus().setImage({ src: url }).run();
              } catch (err) {
                console.error("[Slash] failed to insert or open overlay for image:", err);
                alert("Image uploaded but could not be used (see console)");
              }
            });
            return;
          }
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.style.display = "none";
          document.body.appendChild(input);
          input.onchange = async () => {
            const file = input.files?.[0];
            setTimeout(() => {
              try {
                input.remove();
              } catch {}
            }, 1000);
            if (!file) return;
              try {
                const fd = new FormData();
                fd.append("file", file, file.name);
                const res = await fetch("/api/uploads", { method: "POST", body: fd });
                if (!res.ok) {
                  const txt = await res.text().catch(() => "");
                  console.error("[Slash] upload failed:", res.status, txt);
                  alert("Image upload failed");
                  return;
                }
                const json = await res.json().catch(() => null);
                const url = json?.url ?? json?.data?.url;
                if (!url) {
                  console.error("[Slash] upload returned no url:", json);
                  alert("Upload succeeded but no image URL returned");
                  return;
                }
                try {
                  // Prefer opening overlay if possible — keeps media as overlay (topmost)
                  if (helpers?.openOverlay && typeof helpers.openOverlay === "function") {
                    try {
                      await helpers.openOverlay("image", { url, filename: file.name });
                      try { editor.commands.focus(); } catch {}
                      return;
                    } catch (overlayErr) {
                      console.warn("[Slash] helpers.openOverlay failed, falling back to insert:", overlayErr);
                    }
                  }
                  // Fallback: insert image node into document
                  (editor as any).chain().focus().setImage({ src: url }).run();
                } catch (err) {
                  console.error("[Slash] failed to insert or open overlay for image:", err);
                  alert("Image uploaded but could not be used (see console)");
                }
              } catch (err) {
                console.error("[Slash] upload error:", err);
                alert("Image upload error (see console)");
              }
          };
          input.click();
        } catch (err) {
          console.error("[Slash] Image command top-level error:", err);
        }
      },
      aliases: ["image", "img", "picture", "photo"],
    },
    {
      title: "Draw",
      description: "Open drawing canvas (sketch & insert)",
      icon: "✎",
      category: "media",
      command: async (...args: any[]) => {
        try {
          // Normalize calling conventions (editor, helpers) OR ({ editor, helpers, range, props })
          let editor: any = null;
          let helpers: any = null;
          if (args.length === 1 && args[0] && typeof args[0] === "object" && ("editor" in args[0] || "props" in args[0])) {
            const ctx = args[0];
            editor = ctx.editor ?? null;
            helpers = ctx.helpers ?? ctx.props?.helpers ?? null;
          } else {
            editor = args[0] ?? null;
            helpers = args[1] ?? null;
          }

          // Preferred: helpers.openOverlay (provided by SlashMenu effectiveHelpers)
          if (helpers?.openOverlay && typeof helpers.openOverlay === "function") {
            try {
              helpers.openOverlay("draw", { initialBackground: null });
            } catch (e) {
              console.warn("[Slash] helpers.openOverlay failed:", e);
            }
            return;
          }

          // Next preferred: global shim injected by TiptapEditor
          if (typeof window !== "undefined" && (window as any).__openDrawingOverlay) {
            try {
              (window as any).__openDrawingOverlay();
              return;
            } catch (e) {
              console.warn("[Slash] window.__openDrawingOverlay call failed:", e);
            }
          }

          // Legacy fallback: dispatch an event to keep backward compatibility
          try {
            window.dispatchEvent(
              new CustomEvent("slash:open-draw-overlay", { detail: { editorId: (editor as any)?.id ?? null } }),
            );
          } catch (e) {
            // swallow
          }
        } catch (err) {
          console.error("[Slash] Draw command error:", err);
        }
      },
      aliases: ["draw", "sketch", "sketchpad"],
    },

    {
      title: "Quote",
      description: "Capture a quote",
      icon: '"',
      category: "basic",
      command: (editor: Editor) => {
        editor.chain().focus().toggleBlockquote().run();
      },
      aliases: ["blockquote", "cite"],
    },
    {
      title: "Code Block",
      description: "Capture a code snippet",
      icon: "</>",
      category: "advanced",
      command: (editor: Editor) => {
        editor.chain().focus().toggleCodeBlock().run();
      },
      aliases: ["code", "codeblock", "pre"],
    },
    {
      title: "Divider",
      description: "Visually divide blocks",
      icon: "―",
      category: "structure",
      command: (editor: Editor) => {
        editor.chain().focus().setHorizontalRule().run();
      },
      aliases: ["hr", "horizontal", "line", "separator"],
    },
    {
      title: "Table",
      description: "Insert a table",
      icon: "⊞",
      category: "advanced",
      command: (editor: Editor) => {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
      aliases: ["grid"],
    },
  ];
}

export function filterCommands(commands: CommandItem[], query: string): CommandItem[] {
  if (!query) return commands;
  const normalizedQuery = query.toLowerCase().trim();
  return commands.filter((item) => {
    if (item.title.toLowerCase().includes(normalizedQuery)) return true;
    if (item.description.toLowerCase().includes(normalizedQuery)) return true;
    if (item.aliases?.some((alias) => alias.toLowerCase().includes(normalizedQuery))) return true;
    return false;
  });
}

export function groupCommands(commands: CommandItem[]): CommandGroup[] {
  const groups: Record<string, CommandItem[]> = {
    basic: [],
    advanced: [],
    media: [],
    structure: [],
  };
  commands.forEach((command) => {
    const category = command.category || "basic";
    if (!groups[category]) groups[category] = [];
    groups[category].push(command);
  });
  const result: CommandGroup[] = [];
  if (groups.basic.length > 0) result.push({ name: "Basic blocks", commands: groups.basic });
  if (groups.advanced.length > 0) result.push({ name: "Advanced", commands: groups.advanced });
  if (groups.structure.length > 0) result.push({ name: "Structure", commands: groups.structure });
  if (groups.media.length > 0) result.push({ name: "Media", commands: groups.media });
  return result;
}
