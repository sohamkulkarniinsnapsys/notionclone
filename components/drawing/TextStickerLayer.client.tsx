"use client";

/**
 * components/drawing/TextStickerLayer.client.tsx
 *
 * Responsible for:
 *  - letting the user add editable text nodes (drag/scale/rotate) over the drawing canvas
 *  - letting the user add sticker images (drag/scale/rotate)
 *  - providing a simple API to the parent via a forwarded ref to:
 *      - getElementsForExport(): { texts: TextItem[], stickers: StickerItem[] }
 *      - addText(options)
 *      - addSticker(url, options)
 *      - clear()
 *      - serialize() / deserialize(data)  (basic)
 *
 * Implementation notes:
 *  - This is deliberately implemented with simple HTML/CSS transforms (no heavy 3rd-party libraries)
 *    so it is easy to paste into your Notion-clone codebase and adapt later to Konva or another lib.
 *  - Uses pointer events for drag/rotate/scale interactions. Rotation is handled by a rotate handle.
 *  - Scale is handled via a corner handle (uniform scale).
 *  - Text editing uses a contentEditable element that becomes a text node when editing finishes.
 *  - Coordinates and transforms are stored in absolute canvas-space (pixels). The parent overlay
 *    should render this component above the drawing canvas and give it the same size & position.
 *
 * Props:
 *  - width, height: number - logical canvas size in pixels (used to place elements).
 *  - className?: string - wrapper className
 *  - defaultFont?: string - fallback font family
 *  - onChange?: (state) => void - called whenever items change
 *
 * Example usage (from DrawingOverlay):
 *  const ref = useRef<TextStickerRef|null>(null);
 *  // add a text:
 *  ref.current?.addText({ x: 100, y: 200, text: "Hello" });
 *  // get for export:
 *  const { texts, stickers } = ref.current?.getElementsForExport();
 *
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type Transform = {
  x: number; // center x (canvas coords)
  y: number; // center y
  scale: number; // uniform scale; 1 = natural size
  rotation: number; // degrees
  width: number; // natural width in px (for calculating box)
  height: number; // natural height in px
};

export type TextItem = {
  id: string;
  type: "text";
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  transform: Transform;
  textAlign?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
};

export type StickerItem = {
  id: string;
  type: "sticker";
  url: string;
  transform: Transform;
  // optional: keep natural image size cached
  naturalWidth?: number;
  naturalHeight?: number;
};

export type TextStickerState = {
  texts: TextItem[];
  stickers: StickerItem[];
};

export type TextStickerRef = {
  getElementsForExport: () => TextStickerState;
  addText: (opts?: Partial<TextItem>) => string; // returns id
  addSticker: (url: string, opts?: Partial<StickerItem>) => Promise<string>;
  clear: () => void;
  serialize: () => TextStickerState;
  deserialize: (data: TextStickerState) => void;
};

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

// utils
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

type Props = {
  width: number;
  height: number;
  className?: string;
  defaultFont?: string;
  onChange?: (s: TextStickerState) => void;
};

const handleStyleBase: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 4,
  background: "white",
  border: "1px solid rgba(0,0,0,0.15)",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "grab",
};

/**
 * TextStickerLayer component
 */
