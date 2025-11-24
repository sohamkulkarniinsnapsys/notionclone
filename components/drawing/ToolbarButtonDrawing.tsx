"use client";

/**
 * components/drawing/ToolbarButtonDrawing.tsx
 *
 * Small, accessible toolbar button that opens the Drawing overlay.
 * - Designed to plug into your editor toolbar (Tiptap toolbar or app-level toolbar)
 * - Lightweight, no external icon file required (SVG inlined). If you prefer to use a
 *   project asset instead, see the TOOL_ICON_ASSET_URL constant below which contains the
 *   local path to the uploaded project archive (your tooling will transform it to a usable URL).
 *
 * Props:
 *  - onClick?: () => void          // open the drawing overlay
 *  - title?: string                // tooltip (defaults to "Draw")
 *  - className?: string            // additional classes for placement in toolbar
 *  - size?: number                 // icon size in px (default 18)
 *
 * Usage:
 *  <ToolbarButtonDrawing onClick={() => setIsDrawingOpen(true)} />
 *
 * Accessibility:
 *  - keyboard focusable
 *  - aria-label provided
 *
 * Notes about asset path:
 *  - TOOL_ICON_ASSET_URL is provided as the local path to the uploaded zip in this session:
 *      "/mnt/data/notionclonelatest.zip"
 *  - Your build/tooling can replace or transform that into a real asset URL if you want to
 *    reference an external SVG/PNG instead of the inlined SVG below.
 */

import React from "react";

export const TOOL_ICON_ASSET_URL = "/mnt/data/notionclonelatest.zip"; // developer/tooling: transform to actual URL if needed

type Props = {
  onClick?: () => void;
  title?: string;
  className?: string;
  size?: number;
};

export default function ToolbarButtonDrawing({
  onClick,
  title = "Draw",
  className = "",
  size = 18,
}: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      title={title}
      aria-label={title}
      className={
        "inline-flex items-center justify-center p-1 rounded hover:bg-[var(--color-bg-hover)] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--color-accent)] " +
        className
      }
      style={{ width: size + 10, height: size + 10 }}
    >
      {/* Inline pen/brush SVG icon (small, crisp at typical toolbar sizes) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {/* pen nib */}
        <path d="M12 19l7-7 1 1-7 7-1-1z" />
        <path d="M16.5 7.5l.5-1.5L18 4l-1.5.5-1.5.5" />
        <path d="M3 21l4-1 9-9 1-4-4 1-9 9L3 21z" opacity="0.98" />
      </svg>
    </button>
  );
}
