"use client";

import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PageBlockAttrs {
  docId: string;
  title: string;
  workspaceId: string;
}

export default function PageBlockView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const router = useRouter();
  const attrs = node.attrs as PageBlockAttrs;
  const { docId, title: initialTitle, workspaceId } = attrs;
  const [currentTitle, setCurrentTitle] = useState(initialTitle || "Untitled");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch the latest title from the server
  useEffect(() => {
    if (!docId) return;

    const fetchTitle = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `/api/documents/${encodeURIComponent(docId)}/meta`,
        );

        if (res.ok) {
          const data = await res.json();
          const serverTitle = data?.document?.title || "Untitled";

          // Update local state and node attributes if title changed
          if (serverTitle !== currentTitle) {
            setCurrentTitle(serverTitle);
            updateAttributes({ title: serverTitle });
          }
        }
      } catch (error) {
        console.error("Failed to fetch document title:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch initially
    fetchTitle();

    // Poll for title changes every 5 seconds when the block is visible
    const interval = setInterval(fetchTitle, 5000);

    return () => clearInterval(interval);
    // currentTitle is intentionally not in deps to avoid refetching on every title change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, updateAttributes]);

  // Listen for global title change events (if broadcasted via Y.js or custom events)
  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        docId: string;
        title: string;
      }>;
      if (customEvent.detail.docId === docId && customEvent.detail.title) {
        setCurrentTitle(customEvent.detail.title);
        updateAttributes({ title: customEvent.detail.title });
      }
    };

    window.addEventListener("document-title-changed", handleTitleChange);

    return () => {
      window.removeEventListener("document-title-changed", handleTitleChange);
    };
  }, [docId, updateAttributes]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (workspaceId && docId) {
      router.push(`/workspace/${workspaceId}/documents/${docId}`);
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
        onClick={handleClick}
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
          e.currentTarget.style.borderColor = "var(--color-accent)";
          e.currentTarget.style.boxShadow = "var(--shadow-md)";
        }}
        onMouseLeave={(e) => {
          if (!selected) {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "var(--shadow-sm)";
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
        </div>
        <div
          className="page-block-meta"
          style={{
            fontSize: "12px",
            color: "#6b7280",
            paddingLeft: "24px",
          }}
        >
          Page • Click to open
        </div>
      </div>
    </NodeViewWrapper>
  );
}
