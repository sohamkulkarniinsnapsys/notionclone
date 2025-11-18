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
  items: BreadcrumbItem[];
  workspaceId: string;
  maxLength?: number;
  onNavigate?: (pageId: string) => void;
  className?: string;
}

/**
 * Accessible Breadcrumb Component
 *
 * Features:
 * - ARIA labels and semantic HTML
 * - Keyboard navigation (Tab, Enter, Arrow keys)
 * - Copy path to clipboard
 * - Truncation with hover tooltips
 * - Animated transitions
 * - Lazy-fetch parent titles
 */
export default function Breadcrumb({
  items = [],
  workspaceId,
  maxLength = 30,
  onNavigate,
  className = "",
}: BreadcrumbProps) {
  const router = useRouter();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const breadcrumbRef = useRef<HTMLElement>(null);

  // Handle navigation
  const handleNavigate = (item: BreadcrumbItem, index: number) => {
    if (index === items.length - 1) {
      // Current page - no navigation
      return;
    }

    if (onNavigate) {
      onNavigate(item.id);
    } else {
      // Default navigation
      const href = item.href || getDefaultHref(item, workspaceId);
      router.push(href);
    }
  };

  // Generate default href for workspace/document
  const getDefaultHref = (item: BreadcrumbItem, wsId: string): string => {
    // First item is workspace
    if (items.indexOf(item) === 0) {
      return `/workspace/${wsId}`;
    }
    // Other items are documents
    return `/workspace/${wsId}/documents/${item.id}`;
  };

  // Truncate text with ellipsis
  const truncateText = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + "...";
  };

  // Copy breadcrumb path to clipboard
  const handleCopyPath = async (index: number) => {
    const path = items
      .slice(0, index + 1)
      .map((item) => item.title)
      .join(" / ");

    try {
      await navigator.clipboard.writeText(path);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  // Copy full path
  const handleCopyFullPath = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullPath = items.map((item) => item.title).join(" / ");

    try {
      await navigator.clipboard.writeText(fullPath);
      setCopiedIndex(-1);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent,
    item: BreadcrumbItem,
    index: number
  ) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        handleNavigate(item, index);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (index < items.length - 1) {
          setFocusedIndex(index + 1);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (index > 0) {
          setFocusedIndex(index - 1);
        }
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
      case "c":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleCopyPath(index);
        }
        break;
    }
  };

  // Auto-focus when focusedIndex changes
  useEffect(() => {
    if (focusedIndex !== null && breadcrumbRef.current) {
      const buttons = breadcrumbRef.current.querySelectorAll<HTMLElement>(
        '[role="button"]'
      );
      if (buttons[focusedIndex]) {
        buttons[focusedIndex].focus();
      }
    }
  }, [focusedIndex]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      ref={breadcrumbRef}
      aria-label="Breadcrumb"
      className={`breadcrumb-container ${className}`}
      role="navigation"
    >
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isCopied = copiedIndex === index;
          const isHovered = hoveredIndex === index;
          const truncated = truncateText(item.title || "Untitled", maxLength);
          const isWorkspace = index === 0;

          return (
            <li
              key={`${item.id}-${index}`}
              className={`breadcrumb-item ${isLast ? "breadcrumb-item-current" : ""} animate-slideInLeft`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {!isLast ? (
                <>
                  <button
                    type="button"
                    role="button"
                    tabIndex={0}
                    aria-current={isLast ? "page" : undefined}
                    aria-label={`Navigate to ${item.title}`}
                    className="breadcrumb-button"
                    onClick={() => handleNavigate(item, index)}
                    onKeyDown={(e) => handleKeyDown(e, item, index)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    title={item.title}
                  >
                    <span className="breadcrumb-icon">
                      {isWorkspace ? "📁" : "📄"}
                    </span>
                    <span className="breadcrumb-text">{truncated}</span>
                  </button>

                  {/* Copy button (visible on hover) */}
                  {isHovered && (
                    <button
                      type="button"
                      className="breadcrumb-copy animate-scaleIn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPath(index);
                      }}
                      aria-label={`Copy path to ${item.title}`}
                      title="Copy path (Ctrl+C)"
                    >
                      {isCopied ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-green-500"
                        >
                          <polyline points="4 8 7 11 12 5" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect
                            x="5"
                            y="5"
                            width="9"
                            height="9"
                            rx="1"
                          />
                          <path d="M3 11V3a1 1 0 0 1 1-1h8" />
                        </svg>
                      )}
                    </button>
                  )}

                  <span className="breadcrumb-separator" aria-hidden="true">
                    /
                  </span>
                </>
              ) : (
                <span
                  className="breadcrumb-current"
                  aria-current="page"
                  title={item.title}
                >
                  <span className="breadcrumb-icon">
                    {isWorkspace ? "📁" : "📄"}
                  </span>
                  <span className="breadcrumb-text">{truncated}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Copy full path button */}
      <button
        type="button"
        className="breadcrumb-copy-all"
        onClick={handleCopyFullPath}
        aria-label="Copy full breadcrumb path"
        title="Copy full path"
      >
        {copiedIndex === -1 ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-500"
          >
            <polyline points="4 8 7 11 12 5" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="5" width="9" height="9" rx="1" />
            <path d="M3 11V3a1 1 0 0 1 1-1h8" />
          </svg>
        )}
      </button>

      <style jsx>{`
        .breadcrumb-container {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) 0;
          font-size: var(--text-sm);
        }

        .breadcrumb-list {
          display: flex;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 0;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .breadcrumb-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          animation-fill-mode: both;
        }

        .breadcrumb-button {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          font-family: inherit;
          cursor: pointer;
          transition: all var(--transition-fast);
          text-decoration: none;
          position: relative;
        }

        .breadcrumb-button:hover {
          background-color: var(--color-bg-hover);
          color: var(--color-text-primary);
          transform: translateX(2px);
        }

        .breadcrumb-button:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
          background-color: var(--color-bg-hover);
        }

        .breadcrumb-button:active {
          transform: scale(0.98);
        }

        .breadcrumb-icon {
          font-size: var(--text-base);
          line-height: 1;
          flex-shrink: 0;
        }

        .breadcrumb-text {
          line-height: 1;
          white-space: nowrap;
        }

        .breadcrumb-separator {
          color: var(--color-text-tertiary);
          font-size: var(--text-sm);
          user-select: none;
          margin: 0 var(--space-1);
        }

        .breadcrumb-current {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          color: var(--color-text-primary);
          font-weight: 500;
          font-size: var(--text-sm);
        }

        .breadcrumb-copy {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: var(--space-1);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-left: -var(--space-1);
        }

        .breadcrumb-copy:hover {
          background-color: var(--color-bg-hover);
          color: var(--color-accent);
          transform: scale(1.1);
        }

        .breadcrumb-copy:active {
          transform: scale(0.95);
        }

        .breadcrumb-copy-all {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: var(--space-2);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-left: var(--space-2);
        }

        .breadcrumb-copy-all:hover {
          background-color: var(--color-bg-hover);
          border-color: var(--color-border-hover);
          color: var(--color-accent);
          transform: translateY(-1px);
        }

        .breadcrumb-copy-all:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }

        .breadcrumb-copy-all:active {
          transform: scale(0.98);
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .breadcrumb-button:hover,
          .breadcrumb-copy:hover,
          .breadcrumb-copy-all:hover {
            transform: none;
          }

          .breadcrumb-button:active,
          .breadcrumb-copy:active,
          .breadcrumb-copy-all:active {
            transform: none;
          }
        }

        /* Mobile adjustments */
        @media (max-width: 768px) {
          .breadcrumb-container {
            gap: var(--space-2);
            font-size: var(--text-xs);
          }

          .breadcrumb-button {
            padding: var(--space-1) var(--space-2);
            font-size: var(--text-xs);
          }

          .breadcrumb-icon {
            font-size: var(--text-sm);
          }

          .breadcrumb-current {
            padding: var(--space-1) var(--space-2);
            font-size: var(--text-xs);
          }

          .breadcrumb-copy-all {
            width: 28px;
            height: 28px;
          }
        }
      `}</style>
    </nav>
  );
}
