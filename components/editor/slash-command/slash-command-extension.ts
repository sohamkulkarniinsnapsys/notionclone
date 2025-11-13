/**
 * Slash Command Extension for Tiptap
 * Triggers a suggestion menu when user types "/"
 */

import { Extension } from "@tiptap/core";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { SlashMenu, SlashMenuRef } from "./SlashMenu";
import { getSlashCommands, filterCommands } from "./types";

export const SlashCommandPluginKey = new PluginKey("slashCommand");

export interface SlashCommandOptions {
  suggestion: Omit<SuggestionOptions, "editor">;
}

/**
 * Slash Command Extension
 * Provides a "/" trigger to show block insertion menu
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: SlashCommandPluginKey,
        // The default command the suggestion will call when the suggestion itself
        // is activated by the underlying suggestion system (we also handle selection
        // inside the React menu, so this is defensive).
        command: ({ editor, range, props }) => {
          // props is whatever createSlashCommandSuggestion passed into `render` props.
          // If props.item exists and has a command, call it.
          if (props && (props as any).item && typeof (props as any).item.command === "function") {
            const item = (props as any).item;
            // delete the slash
            editor.chain().focus().deleteRange(range).run();
            // run the item's command
            item.command(editor);
          }
        },
        allow: ({ state, range }) => {
          // Only allow at start of line or after whitespace
          const $from = state.doc.resolve(range.from);
          const textBefore = $from.parent.textBetween(
            Math.max(0, $from.parentOffset - 1),
            $from.parentOffset,
            undefined,
            "\ufffc"
          );

          // Allow if at start of line or after space
          return textBefore === "" || textBefore === " ";
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

/**
 * Suggestion configuration for rendering the slash menu
 *
 * Important: we return actual command items in `items` so the menu and the suggestion
 * layer are in sync. The react component receives `items` as props and uses them.
 */
export function createSlashCommandSuggestion(): Partial<SuggestionOptions> {
  return {
    items: ({ query }) => {
      // Build the full list and filter on query so the suggestion layer passes
      // the same list to the renderer that the UI will use.
      const all = getSlashCommands();
      return filterCommands(all, query);
    },

    render: () => {
      let component: ReactRenderer<SlashMenuRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props) => {
          if (!props.clientRect) {
            return;
          }

          component = new ReactRenderer(SlashMenu, {
            props: {
              editor: props.editor,
              query: props.query,
              range: props.range,
              items: props.items ?? [], // pass the suggestion items straight to the component
            },
            editor: props.editor,
          });

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            maxWidth: 400,
            animation: "shift-away",
            theme: "slash-menu",
            arrow: false,
            offset: [0, 8],
            zIndex: 9999,
          });
        },

        onUpdate(props) {
          if (!component || !props.clientRect) {
            return;
          }

          component.updateProps({
            editor: props.editor,
            query: props.query,
            range: props.range,
            items: props.items ?? [],
          });

          if (popup && popup[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect as any,
            });
          }
        },

        onKeyDown(props) {
          // let the menu react to keys; it will return true if handled
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }

          if (!component?.ref) {
            return false;
          }

          return component.ref.onKeyDown(props.event);
        },

        onExit() {
          if (popup && popup[0]) {
            popup[0].destroy();
          }

          if (component) {
            component.destroy();
          }

          popup = null;
          component = null;
        },
      };
    },
  };
}
