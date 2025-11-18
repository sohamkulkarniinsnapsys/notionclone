"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DashboardClientProps {
  memberships: any[];
  recentDocuments: any[];
  userId: string;
}

export default function DashboardClient({
  memberships,
  recentDocuments,
  userId,
}: DashboardClientProps) {
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<{
    type: "workspace" | "document";
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteWorkspace = async () => {
    if (!deleteModal || deleteModal.type !== "workspace") return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/workspaces/${deleteModal.id}/delete`, {
        method: "POST",
      });

      if (response.ok) {
        setIsDeleting(false);
        setDeleteModal(null);
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete workspace");
        setIsDeleting(false);
        setDeleteModal(null);
      }
    } catch (error) {
      console.error("Error deleting workspace:", error);
      alert("Error deleting workspace");
      setIsDeleting(false);
      setDeleteModal(null);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteModal || deleteModal.type !== "document") return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/documents/${deleteModal.id}/delete`, {
        method: "POST",
      });

      if (response.ok) {
        setIsDeleting(false);
        setDeleteModal(null);
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete document");
        setIsDeleting(false);
        setDeleteModal(null);
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Error deleting document");
      setIsDeleting(false);
      setDeleteModal(null);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <>
      <div className="space-y-3">
        {recentDocuments.map((doc: any, index: number) => (
          <div
            key={doc.id}
            className="group card flex items-center justify-between hover:shadow-[var(--shadow-lg)] transition-all hover:-translate-y-0.5 animate-slideInLeft"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <Link
              href={`/workspace/${doc.workspaceId}/documents/${doc.id}`}
              className="flex items-center gap-4 flex-1 min-w-0 py-1"
            >
              <div className="flex-shrink-0 text-2xl">📄</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base text-[var(--color-text-primary)] truncate">
                  {doc.title || "Untitled"}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  Edited {formatDate(doc.updatedAt)}
                </div>
              </div>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleteModal({
                  type: "document",
                  id: doc.id,
                  name: doc.title || "Untitled",
                });
              }}
              className="opacity-0 group-hover:opacity-100 transition-all p-3 rounded-lg hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-error)] hover:scale-110"
              aria-label="Delete document"
            >
              <svg
                width="18"
                height="18"
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
            </button>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[var(--z-modal-backdrop)] animate-fadeIn"
          onClick={() => !isDeleting && setDeleteModal(null)}
        >
          <div
            className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-xl)] w-full max-w-lg mx-4 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--color-border)]">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Delete{" "}
                {deleteModal.type === "workspace" ? "Workspace" : "Document"}
              </h2>
            </div>
            <div className="p-6">
              <p className="text-base text-[var(--color-text-secondary)] mb-3">
                Are you sure you want to delete "{deleteModal.name}"?
              </p>
              <p className="text-sm text-[var(--color-text-tertiary)]">
                This action cannot be undone.
                {deleteModal.type === "workspace" &&
                  " All documents in this workspace will also be deleted."}
              </p>
            </div>
            <div className="p-6 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
                className="btn btn-ghost px-6 py-3 text-base"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={
                  deleteModal.type === "workspace"
                    ? handleDeleteWorkspace
                    : handleDeleteDocument
                }
                disabled={isDeleting}
                className="btn btn-primary bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 px-6 py-3 text-base"
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
