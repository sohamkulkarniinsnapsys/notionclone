// components/drawing/DrawingStyles.ts
//
// Styles and small helpers for the Drawing UI used in the Notion-clone project.
// - Primary strategy: Tailwind-first (exported className constants).
// - Secondary: small raw CSS string for things that are cumbersome with Tailwind
//   (backdrop blur stacking, custom controls, mobile touch-target tweaks).
// - Also export a small helper `injectDrawingStyles()` that will inject the raw CSS
//   into document.head if you prefer to use it instead of or in addition to Tailwind.
//
// IMPORTANT: Your project already uses Tailwind for most layout. Use the class constants
// when rendering components (preferred). The raw CSS is available for edge cases.
//
// Developer note: You uploaded the project archive during this session. The path to
// that uploaded file is exported as `UPLOADED_ARCHIVE_PATH` (useful for CI/tooling).
// The tooling that consumes this file will transform that local path into an accessible URL.
export const UPLOADED_ARCHIVE_PATH = "/mnt/data/notionclonelatest.zip";

/* -------------------------
   Tailwind-first class names
   -------------------------
   These constants make it easy to keep class names consistent across components.
   Use like: <div className={DrawingStyles.overlay}>... </div>
*/
const DrawingStyles = {
  // Full-screen overlay that dims and blurs the background (high z-index)
  overlay:
    // fixed full screen + flex column + subtle dark translucent background + blur
    "fixed inset-0 z-[9999] flex flex-col bg-black/40 backdrop-blur-sm",

  // Top toolbar container (transparent background to show blur)
  topToolbar:
    "flex items-center justify-between gap-3 px-3 py-2 pointer-events-auto",

  // Compact toolbar group containing tool buttons
  toolbarGroup: "flex items-center gap-2 bg-white/90 rounded-md p-1",

  // Generic icon/button used in toolbar
  toolbarButton:
    "inline-flex items-center justify-center p-2 rounded hover:bg-black/5 active:scale-[0.99] transition",

  // Selected/active toolbar button ring
  toolbarButtonActive: "ring-2 ring-offset-1 ring-indigo-400",

  // Quick color swatch button
  colorSwatch:
    "w-7 h-7 rounded-full border border-gray-200 shadow-sm inline-block",

  // Size slider container
  sizeControl: "flex items-center gap-2",

  // Bottom mini toolbar
  bottomBar:
    "flex items-center justify-between px-3 py-2 pointer-events-auto text-sm text-white/90",

  // Canvas container: takes remaining height and positions canvas absolutely
  canvasContainer: "relative flex-1 w-full h-full",

  // Canvas element style (use as inline style or tailwind wrapper)
  canvas:
    "block w-full h-full touch-none outline-none select-none",

  // Default floating panel for element-specific controls (text/sticker)
  floatingPanel:
    "absolute z-50 pointer-events-auto bg-white/95 rounded-md p-2 shadow",

  // Small floating toolbar buttons
  smallBtn: "p-1 rounded bg-white/90 hover:bg-white",

  // Editing textarea styles (for in-place text editing)
  editingTextarea:
    "min-w-[80px] min-h-[28px] p-1 rounded border bg-white/95 outline-none resize both",

  // Mobile-specific touch target helpers
  mobileTouchTarget: "touch-manipulation",

  // Handles for rotate/scale
  handleBase:
    "w-3.5 h-3.5 rounded-sm bg-white border border-gray-300 shadow-sm flex items-center justify-center text-xs",
} as const;

/* -------------------------
   Raw CSS (fallback / helpers)
   -------------------------
   Add this CSS to your global stylesheet or inject it at runtime (injectDrawingStyles).
   The CSS here complements Tailwind for features that are awkward to express inline,
   such as layering/backdrop blur and pointer-event scoping.
*/
export const rawDrawingCSS = `
/* Drawing overlay stacking + backdrop */
.drawing-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.4);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

/* Ensure the overlay traps focus & pointer events are scoped to interactive elements */
.drawing-overlay * {
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}

/* Top toolbar translucent container */
.drawing-top-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  pointer-events: auto;
}

/* Default toolbar group (white translucent background) */
.drawing-toolbar-group {
  display: flex;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(255,255,255,0.92);
  align-items: center;
}

/* Color swatch */
.drawing-color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,0.08);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  display: inline-block;
}

/* Canvas wrapper ensures full bleed and prevents overscroll on mobile */
.drawing-canvas-wrapper {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none; /* important for pointer events drawing */
}

/* Canvas element should behave responsively */
.drawing-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  image-rendering: optimizeQuality;
}

/* Floating element handles (rotate/scale) */
.drawing-handle {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  user-select: none;
  touch-action: none;
}

/* Selected element outline */
.drawing-selected-outline {
  position: absolute;
  border: 1px dashed rgba(0,0,0,0.25);
  pointer-events: none;
  border-radius: 4px;
}

/* Small floating toolbar shown when an item is selected */
.drawing-element-toolbar {
  position: absolute;
  display: flex;
  gap: 6px;
  background: rgba(255,255,255,0.95);
  padding: 6px;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  z-index: 10050;
  pointer-events: auto;
}

/* Editing text textarea overlay */
.drawing-text-edit {
  min-width: 80px;
  min-height: 28px;
  resize: both;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.12);
  background: rgba(255,255,255,0.96);
  outline: none;
}

/* Bottom mini bar */
.drawing-bottom-bar {
  pointer-events: auto;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Make touch targets comfortable on mobile */
.drawing-touch-target {
  min-height: 44px;
  min-width: 44px;
  touch-action: manipulation;
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .drawing-toolbar-group {
    gap: 6px;
    padding: 6px;
  }
  .drawing-color-swatch { width: 24px; height: 24px;}
  .drawing-handle { width: 18px; height: 18px; font-size: 11px; }
  .drawing-element-toolbar { padding: 4px; gap: 4px; }
}
`;

/* -------------------------
   Helper: inject raw CSS at runtime
   ------------------------- */
let _injected = false;

/** Injects rawDrawingCSS into document.head once (no-op on server) */
export function injectDrawingStyles(): void {
  if (typeof document === "undefined") return;
  if (_injected) return;
  const s = document.createElement("style");
  s.setAttribute("data-drawing-styles", "true");
  s.appendChild(document.createTextNode(rawDrawingCSS));
  document.head.appendChild(s);
  _injected = true;
}

/* -------------------------
   Exports
   ------------------------- */
export default DrawingStyles;
