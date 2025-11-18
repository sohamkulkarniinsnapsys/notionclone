"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  workspaces?: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  documents?: Array<{
    id: string;
    title: string;
    workspaceId: string;
  }>;
  currentWorkspaceId?: string;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export default function Sidebar({
  workspaces = [],
  documents = [],
  currentWorkspaceId,
  user,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  if (isCollapsed) {
    return (
      <aside className="w-0 md:w-12 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col items-center py-4 transition-all duration-200">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
          aria-label="Expand sidebar"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="3" y1="4" x2="13" y2="4" />
            <line x1="3" y1="12" x2="13" y2="12" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-0 md:w-[var(--sidebar-width)] bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col transition-all duration-200 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || "User"}
              className="w-6 h-6 rounded"
            />
          ) : (
            <div className="w-6 h-6 rounded bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-medium">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
          )}
          <span className="text-sm font-medium truncate">
            {user?.name || "User"}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
          aria-label="Collapse sidebar"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="10" y1="7" x2="4" y2="7" />
            <line x1="7" y1="4" x2="4" y2="7" />
            <line x1="7" y1="10" x2="4" y2="7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Quick Actions */}
        <div className="mb-4">
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
              isActive("/dashboard")
                ? "bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-medium"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <span className="text-base">🏠</span>
            <span>Home</span>
          </Link>
        </div>

        {/* Workspaces */}
        {workspaces.length > 0 && (
          <div className="mb-4">
            <div className="px-2 mb-2">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
                Workspaces
              </span>
            </div>
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/workspace/${workspace.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    currentWorkspaceId === workspace.id
                      ? "bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-medium"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <span className="text-base">
                    {workspace.icon || "📁"}
                  </span>
                  <span className="truncate">{workspace.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Documents */}
        {documents.length > 0 && (
          <div>
            <div className="px-2 mb-2">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
                Recent
              </span>
            </div>
            <div className="space-y-1">
              {documents.slice(0, 10).map((doc) => (
                <Link
                  key={doc.id}
                  href={`/workspace/${doc.workspaceId}/documents/${doc.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    isActive(
                      `/workspace/${doc.workspaceId}/documents/${doc.id}`
                    )
                      ? "bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-medium"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <span className="text-base">📄</span>
                  <span className="truncate">
                    {doc.title || "Untitled"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--color-border)]">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
        >
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
            <circle cx="8" cy="8" r="3" />
            <path d="M12.5 8A4.5 4.5 0 0 1 8 12.5m0-9A4.5 4.5 0 0 0 3.5 8m9 0a4.5 4.5 0 0 1-4.5 4.5" />
          </svg>
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
