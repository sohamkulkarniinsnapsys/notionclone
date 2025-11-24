"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  CSSProperties,
} from "react";
import { createPortal } from "react-dom";

type Point = { x: number; y: number; pressure?: number };

type Stroke = {
  id: string;
  points: Point[];
  color: string;
  size: number;
  mode: "draw" | "erase";
  opacity?: number;
};

type TextItem = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation?: number;
};

export interface DrawingOverlayProps {
  visible: boolean;
  // If provided, overlay will be constrained to this element (portal into it).
  // Useful for "instagram-like" in-editor overlay (parent must have position:relative).
  attachTo?: HTMLElement | null;
  initialBackground?: string | null;
  width?: number;
  height?: number;
  // positionMode:
  //  - "fixed": overlay covers viewport (default)
  //  - "absolute": overlay is absolutely positioned within parent container (use with parent: position:relative)
  positionMode?: "fixed" | "absolute";
  onComplete: (blob: Blob, meta: Record<string, any>) => Promise<void> | void;
  onCancel: () => void;
}

const DEFAULT_COLORS = [
  "#000000",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffd60a",
  "#34c759",
  "#0a84ff",
  "#5856d6",
  "#ff2d55",
];

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function drawStrokeOnCtx(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  scale = 1
) {
  if (!stroke.points.length) return;
  ctx.save();

  if (stroke.mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color || "#000";
    ctx.globalAlpha = stroke.opacity ?? 1;
  }
  ctx.lineWidth = stroke.size * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const pts = stroke.points;
  if (pts.length === 1) {
    const p = pts[0];
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, (stroke.size / 2) * scale, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(
        pts[i].x * scale,
        pts[i].y * scale,
        midX * scale,
        midY * scale
      );
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x * scale, last.y * scale);
    ctx.stroke();
    ctx.closePath();
  }
  ctx.restore();
}

