"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Editor } from "@tiptap/core";
import { CommandItem, filterCommands, getSlashCommands } from "./types";

export interface SlashMenuProps {
  editor: Editor;
  query: string;
  range: { from: number; to: number };
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(({ editor, query, range }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const allCommands = getSlashCommands();
  const filteredCommands = filterCommands(allCommands, query);

  // Use a ref to the container so we can control scroll without relying on document.getElementById
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Hidden file input ref for upload-from-files command
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset selection and scroll position when the query changes
  useEffect(() => {
    setSelectedIndex(0);

    // Reset scroll to top when query changes so the user sees the first item
    try {
      if (menuContainerRef.current) {
        menuContainerRef.current.scrollTop = 0;
      }
    } catch (e) {
      // ignore scrolling errors
    }
  }, [query]);

  // Listen for global event to open the file picker (fired by the command)
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        // open native file picker
        fileInputRef.current?.click();
      } catch (err) {
        console.warn("[SlashMenu] failed to open file input:", err);
      }
    };

    window.addEventListener("slash-upload-image-request", handler);
    return () => window.removeEventListener("slash-upload-image-request", handler);
  }, []);

  // Execute selected command: ensure selection is set and the slash text removed
  const executeCommand = (item: CommandItem) => {
      console.log("[SlashMenu] executeCommand called for:", item.title);
    // Ensure caret is at the start position, remove the slash + query, then run the command
    try {
      // Try to run deletion / selection in a single chained command
      editor.chain().focus().setTextSelection(range.from).deleteRange({ from: range.from, to: range.to }).run();
    } catch (err) {
      console.warn("[SlashMenu] command execution failed:", err);
      // Fallback: try separate commands if chain() isn't available
      try {
        editor.commands.setTextSelection(range.from);
        editor.commands.deleteRange({ from: range.from, to: range.to });
        editor.commands.focus();
      } catch {}
    }

    // Now run the command; commands should assume editor is focused at insertion point
    try {
      item.command(editor);
    } catch (e) {
      console.warn("[SlashMenu] command execution failed:", e);
    }

    // Ensure the editor is focused after the action
    try {
      editor.commands.focus();
    } catch {}
  };

  // Upload handler: invoked when the hidden input changes
  const onFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      // Basic size validation (optional)
      const MAX_BYTES = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024); // 25 MB default
      if (file.size > MAX_BYTES) {
        console.warn("[SlashMenu] selected file too large", file.size);
        // Optionally show UI feedback / toast here
        return;
      }

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[SlashMenu] upload failed", res.status, text);
        return;
      }

      const data = await res.json().catch(() => null);
      const url: string | undefined = data?.url;
      if (!url) {
        console.error("[SlashMenu] upload response missing url", data);
        return;
      }

      // Insert image into editor at current selection
      try {
        // Ensure editor is focused and then insert
        editor.chain().focus().setImage({ src: url }).run();
        // Focus editor after insertion
        editor.commands.focus();
      } catch (err) {
        console.error("[SlashMenu] failed to insert image into editor", err);
      }
    } catch (err) {
      console.error("[SlashMenu] upload error", err);
    } finally {
      // Reset input so the same file can be selected again later
      if (ev.currentTarget) ev.currentTarget.value = "";
    }
  };

  // Handle keyboard navigation. IMPORTANT: Return `false` for modifier-key combos
  // so that global handlers (e.g. Ctrl/Cmd+S) can still run.
  const handleKeyDown = (event: KeyboardEvent): boolean => {
    // If the user is holding any of the major modifier keys, do not intercept.
    // This allows global shortcuts (Cmd/Ctrl/Alt + key) to function.
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return false;
    }

    // Allow Shift to be used (e.g., Shift+Enter), so don't early-return on shiftKey.

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev <= 0 ? filteredCommands.length - 1 : prev - 1) : 0));
      return true;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev >= filteredCommands.length - 1 ? 0 : prev + 1) : 0));
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
      }
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      // Let the caller decide how to close the menu (we only claim the key)
      return true;
    }

    return false;
  };

  useImperativeHandle(ref, () => ({ onKeyDown: handleKeyDown }));

  // Scroll selected item into view when selectedIndex changes (uses the container ref)
  useEffect(() => {
    try {
      const container = menuContainerRef.current;
      if (!container) return;

      const el = container.querySelector<HTMLElement>(`#slash-command-${selectedIndex}`);
      if (el) {
        // use nearest block to avoid jumping
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } catch (e) {
      // ignore scroll errors
    }
  }, [selectedIndex]);

  if (filteredCommands.length === 0) {
    return (
      <div className="slash-menu" role="dialog" aria-label="Slash command menu" ref={menuContainerRef}>
        {/* Hidden file input is always present (so event can open it even if menu is empty) */}
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

        <div className="slash-menu-empty">
          <p>No results for "{query}"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="slash-menu" role="dialog" aria-label="Slash command menu" ref={menuContainerRef}>
      {/* Hidden file input (used by "Upload image from files") */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

      <div className="slash-menu-header">
        <span className="slash-menu-title">{query ? `Search: "${query}"` : "Select a block"}</span>
      </div>

      <div className="slash-menu-items" role="list">
        {filteredCommands.map((item, index) => (
          <button
            key={`${item.title}-${index}`}
            id={`slash-command-${index}`}
            type="button"
            role="listitem"
            className={`slash-menu-item ${index === selectedIndex ? "selected" : ""}`}
            onClick={() => executeCommand(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="slash-menu-item-icon">{item.icon}</div>
            <div className="slash-menu-item-content">
              <div className="slash-menu-item-title">{item.title}</div>
              <div className="slash-menu-item-description">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});

SlashMenu.displayName = "SlashMenu";
export default SlashMenu;
