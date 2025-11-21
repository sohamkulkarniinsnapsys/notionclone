/**
 * Slash Command Types and Configuration
 * Defines command items and their properties for the slash menu
 */

import { Editor } from "@tiptap/core";

export interface CommandItem {
  title: string;
  description: string;
  icon: string | React.ReactNode;
  command: (editor: Editor) => void;
  aliases?: string[];
  category?: "basic" | "advanced" | "media" | "structure";
}

export interface CommandGroup {
  name: string;
  commands: CommandItem[];
}

/**
 * Get all available slash commands
 */
export function getSlashCommands(): CommandItem[] {
  return [
    // Text blocks
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
    // Page
    {
      title: "Page",
      description: "Create a new page as a block",
      icon: "📄",
      category: "structure",
      aliases: ["page", "link page", "subpage"],
      command: async (editor) => {
        try {
          // Prefer global signals if available (set in the page component)
          const workspaceFromWindow = (window as any).__CURRENT_WORKSPACE_ID ?? null;
          const parentFromWindow = (window as any).__CURRENT_DOCUMENT_ID ?? null;

          // Fallback to guessing from path if globals not set
          const guessWorkspace = (() => {
            try {
              const m = window.location.pathname.match(/\/workspace\/([^/]+)/);
              return m ? m[1] : null;
            } catch {
              return null;
            }
          })();

          const workspaceId = workspaceFromWindow || guessWorkspace || "personal";
          const parentId = parentFromWindow ?? null; // null means top-level

          const res = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              title: "Untitled",
              parentId, // <- IMPORTANT: include parentId so DB gets linked
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(
              "Failed to create document for page block: ",
              res.status,
              text,
            );
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

          // Insert PageBlock node with the document details
          editor
            .chain()
            .focus()
            .insertPageBlock({
              docId: doc.id,
              title: doc.title || "Untitled",
              workspaceId: doc.workspaceId || workspaceId,
            })
            .run();
        } catch (err) {
          console.error("Error creating page in slash command:", err);
          alert("Error creating page. See console for details.");
        }
      },
    },

    // Lists
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

    // Image
    {
      title: "Image",
      description: "Upload an image from your files",
      icon: "🖼️",
      category: "media",
      command: (editor) => {
        try {
          console.log("[Slash] Image command invoked");
          // Create a hidden file input and trigger it — must be triggered in response to a user action
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.style.display = "none";
          // Ensure input is attached to DOM for some browsers to allow .click()
          document.body.appendChild(input);

          input.onchange = async () => {
            const file = input.files?.[0];
            // Cleanup DOM element early
            setTimeout(() => {
              try {
                input.remove();
              } catch {}
            }, 1000);

            if (!file) {
              console.log("[Slash] No file selected");
              return;
            }

            console.log("[Slash] Selected file:", file.name, file.size, file.type);

            // Upload to same-origin API route /api/uploads
            try {
              const fd = new FormData();
              fd.append("file", file, file.name);

              const res = await fetch("/api/uploads", {
                method: "POST",
                body: fd,
              });

              if (!res.ok) {
                const txt = await res.text().catch(() => "");
                console.error("[Slash] upload failed:", res.status, txt);
                alert("Image upload failed");
                return;
              }

              const json = await res.json().catch(() => null);
              const url = json?.url ?? json?.data?.url; // accept common shapes

              if (!url) {
                console.error("[Slash] upload returned no url:", json);
                alert("Upload succeeded but no image URL returned");
                return;
              }

              console.log("[Slash] upload succeeded, url:", url);

              // Insert image in TipTap. Use any cast if your editor types don't include setImage.
              try {
                (editor as any).chain().focus().setImage({ src: url }).run();
              } catch (err) {
                console.error("[Slash] failed to insert image into editor:", err);
                alert("Image uploaded but could not be inserted into the document");
              }
            } catch (err) {
              console.error("[Slash] upload error:", err);
              alert("Image upload error (see console)");
            }
          };

          // Trigger file picker (this is a user-initiated event because the slash item click/Enter triggered it)
          input.click();
        } catch (err) {
          console.error("[Slash] Image command top-level error:", err);
        }
      },
      aliases: ["image", "img", "picture", "photo"],
    },


    // Quotes and code
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
    // Structure
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
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
      aliases: ["grid"],
    },
  ];
}

/**
 * Filter commands based on search query
 */
export function filterCommands(
  commands: CommandItem[],
  query: string,
): CommandItem[] {
  if (!query) return commands;

  const normalizedQuery = query.toLowerCase().trim();

  return commands.filter((item) => {
    // Match title
    if (item.title.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    // Match description
    if (item.description.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    // Match aliases
    if (
      item.aliases?.some((alias) =>
        alias.toLowerCase().includes(normalizedQuery),
      )
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Group commands by category
 */
export function groupCommands(commands: CommandItem[]): CommandGroup[] {
  const groups: Record<string, CommandItem[]> = {
    basic: [],
    advanced: [],
    media: [],
    structure: [],
  };

  commands.forEach((command) => {
    const category = command.category || "basic";
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(command);
  });

  const result: CommandGroup[] = [];

  if (groups.basic.length > 0) {
    result.push({ name: "Basic blocks", commands: groups.basic });
  }
  if (groups.advanced.length > 0) {
    result.push({ name: "Advanced", commands: groups.advanced });
  }
  if (groups.structure.length > 0) {
    result.push({ name: "Structure", commands: groups.structure });
  }
  if (groups.media.length > 0) {
    result.push({ name: "Media", commands: groups.media });
  }

  return result;
}
