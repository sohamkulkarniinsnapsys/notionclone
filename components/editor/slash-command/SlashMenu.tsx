"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
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

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Execute selected command: ensure selection is set and the slash text removed
  const executeCommand = (item: CommandItem) => {
    // Ensure caret is at the start position, remove the slash + query, then run the command
    // 1) set selection to start, 2) delete range, 3) focus, 4) run command
    try {
      // Make sure we run the deletion / selection in one chain
      editor.chain().focus().setTextSelection(range.from).deleteRange({ from: range.from, to: range.to }).run();
    } catch (err) {
      // Fallback: try separate commands
      try {
        editor.commands.setTextSelection(range.from);
        editor.commands.deleteRange({ from: range.from, to: range.to });
        editor.commands.focus();
      } catch {}
    }

    // Now run the command; commands should assume editor is focused at insertion point
    item.command(editor);
    // Ensure the editor is focused after the action
    try {
      editor.commands.focus();
    } catch {}
  };

  const handleKeyDown = (event: KeyboardEvent): boolean => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? filteredCommands.length - 1 : prev - 1));
      return true;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev >= filteredCommands.length - 1 ? 0 : prev + 1));
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
      return true;
    }

    return false;
  };

  useImperativeHandle(ref, () => ({ onKeyDown: handleKeyDown }));

  useEffect(() => {
    const el = document.getElementById(`slash-command-${selectedIndex}`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (filteredCommands.length === 0) {
    return (
      <div className="slash-menu" role="dialog" aria-label="Slash command menu">
        <div className="slash-menu-empty">
          <p>No results for "{query}"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="slash-menu" role="dialog" aria-label="Slash command menu">
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
