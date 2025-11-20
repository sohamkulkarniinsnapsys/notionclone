"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface Props {
  workspaceId: string;
  workspaceName: string;
  compact?: boolean; // smaller padding for sidebar
}

export default function WorkspaceDeleteButton({
  workspaceId,
  workspaceName,
  compact = false,
}: Props) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const portalRef = React.useRef<HTMLDivElement | null>(null);

  // Create portal container once (client-only)
  React.useEffect(() => {
    const el = document.createElement("div");
    el.className = "modal-portal-wrapper";
    portalRef.current = el;
    document.body.appendChild(el);
    return () => {
      if (portalRef.current && portalRef.current.parentNode) {
        portalRef.current.parentNode.removeChild(portalRef.current);
      }
      portalRef.current = null;
    };
  }, []);

  // When modal opens, blur & block interaction on the app root (#__next or #root).
  React.useEffect(() => {
    // prefer app root elements so we don't blur the portal itself
    const appRoot =
      (typeof document !== "undefined" && document.getElementById("__next")) ||
      (typeof document !== "undefined" && document.getElementById("root"));

    if (!appRoot) {
      // If there is no identifiable app root, do not touch body (avoids blurring portal)
      return;
    }

    const rootEl = appRoot as HTMLElement;
    const prevFilter = rootEl.style.filter || "";
    const prevPointer = rootEl.style.pointerEvents || "";

    if (open) {
      rootEl.style.filter = "blur(6px)";
      rootEl.style.pointerEvents = "none";
    } else {
      rootEl.style.filter = prevFilter;
      rootEl.style.pointerEvents = prevPointer;
    }

    // cleanup on unmount / when open changes
    return () => {
      rootEl.style.filter = prevFilter;
      rootEl.style.pointerEvents = prevPointer;
    };
  }, [open]);

  const openModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setError(null);
    setOpen(true);
  };

  const closeModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isDeleting) return; // don't allow closing while deleting
    setOpen(false);
    setError(null);
  };

  const confirmDelete = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        let json = null;
        try {
          json = await res.json();
        } catch {}
        const msg = json?.error || `Failed to delete workspace (status ${res.status})`;
        setError(msg);
        setIsDeleting(false);
        return;
      }

      // success: close modal and refresh server data
      setIsDeleting(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("workspace delete error", err);
      setError("An error occurred while deleting the workspace.");
      setIsDeleting(false);
    }
  };

  const baseClasses =
    "opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-error)] focus:outline-none";
  const classes = compact ? `${baseClasses} p-1` : `${baseClasses} p-2`;

  // Modal JSX to portal
  const modalContent = portalRef.current ? (
    <div
      // overlay sits on top of everything; numeric z-index chosen very high to avoid conflicts
      style={{ zIndex: 2147483647 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center"
      onClick={closeModal}
    >
      <div
        // content box uses very high z so it's above overlay; prevent click propagation
        style={{ zIndex: 2147483647 + 1 }}
        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-xl)] w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Delete workspace
          </h2>
        </div>

        <div className="p-6">
          <p className="text-base text-[var(--color-text-secondary)] mb-3">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {workspaceName}
            </span>
            ?
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            This action cannot be undone.
          </p>

          {error && (
            <div className="mt-3 text-sm text-[var(--color-error)]">{error}</div>
          )}
        </div>

        <div className="p-6 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <button
            onClick={closeModal}
            disabled={isDeleting}
            className="btn btn-ghost px-6 py-3 text-base"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            disabled={isDeleting}
            className="btn btn-primary bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 px-6 py-3 text-base"
            type="button"
          >
            {isDeleting ? "Deleting..." : "Delete workspace"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={classes}
        aria-label={`Delete workspace ${workspaceName}`}
        title={`Delete workspace ${workspaceName}`}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <span className="text-sm">...</span>
        ) : (
          <svg
            width={compact ? 14 : 16}
            height={compact ? 14 : 16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 4h12" />
            <path d="M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
            <path d="M6.5 7.5v4" />
            <path d="M9.5 7.5v4" />
            <path d="M3.5 4v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4" />
          </svg>
        )}
      </button>

      {portalRef.current && open && createPortal(modalContent, portalRef.current)}
    </>
  );
}
