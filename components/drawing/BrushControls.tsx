"use client";

import React, { useMemo } from "react";

type BrushMode = "draw" | "erase";
type BrushType = "round" | "marker" | "calligraphy" | "neon";

export interface BrushControlsProps {
  color: string;
  setColor: (c: string) => void;
  size: number;
  setSize: (n: number) => void;
  opacity?: number;
  setOpacity?: (n: number) => void;
  mode: BrushMode;
  setMode: (m: BrushMode) => void;
  brushType: BrushType;
  setBrushType: (t: BrushType) => void;

  // actions
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;

  // UI options
  showAdvanced?: boolean;
  setShowAdvanced?: (v: boolean) => void;

  className?: string;
}

/**
 * BrushControls
 *
 * Small, self-contained brush controls UI used by DrawingOverlay.
 *
 * - palette of quick colors
 * - "advanced" color chooser (native <input type="color">)
 * - brush size slider + presets
 * - brush type selector (round / marker / calligraphy / neon)
 * - opacity slider (optional)
 * - mode toggle (draw / eraser)
 * - undo / redo / clear actions
 *
 * This component uses Tailwind classes (project already uses Tailwind).
 * It exposes callbacks to parent (DrawingOverlay) via props.
 */
export default function BrushControls({
  color,
  setColor,
  size,
  setSize,
  opacity = 1,
  setOpacity,
  mode,
  setMode,
  brushType,
  setBrushType,
  onUndo,
  onRedo,
  onClear,
  showAdvanced = false,
  setShowAdvanced,
  className,
}: BrushControlsProps) {
  // sensible defaults that match DrawingOverlay defaults
  const QUICK_COLORS = useMemo(
    () => [
      "#000000",
      "#ffffff",
      "#ff3b30",
      "#ff9500",
      "#ffd60a",
      "#34c759",
      "#0a84ff",
      "#5856d6",
      "#ff2d55",
    ],
    []
  );

  const SIZE_PRESETS = useMemo(() => [2, 4, 8, 12, 20, 40], []);

  const BRUSH_TYPES: { id: BrushType; label: string; hint?: string }[] = [
    { id: "round", label: "Round", hint: "Smooth round stroke" },
    { id: "marker", label: "Marker", hint: "Slight texture, fuller fill" },
    { id: "calligraphy", label: "Calligraphy", hint: "Angled, variable width" },
    { id: "neon", label: "Neon", hint: "Glow/soft outer blur effect" },
  ];

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded bg-white/90 text-sm ${className ?? ""}`}
      role="toolbar"
      aria-label="Brush controls"
    >
      {/* Brush / Eraser Toggle */}
      <div className="flex items-center gap-1" title="Tool">
        <button
          onClick={() => setMode("draw")}
          aria-pressed={mode === "draw"}
          className={`px-2 py-1 rounded ${mode === "draw" ? "ring-2 ring-offset-1" : "bg-transparent"}`}
          title="Brush"
        >
          ✎
        </button>
        <button
          onClick={() => setMode("erase")}
          aria-pressed={mode === "erase"}
          className={`px-2 py-1 rounded ${mode === "erase" ? "ring-2 ring-offset-1" : "bg-transparent"}`}
          title="Eraser"
        >
          ⌫
        </button>
      </div>

      {/* Color palette */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {QUICK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Select color ${c}`}
              title={c}
              className={`w-7 h-7 rounded-full border ${c === "#ffffff" ? "border-gray-300" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>

        {/* advanced color toggle */}
        <div className="flex items-center gap-1">
          {setShowAdvanced ? (
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-2 py-1 rounded bg-white/80"
              title="More colors"
              aria-pressed={showAdvanced}
            >
              •••
            </button>
          ) : null}

          {/* simple preview & native color input (useful fallback) */}
          <div
            className="w-7 h-7 rounded-full border flex items-center justify-center"
            title={`Current color: ${color}`}
            style={{ background: color }}
            aria-hidden
          />
          {showAdvanced && (
            <input
              aria-label="Choose color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 p-0 border-0"
            />
          )}
        </div>
      </div>

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              title={`${s}px`}
              className={`flex items-center justify-center w-8 h-6 rounded ${s === size ? "ring-2 ring-offset-1" : "bg-transparent"}`}
            >
              {/* preview circle */}
              <span
                aria-hidden
                className="block rounded-full"
                style={{
                  width: Math.max(2, Math.round((s / 2))) + "px",
                  height: Math.max(2, Math.round((s / 2))) + "px",
                  background: color,
                }}
              />
            </button>
          ))}
        </div>

        {/* size slider */}
        <div className="flex items-center gap-2">
          <input
            aria-label="Brush size"
            type="range"
            min={1}
            max={80}
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            className="w-24"
          />
          <div className="w-10 text-xs text-center">{size}px</div>
        </div>
      </div>

      {/* opacity slider (optional) */}
      {typeof setOpacity === "function" && (
        <div className="flex items-center gap-2" title="Opacity">
          <input
            aria-label="Brush opacity"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="w-20"
          />
          <div className="w-8 text-xs text-center">{Math.round(opacity * 100)}%</div>
        </div>
      )}

      {/* Brush types */}
      <div className="flex items-center gap-1" title="Brush style">
        {BRUSH_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setBrushType(t.id)}
            title={t.hint ?? t.label}
            aria-pressed={brushType === t.id}
            className={`px-2 py-1 rounded ${brushType === t.id ? "ring-2 ring-offset-1" : ""}`}
          >
            {t.label[0]}
          </button>
        ))}
      </div>

      {/* undo/redo/clear */}
      <div className="flex items-center gap-1 ml-1" title="History">
        <button
          onClick={() => onUndo?.()}
          className="px-2 py-1 rounded bg-white/80"
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          onClick={() => onRedo?.()}
          className="px-2 py-1 rounded bg-white/80"
          aria-label="Redo"
        >
          ↷
        </button>
        <button
          onClick={() => onClear?.()}
          className="px-2 py-1 rounded bg-white/80"
          aria-label="Clear"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
