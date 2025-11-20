// components/extensions/PageBlockView.tsx
"use client";

import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PageBlockAttrs {
  docId?: string | null;
  title?: string;
  workspaceId?: string | null;
  parentId?: string | null;
}

export default function PageBlockView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const router = useRouter();
  const attrs = (node.attrs || {}) as PageBlockAttrs;
  const {
    docId: initialDocId,
    title: initialTitle,
    workspaceId: initialWorkspaceId,
    parentId: initialParentId,
  } = attrs;

  const [currentTitle, setCurrentTitle] = useState(initialTitle || "Untitled");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // helper: resolve workspaceId and parentId fallbacks from window globals if available
  function resolveWorkspaceId() {
    return (
      initialWorkspaceId ??
      // fallback that the page route can set: window.__CURRENT_WORKSPACE_ID
      (typeof window !== "undefined"
        ? (window as any).__CURRENT_WORKSPACE_ID ?? null
        : null) ??
      // final fallback: try to infer from url
      (typeof window !== "undefined"
        ? (() => {
            try {
              const m = window.location.pathname.match(/\/workspace\/([^/]+)/);
              return m ? m[1] : null;
            } catch {
              return null;
            }
          })()
        : null)
    );
  }
  function resolveParentId() {
    return (
      initialParentId ??
      // fallback that the page route can set: window.__CURRENT_DOCUMENT_ID
      (typeof window !== "undefined"
        ? (window as any).__CURRENT_DOCUMENT_ID ?? null
        : null)
    );
  }

  // Fetch the latest title from the server when we have a docId
  useEffect(() => {
    if (!initialDocId) return;

    let cancelled = false;
    let controller: AbortController | null = null;

    const fetchTitle = async () => {
      try {
        setIsLoading(true);
        controller = new AbortController();
        const res = await fetch(
          `/api/documents/${encodeURIComponent(initialDocId)}/meta`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          console.warn("PageBlockView: meta fetch non-ok", res.status);
          return;
        }

        const data = await res.json();
        const serverTitle = data?.document?.title || "Untitled";

        if (!cancelled) {
          if (serverTitle !== currentTitle) {
            setCurrentTitle(serverTitle);
            updateAttributes({ title: serverTitle });
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // ignore abort
        } else {
          console.error("Failed to fetch document title:", err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // initial fetch
    fetchTitle();

    // Poll for title changes every 5s while mounted
    const interval = setInterval(fetchTitle, 5000);
    return () => {
      cancelled = true;
      if (controller) controller.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocId, updateAttributes]);

  // Listen for global title change events
  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        docId: string;
        title: string;
      }>;
      if (customEvent?.detail?.docId === initialDocId && customEvent?.detail?.title) {
        setCurrentTitle(customEvent.detail.title);
        updateAttributes({ title: customEvent.detail.title });
      }
    };

    window.addEventListener("document-title-changed", handleTitleChange);

    return () => {
      window.removeEventListener("document-title-changed", handleTitleChange);
    };
  }, [initialDocId, updateAttributes]);

  // click opens document if docId exists, otherwise create one.
  // We separate "open" from "create" so button and wrapper don't double-trigger.
  const handleOpen = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!initialDocId) return;
    const wid = resolveWorkspaceId();
    const targetWorkspace = wid ?? initialWorkspaceId ?? "";
    // use router.push defensively
    try {
      router.push(`/workspace/${targetWorkspace}/documents/${initialDocId}`);
    } catch (err) {
      console.error("Navigation error:", err);
    }
  };

  const handleCreate = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation(); // prevent parent click
    }

    // Avoid creating multiple times
    if (isCreating) return;

    setError(null);
    setIsCreating(true);

    const workspaceId = resolveWorkspaceId();
    const parentId = resolveParentId();

    if (!workspaceId) {
      setError("Missing workspace context. Unable to create page.");
      setIsCreating(false);
      return;
    }

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: currentTitle || "Untitled",
          workspaceId,
          // include parentId if available (this is the key to breadcrumbs)
          parentId: parentId ?? null,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Create failed (${res.status}): ${txt}`);
      }

      // Expect server shape { document: {...} } or { id, ... }
      const data = await res.json();
      const newDoc = data?.document ?? data;
      const newId = newDoc?.id ?? null;
      const newTitle = newDoc?.title ?? currentTitle ?? "Untitled";

      if (!newId) {
        throw new Error("No document id returned from server");
      }

      // Update node attrs to point to the created doc (persist relationship in node)
      updateAttributes({
        docId: newId,
        title: newTitle,
        workspaceId,
        parentId: parentId ?? null,
      });

      setCurrentTitle(newTitle);

      // navigate to the new doc
      try {
        router.push(`/workspace/${workspaceId}/documents/${newId}`);
      } catch (navErr) {
        console.error("Navigation after create failed:", navErr);
      }
    } catch (err: any) {
      console.error("PageBlockView create error:", err);
      setError(err?.message ?? "Failed to create page");
    } finally {
      setIsCreating(false);
    }
  };

  // Wrapper click: if doc exists open, otherwise create
  const onWrapperClick = (e: React.MouseEvent) => {
    if (initialDocId) {
      handleOpen(e);
    } else {
      // If clicking the wrapper and there's no doc, create the page
      handleCreate(e);
    }
  };

  return (
    <NodeViewWrapper
      className="page-block-wrapper"
      data-drag-handle=""
      style={{ margin: "8px 0" }}
    >
      <div
        className={`page-block-link ${selected ? "page-block-selected" : ""}`}
        onClick={onWrapperClick}
        role="button"
        tabIndex={0}
        aria-pressed={!!initialDocId}
        aria-label={initialDocId ? `Open page ${currentTitle}` : `Create page ${currentTitle}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            // emulate click on Enter/Space for accessibility
            e.preventDefault();
            onWrapperClick(e as any);
          }
        }}
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          padding: "12px",
          border: selected
            ? "2px solid var(--color-accent)"
            : "1px solid var(--color-border)",
          borderRadius: "8px",
          background: "var(--color-bg-primary)",
          boxShadow: "var(--shadow-sm)",
          cursor: "pointer",
          transition: "all 0.2s ease",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
          (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
        }}
        onMouseLeave={(e) => {
          if (!selected) {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
          }
        }}
      >
        <div
          className="page-block-title"
          style={{
            fontWeight: 600,
            fontSize: "14px",
            marginBottom: "4px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "16px" }}>📄</span>
          <span style={{ flex: 1 }}>
            {isLoading ? "Loading..." : currentTitle || "Untitled"}
          </span>

          {/* If there's no doc yet, show create affordance */}
          {!initialDocId && (
            <button
              onClick={handleCreate}
              disabled={isCreating}
              aria-label="Create page"
              style={{
                marginLeft: 8,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "transparent",
                cursor: isCreating ? "default" : "pointer",
                fontSize: 13,
              }}
              // defensive: stop propagation so parent wrapper doesn't double-trigger
              onMouseDown={(ev) => ev.stopPropagation()}
              onTouchStart={(ev) => ev.stopPropagation()}
            >
              {isCreating ? "Creating…" : "Create page"}
            </button>
          )}
        </div>

        <div
          className="page-block-meta"
          style={{
            fontSize: "12px",
            color: "#6b7280",
            paddingLeft: "24px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          Page • Click to open
          {error && (
            <span style={{ color: "var(--color-error)", marginLeft: 8 }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
