// app/workspace/[workspaceId]/documents/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

type Props = {
  params: Promise<{ workspaceId: string }>;
};

export default async function DocumentsListPage({ params }: Props) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { workspaceId } = await params;

  // Check if user has access to this workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: session.user.id,
      workspaceId,
    },
  });

  if (!membership) {
    return (
      <div style={{ padding: 32 }}>
        <h1>Access Denied</h1>
        <p>You don't have access to this workspace.</p>
        <Link href="/">Go Home</Link>
      </div>
    );
  }

  // Get workspace info
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });

  // Get all documents in the workspace
  const documents = await prisma.document.findMany({
    where: { workspaceId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1>{workspace?.name || "Workspace"}</h1>
        <p style={{ color: "#666" }}>Signed in as {session.user.email}</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h2>Documents</h2>
      </div>

      {documents.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#666" }}>
          <p>No documents yet. Create your first document!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {documents.map((doc: any) => (
            <Link
              key={doc.id}
              href={`/workspace/${workspaceId}/documents/${doc.id}`}
              style={{
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
                display: "block",
                transition: "background-color 0.2s",
              }}
              aria-label={`Open document ${doc.title && doc.title.trim() ? doc.title : "Untitled"}`}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {doc.title && doc.title.trim() ? doc.title : "Untitled"}
              </div>
              <div style={{ fontSize: 14, color: "#666" }}>
                Last updated: {new Date(doc.updatedAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
