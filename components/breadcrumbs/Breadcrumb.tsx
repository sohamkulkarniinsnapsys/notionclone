"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface BreadcrumbItem {
  id: string;
  title: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]; // expected order: workspace -> parent(s) -> current
  workspaceId: string;
  // how many items (including workspace & current) to show before collapsing middle
  maxVisible?: number; // default 4 (workspace + [maybe one/more] + current)
}

export default function Breadcrumb({
  items,
  workspaceId,
  maxVisible = 4,
}: BreadcrumbProps) {
  const router = useRouter();
  const [openCollapsed, setOpenCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fallback href generator
  const getDefaultHref = (item: BreadcrumbItem, wsId: string): string => {
    if (items.indexOf(item) === 0) {
      return `/workspace/${wsId}`;
    }
    return `/workspace/${wsId}/documents/${item.id}`;
  };

  const handleNavigate = (item: BreadcrumbItem) => {
    const href = item.href || getDefaultHref(item, workspaceId);
    router.push(href);
  };

  // compute visible vs collapsed items:
  // always show first (workspace) and last (current).
  // show as many items from start/end until you reach maxVisible,
  // collapse the rest into the middle "..." menu.
  const visible = (() => {
    const total = items.length;
    if (total <= maxVisible) return { left: items.slice(0, total), collapsed: [] as BreadcrumbItem[], right: [] as BreadcrumbItem[] };
    // show first, last, and some items near last if space permits
    const left = [items[0]];
    const rightCount = maxVisible - 1; // we keep workspace in left, rest in right including current
    const right = items.slice(Math.max(1, total - rightCount));
    const collapsed = items.slice(1, Math.max(1, total - rightCount));
    return { left, collapsed, right };
  })();

  // close collapsed popover when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpenCollapsed(false);
      }
    }
    if (openCollapsed) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openCollapsed]);

  return (
    <nav
      className="breadcrumb-container"
      aria-label="Breadcrumb"
      ref={containerRef}
    >
      <ol className="breadcrumb-list" role="list">
        {/* Left (workspace) */}
        {visible.left.map((item, idx) => (
          <li key={`crumb-left-${item.id}`} className="breadcrumb-item">
            <button
              onClick={() => handleNavigate(item)}
              className="breadcrumb-button"
              aria-current={idx === items.length - 1 ? "page" : undefined}
            >
              <span className="breadcrumb-text">{item.title || "Untitled"}</span>
            </button>
            <span className="breadcrumb-separator" aria-hidden>
              /
            </span>
          </li>
        ))}

        {/* Collapsed middle */}
        {visible.collapsed.length > 0 && (
          <li key="crumb-collapsed" className="breadcrumb-item">
            <button
              className="breadcrumb-button breadcrumb-collapsed-button"
              onClick={() => setOpenCollapsed((s) => !s)}
              aria-expanded={openCollapsed}
              aria-label="Show hidden breadcrumb items"
            >
              …
            </button>
            <span className="breadcrumb-separator" aria-hidden>
              /
            </span>

            {openCollapsed && (
              <div className="breadcrumb-collapsed-popover" role="menu">
                {visible.collapsed.map((ci) => (
                  <div
                    key={`collapsed-${ci.id}`}
                    className="breadcrumb-collapsed-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenCollapsed(false);
                      handleNavigate(ci);
                    }}
                  >
                    {ci.title}
                  </div>
                ))}
              </div>
            )}
          </li>
        )}

        {/* Right (ending items incl. current) */}
        {visible.right.map((item, idx) => {
          const isCurrent = item === items[items.length - 1];
          return (
            <li key={`crumb-right-${item.id}`} className="breadcrumb-item">
              <button
                onClick={() => handleNavigate(item)}
                className={`breadcrumb-button ${isCurrent ? "breadcrumb-current" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span className="breadcrumb-text">{item.title || "Untitled"}</span>
              </button>
              {idx !== visible.right.length - 1 && (
                <span className="breadcrumb-separator" aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <style jsx>{`
        .breadcrumb-container {
          display: block;
          padding: 0;
        }
        .breadcrumb-list {
          display: flex;
          gap: 8px;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .breadcrumb-item {
          position: relative;
        }
        .breadcrumb-button {
          border: 0;
          background: transparent;
          padding: 6px 8px;
          font-size: 14px;
          cursor: pointer;
        }
        .breadcrumb-button:focus {
          outline: 2px solid rgba(0,0,0,0.15);
          border-radius: 6px;
        }
        .breadcrumb-current {
          font-weight: 600;
        }
        .breadcrumb-separator {
          opacity: 0.6;
        }
        .breadcrumb-collapsed-popover {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 8px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          min-width: 180px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.4);
          z-index: 40;
        }
        .breadcrumb-collapsed-item {
          padding: 8px 12px;
          cursor: pointer;
        }
        .breadcrumb-collapsed-item:hover {
          background: rgba(255,255,255,0.02);
        }
      `}</style>
    </nav>
  );
}