async function exportToBlob(
  width: number,
  height: number,
  bgUrl: string | null,
  strokes: Stroke[],
  texts: TextItem[]
): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  if (bgUrl) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = bgUrl;
    });
  }

  for (const s of strokes) drawStrokeOnCtx(ctx, s, 1);

  for (const t of texts) {
    ctx.save();
    ctx.font = `${t.fontSize}px sans-serif`;
    ctx.fillStyle = t.color;
    ctx.textBaseline = "top";
    if (t.rotation) {
      ctx.translate(t.x, t.y);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.fillText(t.text, 0, 0);
    } else {
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  return new Promise<Blob>((resolve) => {
    c.toBlob((b) => {
      if (!b) {
        const data = c.toDataURL("image/png");
        const arr = data.split(",");
        const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/png";
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        resolve(new Blob([u8arr], { type: mime }));
      } else resolve(b);
    }, "image/png");
  });
}

export default function DrawingOverlay(props: DrawingOverlayProps) {
  const {
    visible,
    // `attachTo` kept for backward compatibility but not preferred.
    attachTo = null,
    initialBackground = null,
    width = 0,
    height = 0,
    // positionMode controls where this overlay renders:
    // - "absolute" -> render inline (component must be rendered inside a container with position: relative)
    // - "fixed"    -> portal to document.body and cover viewport
    positionMode = "absolute",
    onComplete,
    onCancel,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>(() => {
  if (width && height) return { w: width, h: height };
  return { w: typeof window !== "undefined" ? window.innerWidth : 800, h: typeof window !== "undefined" ? window.innerHeight : 600 };
});

  const [bgUrl, setBgUrl] = useState<string | null>(initialBackground ?? null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);

  const [color, setColor] = useState<string>("#000000");
  const [size, setSize] = useState<number>(6);
  const [mode, setMode] = useState<"draw" | "erase">("draw");
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [editingText, setEditingText] = useState<TextItem | null>(null);
  const [textModeActive, setTextModeActive] = useState(false);
  const [showAdvancedColors, setShowAdvancedColors] = useState(false);

  // keep buffer sized to canvas
  useEffect(() => {
    const buf = document.createElement("canvas");
    buf.width = canvasSize.w;
    buf.height = canvasSize.h;
    bufferRef.current = buf;

    const main = canvasRef.current;
    if (main) {
      main.width = canvasSize.w;
      main.height = canvasSize.h;
      main.style.width = `${canvasSize.w}px`;
      main.style.height = `${canvasSize.h}px`;
    }
    // redraw into buffer initially
    redrawAllToBuffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize.w, canvasSize.h]);

  // if attachTo is present, observe size changes and update canvas size
    // Observe the overlay container (preferred) or fallback to attachTo if explicitly provided.
  useEffect(() => {
    const measure = () => {
      const target = containerRef.current ?? attachTo ?? null;
      if (!target) return;
      const r = target.getBoundingClientRect();
      setCanvasSize({ w: Math.max(100, Math.floor(r.width)), h: Math.max(100, Math.floor(r.height)) });
    };

    // Initial measure
    measure();

    const targetForObserver = containerRef.current ?? attachTo ?? null;
    if (!targetForObserver) return;

    const ro = new ResizeObserver(measure);
    try {
      ro.observe(targetForObserver);
      resizeObserverRef.current = ro;
    } catch {
      // ignore in envs where observe fails
    }

    return () => {
      try { ro.disconnect(); } catch {}
      resizeObserverRef.current = null;
    };
  }, [attachTo]);


  // redraw buffer and blit to canvas
  const blitBufferToMain = useCallback(() => {
    const main = canvasRef.current;
    const buf = bufferRef.current;
    if (!main || !buf) return;
    const ctx = main.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, main.width, main.height);
    ctx.drawImage(buf, 0, 0, main.width, main.height);

    if (currentStrokeRef.current) {
      drawStrokeOnCtx(ctx, currentStrokeRef.current, 1);
    }
  }, []);

  const redrawAllToBuffer = useCallback(() => {
    const buf = bufferRef.current;
    if (!buf) return;
    const ctx = buf.getContext("2d")!;
    ctx.clearRect(0, 0, buf.width, buf.height);

    if (bgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, buf.width, buf.height);
        for (const s of strokes) drawStrokeOnCtx(ctx, s, 1);
        for (const t of texts) {
          ctx.save();
          ctx.font = `${t.fontSize}px sans-serif`;
          ctx.fillStyle = t.color;
          ctx.textBaseline = "top";
          if (t.rotation) {
            ctx.translate(t.x, t.y);
            ctx.rotate((t.rotation * Math.PI) / 180);
            ctx.fillText(t.text, 0, 0);
          } else {
            ctx.fillText(t.text, t.x, t.y);
          }
          ctx.restore();
        }
        blitBufferToMain();
      };
      img.onerror = () => {
        for (const s of strokes) drawStrokeOnCtx(ctx, s, 1);
        for (const t of texts) {
          ctx.save();
          ctx.font = `${t.fontSize}px sans-serif`;
          ctx.fillStyle = t.color;
          ctx.fillText(t.text, t.x, t.y);
          ctx.restore();
        }
        blitBufferToMain();
      };
      img.src = bgUrl;
    } else {
      for (const s of strokes) drawStrokeOnCtx(ctx, s, 1);
      for (const t of texts) {
        ctx.save();
        ctx.font = `${t.fontSize}px sans-serif`;
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      }
      blitBufferToMain();
    }
  }, [bgUrl, strokes, texts, blitBufferToMain]);

  useEffect(() => {
    redrawAllToBuffer();
  }, [strokes, texts, redrawAllToBuffer]);

  // pointer handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isPointerDown = false;

    const getPointerPos = (ev: PointerEvent): Point => {
      const c = canvasRef.current!;
      const rect = c.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) * (c.width / rect.width),
        y: (ev.clientY - rect.top) * (c.height / rect.height),
        pressure: (ev as any).pressure ?? 0.5,
      };
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (textModeActive) return;
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      isPointerDown = true;
      setRedoStack([]);
      const p = getPointerPos(ev);
      const stroke: Stroke = {
        id: uid("s_"),
        points: [p],
        color,
        size,
        mode,
        opacity: 1,
      };
      currentStrokeRef.current = stroke;
      blitBufferToMain();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!isPointerDown || !currentStrokeRef.current) return;
      const p = getPointerPos(ev);
      currentStrokeRef.current.points.push(p);
      blitBufferToMain();
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      const finished = currentStrokeRef.current;
      if (finished) {
        setStrokes((prev) => [...prev, finished]);
        currentStrokeRef.current = null;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [color, size, mode, textModeActive, blitBufferToMain]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!visible) return;
      if (ev.key === "Escape") onCancel();
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        handleUndo();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]); // eslint-disable-line

  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [last, ...r]);
      return prev.slice(0, prev.length - 1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      setStrokes((s) => [...s, first]);
      return rest;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
    setTexts([]);
  }, []);

  // text creation
  const addTextAt = useCallback(
    (clientX: number, clientY: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const x = (clientX - rect.left) * (c.width / rect.width);
      const y = (clientY - rect.top) * (c.height / rect.height);
      const t: TextItem = {
        id: uid("t_"),
        x,
        y,
        text: "Text",
        fontSize: 28,
        color,
        rotation: 0,
      };
      setEditingText(t);
    },
    [color]
  );

  // editing textarea focus
  const editingRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!editingText) return;
    if (editingRef.current) {
      editingRef.current.focus();
      editingRef.current.select();
    }
  }, [editingText]);

  const finalizeEditingText = useCallback(() => {
    if (!editingText) return;
    setTexts((prev) => [...prev, editingText]);
    setEditingText(null);
  }, [editingText]);

  // canvas click when text tool active
  function canvasPointerForText(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!textModeActive) return;
    addTextAt(ev.clientX, ev.clientY);
  }

  const handleDone = useCallback(async () => {
    const main = canvasRef.current;
    const w = main?.width ?? canvasSize.w;
    const h = main?.height ?? canvasSize.h;
    const blob = await exportToBlob(w, h, bgUrl, strokes, texts);
    const meta = {
      width: w,
      height: h,
      strokesCount: strokes.length,
      textsCount: texts.length,
      createdAt: new Date().toISOString(),
    };
    try {
      await onComplete(blob, meta);
    } catch (err) {
      console.error("onComplete handler error:", err);
    }
  }, [canvasSize.h, canvasSize.w, bgUrl, strokes, texts, onComplete]);

  const handleCancel = useCallback(() => onCancel(), [onCancel]);

  const selectEraser = useCallback(() => setMode("erase"), []);
  const selectBrush = useCallback(() => { setMode("draw"); setTextModeActive(false); }, []);
    const ColorSwatch: React.FC<{ value: string; onClick: () => void; selected?: boolean; active?: boolean }> = ({
      value,
      onClick,
      selected,
      active,
    }) => {
      const isActive = selected ?? active ?? false;
      return (
        <button
          onClick={onClick}
          className={`w-9 h-9 rounded-full border-2 ${isActive ? "ring-2 ring-offset-1" : ""}`}
          style={{ background: value, borderColor: "rgba(0,0,0,0.12)" }}
          aria-label={`color ${value}`}
          title={value}
          type="button"
        />
      );
    };

  if (!visible) return null;

  const overlayInner: React.ReactNode = (
        <div
          ref={containerRef}
          style={
            positionMode === "absolute"
              ? ({ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 9999 } as CSSProperties)
              : ({ position: "fixed", inset: 0, zIndex: 9999 } as CSSProperties)
          }
          aria-modal
          role="dialog"
        >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          padding: 8,
          zIndex: 10000,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <button onClick={handleCancel} style={{ padding: 8, borderRadius: 6, background: "rgba(255,255,255,0.95)" }} title="Cancel (Esc)">✕</button>
        </div>

        <div style={{ pointerEvents: "auto", display: "flex", gap: 8, alignItems: "center", background: "rgba(255,255,255,0.95)", padding: 8, borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={selectBrush} title="Brush" style={{ padding: 6, borderRadius: 6, background: mode === "draw" ? "#e6e6e6" : "transparent" }}>✎</button>
            <button onClick={selectEraser} title="Eraser" style={{ padding: 6, borderRadius: 6, background: mode === "erase" ? "#e6e6e6" : "transparent" }}>⌫</button>
            <button onClick={() => { setTextModeActive((s) => !s); setMode("draw"); }} title="Text" style={{ padding: 6, borderRadius: 6, background: textModeActive ? "#e6e6e6" : "transparent" }}>T</button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {DEFAULT_COLORS.map((c) => (
              <ColorSwatch key={c} value={c} onClick={() => { setColor(c); setMode("draw"); }} active={c === color} />
            ))}
            <button onClick={() => setShowAdvancedColors((s) => !s)} title="More colors" style={{ padding: 6, borderRadius: 6 }}>•••</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              aria-label="Brush size"
              type="range"
              min={1}
              max={60}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
            <div style={{ minWidth: 48, textAlign: "right", fontSize: 13 }}>{size}px</div>
            <button onClick={handleUndo} title="Undo (Ctrl/Cmd+Z)" style={{ padding: 6, borderRadius: 6 }}>↶</button>
            <button onClick={handleRedo} title="Redo (Ctrl/Cmd+Y)" style={{ padding: 6, borderRadius: 6 }}>↷</button>
            <button onClick={handleClearAll} title="Clear" style={{ padding: 6, borderRadius: 6 }}>🗑</button>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch", justifyContent: "stretch", zIndex: 9998 }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor: textModeActive ? "text" : "crosshair",
            display: "block",
            background: "transparent",
          }}
          onPointerDown={(ev) => {
            if (textModeActive) {
              canvasPointerForText(ev);
            }
          }}
        />
      </div>

      <div style={{ position: "absolute", right: 12, top: 64, zIndex: 10001, pointerEvents: "auto" }}>
        <div style={{ background: "rgba(0,0,0,0.55)", padding: 6, borderRadius: 8, color: "white", fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>Drawing</div>
          <div style={{ marginTop: 6, textAlign: "right" }}>
            <button onClick={handleDone} style={{ padding: "6px 12px", borderRadius: 6, background: "white", color: "#000", fontWeight: 700 }}>Done</button>
          </div>
        </div>
      </div>

      {editingText && (
        <div
          style={{
            position: "absolute",
            left: (() => {
              const m = canvasRef.current;
              if (!m) return 0;
              const r = m.getBoundingClientRect();
              return (editingText.x / m.width) * r.width + r.left;
            })(),
            top: (() => {
              const m = canvasRef.current;
              if (!m) return 0;
              const r = m.getBoundingClientRect();
              return (editingText.y / m.height) * r.height + r.top;
            })(),
            zIndex: 10002,
          }}
        >
          <textarea
            ref={editingRef as any}
            defaultValue={editingText.text}
            style={{
              minWidth: 120,
              minHeight: 40,
              padding: 6,
              fontSize: editingText.fontSize,
            }}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              if (!val) {
                setEditingText(null);
                return;
              }
              setTexts((prev) => [...prev, { ...editingText, text: val }]);
              setEditingText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        </div>
      )}
    </div>
  );
  
  if (positionMode === "fixed") {
    if (typeof document !== "undefined") {
      return createPortal(overlayInner, document.body);
    }
    return null;
  }
  return overlayInner;
}
