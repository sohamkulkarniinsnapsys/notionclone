"use client";

import React, { useEffect, useState } from "react";
import DrawingOverlay from "./DrawingOverlay.client";
import useDrawingUpload from "./useDrawingUpload";

type Props = {
  workspaceId?: string | null;
};

export default function DrawingShim({ workspaceId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { upload } = useDrawingUpload();

  // expose global shim and listen for legacy events
  useEffect(() => {
    // global shim
    (window as any).__openDrawingOverlay = () => setIsOpen(true);
    // keep optional workspace/doc ids available for commands
    if (workspaceId) {
      (window as any).__CURRENT_WORKSPACE_ID = workspaceId;
    }

    const onOpenOverlay = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail;
        const name = detail?.name ?? null;
        if (!name) return;
        if (name === "draw") setIsOpen(true);
      } catch {}
    };

    const onOpenDraw = (_ev: Event) => {
      setIsOpen(true);
    };

    window.addEventListener("slash:open-overlay", onOpenOverlay as EventListener);
    window.addEventListener("slash:open-draw-overlay", onOpenDraw as EventListener);

    return () => {
      try {
        delete (window as any).__openDrawingOverlay;
      } catch {}
      window.removeEventListener("slash:open-overlay", onOpenOverlay as EventListener);
      window.removeEventListener("slash:open-draw-overlay", onOpenDraw as EventListener);
      // we intentionally do not delete __CURRENT_WORKSPACE_ID here (Doc page sets/cleans it)
    };
  }, [workspaceId]);

  // Called when DrawingOverlay "Done" is pressed with final PNG blob
  const handleComplete = async (blob: Blob, meta?: Record<string, any>) => {
    try {
      const result = await upload(blob, {
        filename: meta?.filename ?? `drawing-${Date.now()}.png`,
      });
      const url = result?.url;
      if (!url) throw new Error("Upload returned no URL");

      // Try to insert using editor shim set by the client editor wrapper
      const editor = (window as any).__tiptapEditor ?? null;
      if (editor && typeof editor.chain === "function") {
        try {
          editor.chain().focus().setImage({ src: url }).run();
          return;
        } catch (err) {
          console.warn("[DrawingShim] insert via editor.chain failed:", err);
        }
      }

      // Fallback: dispatch an event with the image URL so any listener can insert it
      try {
        window.dispatchEvent(new CustomEvent("slash:insert-image-url", { detail: { url } }));
      } catch (e) {
        console.error("[DrawingShim] fallback dispatch failed:", e);
      }
    } catch (err) {
      console.error("[DrawingShim] upload/insert error:", err);
      try {
        // best-effort: show native alert (non-blocking)
        window.alert && window.alert("Failed to upload drawing. See console for details.");
      } catch {}
    } finally {
      setIsOpen(false);
    }
  };

  return (
    <DrawingOverlay
      visible={isOpen}
      onCancel={() => setIsOpen(false)}
      onComplete={handleComplete}
    />
  );
}
