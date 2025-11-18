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

  return (
    <>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Your Workspaces
        </h2>
        {memberships.length === 0 ? (
          <div style={{ color: "#666" }}>
            You don&apos;t have any workspaces yet.
          </div>
        ) : (
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {memberships.map((m: any) => (
              <li
                key={m.id}
                style={{
                  border: "1px solid #eee",
                  padding: 12,
                  borderRadius: 8,
                  position: "relative",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {m.workspace.name}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link href={`/workspace/${m.workspace.id}`}>
                    <span style={{ color: "#2563eb", fontSize: 14 }}>Open</span>
                  </Link>
                  {m.workspace.ownerId === userId && (
                    <button
                      onClick={() =>
                        setDeleteModal({
                          type: "workspace",
                          id: m.workspace.id,
                          name: m.workspace.name,
                        })
                      }
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 0,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Recent Documents
        </h2>
        {recentDocuments.length === 0 ? (
          <div style={{ color: "#666" }}>No recent documents.</div>
        ) : (
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {recentDocuments.map((d: any) => (
              <li
                key={d.id}
                style={{
                  border: "1px solid #eee",
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {d.title || "Untitled"}
                </div>
                <div style={{ color: "#666", fontSize: 12, marginBottom: 8 }}>
                  Updated{" "}
                  {new Date(d.updatedAt)
                    .toISOString()
                    .replace("T", " ")
                    .substring(0, 19)}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link href={`/workspace/${d.workspaceId}/documents/${d.id}`}>
                    <span style={{ color: "#2563eb", fontSize: 14 }}>Open</span>
                  </Link>
                  <button
                    onClick={() =>
                      setDeleteModal({
                        type: "document",
                        id: d.id,
                        name: d.title || "Untitled",
                      })
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 0,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !isDeleting && setDeleteModal(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600 }}>
              Delete{" "}
              {deleteModal.type === "workspace" ? "Workspace" : "Document"}
            </h2>
            <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
              Are you sure you want to delete &quot;{deleteModal.name}&quot;?
              This action cannot be undone.
              {deleteModal.type === "workspace" &&
                " All documents in this workspace will also be deleted."}
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
            >
              <button
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
                style={{
                  padding: "8px 16px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 6,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                }}
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
                style={{
                  padding: "8px 16px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: isDeleting ? 0.5 : 1,
                }}
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
