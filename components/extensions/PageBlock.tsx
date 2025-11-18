// components/extensions/PageBlock.ts
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import PageBlockView from "./PageBlockView";

export interface PageBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBlock: {
      insertPageBlock: (attrs: {
        docId: string;
        title?: string;
        workspaceId?: string;
      }) => ReturnType;
    };
  }
}

export const PageBlock = Node.create<PageBlockOptions>({
  name: "pageBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      docId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-doc-id"),
        renderHTML: (attrs) => ({ "data-doc-id": attrs.docId }),
      },
      title: {
        default: "Untitled",
        parseHTML: (el) => el.getAttribute("data-title") || "Untitled",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      workspaceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-workspace-id"),
        renderHTML: (attrs) => ({ "data-workspace-id": attrs.workspaceId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='page-block']" }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(
      { "data-type": "page-block" },
      HTMLAttributes,
    );
    const workspaceId = HTMLAttributes.workspaceId ?? "";
    const docId = HTMLAttributes.docId ?? "";
    const title = HTMLAttributes.title ?? "Untitled";

    // Fallback HTML rendering (for SSR or when React views aren't available)
    return [
      "div",
      attrs,
      [
        "a",
        {
          href: `/workspace/${workspaceId}/documents/${docId}`,
          contenteditable: "false",
          class: "page-block-link",
          style:
            "display:block;text-decoration:none;color:inherit;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-primary);",
        },
        [
          "div",
          {
            class: "page-block-title",
            style: "font-weight:600;font-size:14px;margin-bottom:4px;",
          },
          title,
        ],
        [
          "div",
          { class: "page-block-meta", style: "font-size:12px;color:#6b7280;" },
          "Page",
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBlockView);
  },

  addCommands() {
    return {
      insertPageBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