const TextStickerLayer = forwardRef<TextStickerRef, Props>(function TextStickerLayer(
  { width, height, className, defaultFont = "system-ui", onChange },
  ref
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [texts, setTexts] = useState<TextItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);

  // selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // pointer drag state
  const dragState = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    kind: "move" | "scale" | "rotate" | null;
    startAngle?: number;
    startDist?: number;
    origScale?: number;
  }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0, kind: null });

  // expose ref API
  useImperativeHandle(
    ref,
    (): TextStickerRef => ({
      getElementsForExport: () => ({ texts, stickers }),
      addText: (opts = {}) => {
        const id = uid("t_");
        const fontSize = opts.fontSize ?? 28;
        const initial: TextItem = {
          id,
          type: "text",
          text: opts.text ?? "Text",
          fontSize,
          color: opts.color ?? "#000000",
          fontFamily: opts.fontFamily ?? defaultFont,
          transform: {
            x: opts.transform?.x ?? width / 2,
            y: opts.transform?.y ?? height / 2,
            scale: opts.transform?.scale ?? 1,
            rotation: opts.transform?.rotation ?? 0,
            width: opts.transform?.width ?? 200,
            height: opts.transform?.height ?? fontSize * 1.4,
          },
          textAlign: opts.textAlign ?? "left",
          bold: opts.bold ?? false,
          italic: opts.italic ?? false,
        };
        setTexts((s) => {
          const next = [...s, initial];
          onChange?.({ texts: next, stickers });
          return next;
        });
        setSelectedId(id);
        setEditingId(id);
        return id;
      },
      addSticker: async (url: string, opts = {}) => {
        // load image to get natural size
        const id = uid("st_");
        const img = new Image();
        img.crossOrigin = "anonymous";
        const p: Promise<void> = new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        img.src = url;
        await p;
        const nw = img.naturalWidth || opts.transform?.width || 200;
        const nh = img.naturalHeight || opts.transform?.height || (nw * 0.75) || 150;
        const initial: StickerItem = {
          id,
          type: "sticker",
          url,
          naturalWidth: nw,
          naturalHeight: nh,
          transform: {
            x: opts.transform?.x ?? width / 2,
            y: opts.transform?.y ?? height / 2,
            scale: opts.transform?.scale ?? 1,
            rotation: opts.transform?.rotation ?? 0,
            width: opts.transform?.width ?? nw,
            height: opts.transform?.height ?? nh,
          },
        };
        setStickers((s) => {
          const next = [...s, initial];
          onChange?.({ texts, stickers: next });
          return next;
        });
        setSelectedId(id);
        return id;
      },
      clear: () => {
        setTexts([]);
        setStickers([]);
        setSelectedId(null);
        setEditingId(null);
        onChange?.({ texts: [], stickers: [] });
      },
      serialize: () => ({ texts, stickers }),
      deserialize: (data) => {
        setTexts(data.texts ?? []);
        setStickers(data.stickers ?? []);
        onChange?.(data);
      },
    }),
    [texts, stickers, width, height, onChange, defaultFont]
  );

  // utility to find item by id
  const findItem = useCallback(
    (id: string) => {
      const t = texts.find((x) => x.id === id);
      if (t) return { kind: "text" as const, item: t };
      const s = stickers.find((x) => x.id === id);
      if (s) return { kind: "sticker" as const, item: s };
      return null;
    },
    [texts, stickers]
  );

  // common pointer handlers for move/scale/rotate actions
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const ds = dragState.current;
      if (!ds.id || !ds.kind) return;
      // normalize coords relative to wrapper
      const wrap = wrapperRef.current!;
      const rect = wrap.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (ds.kind === "move") {
        const dx = px - ds.startX;
        const dy = py - ds.startY;
        const newX = ds.origX + dx;
        const newY = ds.origY + dy;
        // update
        setTexts((prev) =>
          prev.map((it) =>
            it.id === ds.id
              ? { ...it, transform: { ...it.transform, x: newX, y: newY } }
              : it
          )
        );
        setStickers((prev) =>
          prev.map((it) =>
            it.id === ds.id
              ? { ...it, transform: { ...it.transform, x: newX, y: newY } }
              : it
          )
        );
      } else if (ds.kind === "scale") {
        // uniform scale relative to start distance
        if (ds.startDist && ds.origScale != null) {
          const dx = px - ds.startX;
          const dy = py - ds.startY;
          const curDist = Math.sqrt(dx * dx + dy * dy);
          const ratio = curDist / ds.startDist;
          const newScale = clamp(ds.origScale * ratio, 0.1, 10);
          setTexts((prev) =>
            prev.map((it) =>
              it.id === ds.id ? { ...it, transform: { ...it.transform, scale: newScale } } : it
            )
          );
          setStickers((prev) =>
            prev.map((it) =>
              it.id === ds.id ? { ...it, transform: { ...it.transform, scale: newScale } } : it
            )
          );
        }
      } else if (ds.kind === "rotate") {
        // rotation around orig center
        const wrapRect = wrapperRef.current!.getBoundingClientRect();
        const cx = ds.origX; // stored as center coords in pixels (canvas coords)
        const cy = ds.origY;
        // convert cx,cy to client coords relative to wrapper
        const cxClient = cx;
        const cyClient = cy;
        const angleStart = ds.startAngle ?? 0;
        const startX = ds.startX;
        const startY = ds.startY;
        // compute angle between start center->start pointer and center->current pointer
        const a1 = Math.atan2(startY - cyClient, startX - cxClient);
        const a2 = Math.atan2(py - cyClient, px - cxClient);
        const delta = (a2 - a1) * (180 / Math.PI);
        let newRotation = angleStart + delta;
        // normalize
        if (newRotation > 360) newRotation -= 360;
        if (newRotation < -360) newRotation += 360;
        setTexts((prev) =>
          prev.map((it) =>
            it.id === ds.id ? { ...it, transform: { ...it.transform, rotation: newRotation } } : it
          )
        );
        setStickers((prev) =>
          prev.map((it) =>
            it.id === ds.id ? { ...it, transform: { ...it.transform, rotation: newRotation } } : it
          )
        );
      }
    }

    function onPointerUp() {
      // finalize drag
      if (dragState.current.id) {
        dragState.current = { id: null, startX: 0, startY: 0, origX: 0, origY: 0, kind: null };
        // push change
        onChange?.({ texts, stickers });
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [texts, stickers, onChange]);

  // helpers for starting drag operations
  const startMove = (id: string, clientX: number, clientY: number) => {
    const wrap = wrapperRef.current!;
    const rect = wrap.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const it = findItem(id);
    if (!it) return;
    const t = it.item.transform;
    dragState.current = {
      id,
      startX: px,
      startY: py,
      origX: t.x,
      origY: t.y,
      kind: "move",
    };
  };

  const startScale = (id: string, clientX: number, clientY: number) => {
    const wrap = wrapperRef.current!;
    const rect = wrap.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const it = findItem(id);
    if (!it) return;
    const t = it.item.transform;
    const dx = px - t.x;
    const dy = py - t.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    dragState.current = {
      id,
      startX: px,
      startY: py,
      origX: t.x,
      origY: t.y,
      kind: "scale",
      startDist: dist,
      origScale: t.scale,
    };
  };

  const startRotate = (id: string, clientX: number, clientY: number) => {
    const wrap = wrapperRef.current!;
    const rect = wrap.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const it = findItem(id);
    if (!it) return;
    const t = it.item.transform;
    dragState.current = {
      id,
      startX: px,
      startY: py,
      origX: t.x,
      origY: t.y,
      kind: "rotate",
      startAngle: t.rotation,
    };
  };

  // interaction handlers attached to per-item DOM elements
  const onItemPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    startMove(id, e.clientX, e.clientY);
    setSelectedId(id);
  };

  const onScalePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    startScale(id, e.clientX, e.clientY);
  };

  const onRotatePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    startRotate(id, e.clientX, e.clientY);
  };

  // double click to edit text
  const onDoubleClick = (id: string) => {
    const found = texts.find((t) => t.id === id);
    if (found) {
      setEditingId(id);
      setSelectedId(id);
    }
  };

  // finish editing text
  const finishEditingText = (id: string, value: string) => {
    setTexts((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, text: value } : t));
      onChange?.({ texts: next, stickers });
      return next;
    });
    setEditingId(null);
  };

  // remove selected element
  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setTexts((prev) => prev.filter((t) => t.id !== selectedId));
    setStickers((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    onChange?.({ texts: texts.filter((t) => t.id !== selectedId), stickers: stickers.filter((s) => s.id !== selectedId) });
  }, [selectedId, texts, stickers, onChange]);

  // keyboard delete handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        // duplicate
        const found = texts.find((t) => t.id === selectedId) as TextItem | undefined;
        if (found) {
          const copy = { ...found, id: uid("t_"), transform: { ...found.transform, x: found.transform.x + 20, y: found.transform.y + 20 } };
          setTexts((s) => {
            const next = [...s, copy];
            onChange?.({ texts: next, stickers });
            return next;
          });
        }
        const sf = stickers.find((s) => s.id === selectedId) as StickerItem | undefined;
        if (sf) {
          const copy = { ...sf, id: uid("st_"), transform: { ...sf.transform, x: sf.transform.x + 20, y: sf.transform.y + 20 } };
          setStickers((s) => {
            const next = [...s, copy];
            onChange?.({ texts, stickers: next });
            return next;
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, texts, stickers, onChange, removeSelected]);

  // render transform style for an item given its transform
  const getItemStyle = (t: Transform): React.CSSProperties => {
    // position element with transform origin at center
    const w = t.width * (t.scale ?? 1);
    const h = t.height * (t.scale ?? 1);
    const left = t.x - w / 2;
    const top = t.y - h / 2;
    return {
      position: "absolute",
      left,
      top,
      width: w,
      height: h,
      transform: `rotate(${t.rotation || 0}deg)`,
      transformOrigin: "center center",
      touchAction: "none",
      userSelect: "none",
    };
  };

  // render
  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        position: "absolute",
        width,
        height,
        left: 0,
        top: 0,
        pointerEvents: "none", // we'll enable pointerEvents on items themselves
      }}
      aria-hidden={false}
    >
      {/* render stickers */}
      {stickers.map((s) => {
        const isSelected = selectedId === s.id;
        return (
          <div
            key={s.id}
            onPointerDown={(e) => onItemPointerDown(e, s.id)}
            style={{
              ...getItemStyle(s.transform),
              pointerEvents: "auto", // allow interacting
            }}
            onDoubleClick={() => setSelectedId(s.id)}
            role="img"
            aria-label="sticker"
          >
            <img
              src={s.url}
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                pointerEvents: "none", // image shouldn't capture pointer - wrapper handles
              }}
            />

            {/* controls (only visible when selected) */}
            {isSelected && (
              <>
                {/* scale handle bottom-right */}
                <div
                  onPointerDown={(e) => onScalePointerDown(e, s.id)}
                  style={{
                    position: "absolute",
                    right: -10,
                    bottom: -10,
                    ...handleStyleBase,
                    cursor: "nwse-resize",
                    zIndex: 10,
                  }}
                  title="Scale"
                >
                  ⇲
                </div>

                {/* rotate handle top-right */}
                <div
                  onPointerDown={(e) => onRotatePointerDown(e, s.id)}
                  style={{
                    position: "absolute",
                    right: -10,
                    top: -10,
                    ...handleStyleBase,
                    cursor: "grab",
                    zIndex: 10,
                  }}
                  title="Rotate"
                >
                  ⤾
                </div>

                {/* border */}
                <div
                  style={{
                    position: "absolute",
                    left: -4,
                    top: -4,
                    right: -4,
                    bottom: -4,
                    border: "1px dashed rgba(0,0,0,0.25)",
                    pointerEvents: "none",
                  }}
                />
              </>
            )}
          </div>
        );
      })}

      {/* render texts */}
      {texts.map((t) => {
        const isSelected = selectedId === t.id;
        const isEditing = editingId === t.id;
        const style = getItemStyle(t.transform);
        const fontSize = Math.max(4, t.fontSize * (t.transform.scale ?? 1));
        return (
          <div
            key={t.id}
            onPointerDown={(e) => onItemPointerDown(e, t.id)}
            onDoubleClick={() => onDoubleClick(t.id)}
            style={{
              ...style,
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent:
                t.textAlign === "center" ? "center" : t.textAlign === "right" ? "flex-end" : "flex-start",
              padding: 6,
            }}
          >
            {isEditing ? (
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(ev) => finishEditingText(t.id, ev.currentTarget.textContent ?? "")}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    (ev.target as HTMLElement).blur();
                  }
                }}
                style={{
                  outline: "none",
                  minWidth: 40,
                  minHeight: 20,
                  fontSize,
                  color: t.color,
                  fontFamily: t.fontFamily ?? defaultFont,
                  background: "rgba(255,255,255,0.6)",
                  padding: 4,
                }}
              >
                {t.text}
              </div>
            ) : (
              <div
                style={{
                  fontSize,
                  color: t.color,
                  fontFamily: t.fontFamily ?? defaultFont,
                  lineHeight: 1.2,
                  whiteSpace: "pre-wrap",
                  pointerEvents: "none", // so wrapper catches pointer
                }}
              >
                {t.text}
              </div>
            )}

            {isSelected && (
              <>
                {/* scale handle */}
                <div
                  onPointerDown={(e) => onScalePointerDown(e, t.id)}
                  style={{
                    position: "absolute",
                    right: -10,
                    bottom: -10,
                    ...handleStyleBase,
                    cursor: "nwse-resize",
                    zIndex: 10,
                  }}
                  title="Scale"
                >
                  ⇲
                </div>

                {/* rotate handle */}
                <div
                  onPointerDown={(e) => onRotatePointerDown(e, t.id)}
                  style={{
                    position: "absolute",
                    right: -10,
                    top: -10,
                    ...handleStyleBase,
                    cursor: "grab",
                    zIndex: 10,
                  }}
                  title="Rotate"
                >
                  ⤾
                </div>

                {/* border */}
                <div
                  style={{
                    position: "absolute",
                    left: -6,
                    top: -6,
                    right: -6,
                    bottom: -6,
                    border: "1px dashed rgba(0,0,0,0.25)",
                    pointerEvents: "none",
                  }}
                />
              </>
            )}
          </div>
        );
      })}

      {/* a small floating toolbar when an element is selected */}
      {selectedId && (
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            zIndex: 20,
            pointerEvents: "auto",
            display: "flex",
            gap: 6,
            background: "rgba(255,255,255,0.9)",
            padding: 6,
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          <button
            onClick={() => {
              // toggle bold for text
              setTexts((prev) => prev.map((it) => (it.id === selectedId ? { ...it, bold: !it.bold } : it)));
            }}
            style={{ padding: 6 }}
          >
            B
          </button>
          <button
            onClick={() => {
              // toggle italic
              setTexts((prev) => prev.map((it) => (it.id === selectedId ? { ...it, italic: !it.italic } : it)));
            }}
            style={{ padding: 6 }}
          >
            I
          </button>
          <button
            onClick={() => {
              // bring forward – move to end in arrays
              setStickers((prev) => {
                if (!prev.find((s) => s.id === selectedId)) return prev;
                const found = prev.find((s) => s.id === selectedId)!;
                const filtered = prev.filter((s) => s.id !== selectedId);
                const next = [...filtered, found];
                onChange?.({ texts, stickers: next });
                return next;
              });
              setTexts((prev) => {
                if (!prev.find((t) => t.id === selectedId)) return prev;
                const found = prev.find((t) => t.id === selectedId)!;
                const filtered = prev.filter((t) => t.id !== selectedId);
                const next = [...filtered, found];
                onChange?.({ texts: next, stickers });
                return next;
              });
            }}
            style={{ padding: 6 }}
          >
            ⇧
          </button>
          <button
            onClick={() => {
              // delete
              removeSelected();
            }}
            style={{ padding: 6 }}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
});

export default TextStickerLayer;
