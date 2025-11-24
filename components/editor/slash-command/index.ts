export { SlashCommand, createSlashCommandSuggestion, SlashCommandPluginKey } from "./slash-command-extension";
export { SlashMenu } from "./SlashMenu";
export type { SlashMenuProps, SlashMenuRef } from "./SlashMenu";
export { getSlashCommands, filterCommands, groupCommands } from "./types";
export type { CommandItem, CommandGroup, CommandAction } from "./types";

import type { CommandItem } from "./types";

export const DRAW_COMMAND_ID = "draw";

export function createDrawCommand(handler: (ctx?: { editor?: any; helpers?: any }) => void | Promise<void>): CommandItem {
  const cmd: CommandItem = {
    title: "Draw",
    description: "Open the drawing overlay (Instagram-style)",
    icon: "✎",
    category: "media",
    aliases: ["draw", "sketch", "sketchpad"],
    command: async (editor: any, helpers?: any) => {
      try {
        await handler({ editor, helpers });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("createDrawCommand handler error:", err);
      }
    },
  };

  return cmd;
}

export const DrawCommand: CommandItem = {
  title: "Draw",
  description: "Open the drawing overlay (Instagram-style)",
  icon: "✎",
  category: "media",
  aliases: ["draw", "sketch", "sketchpad"],
  command: async (...args: any[]) => {
    try {
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

      if (helpers?.openOverlay && typeof helpers.openOverlay === "function") {
        try {
          helpers.openOverlay("draw", { initialBackground: null });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("DrawCommand: helpers.openOverlay error:", e);
        }
        return;
      }

      if (typeof window !== "undefined" && typeof (window as any).__openDrawingOverlay === "function") {
        try {
          (window as any).__openDrawingOverlay();
          return;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("DrawCommand: window.__openDrawingOverlay error:", e);
        }
      }

      try {
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(
            new CustomEvent("slash:open-draw-overlay", {
              detail: { editorId: editor?.id ?? null },
            }),
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("DrawCommand: fallback dispatch failed:", e);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("DrawCommand error:", err);
    }
  },
};

