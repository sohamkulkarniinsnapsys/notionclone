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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
            Access Denied
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            You don't have access to this workspace.
          </p>
          <Link href="/dashboard" className="btn btn-primary">
            Go to Dashboard
          </Link>
        </div>
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

  // Create document action
  async function createDocument(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session?.user) {
      redirect("/auth/signin");
    }

    const title = String(formData.get("title") || "").trim();

    const doc = await prisma.document.create({
      data: {
        title: title || "Untitled",
        workspaceId,
        createdBy: session.user.id,
        ownerId: session.user.id,
      },
    });

    redirect(`/workspace/${workspaceId}/documents/${doc.id}`);
  }

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex-col">
        <div className="p-4 border-b border-[var(--color-border)]">
          <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-3">
            Quick Actions
          </h2>
          <form action={createDocument}>
            <button type="submit" className="btn btn-primary w-full text-sm">
              + New Document
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
            Navigation
          </h3>
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <span>🏠</span>
              <span>Home</span>
            </Link>
            <Link
              href={`/workspace/${workspaceId}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <span>📁</span>
              <span>Workspace</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
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
                <path d="M10 12L6 8l4-4" />
              </svg>
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
              {workspace?.name || "Workspace"}
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              All documents in this workspace
            </p>
          </div>

          {/* Create Document Form */}
          <div className="mb-8">
            <form action={createDocument} className="flex gap-2">
              <input
                name="title"
                placeholder="Document title..."
                className="input flex-1"
              />
              <button type="submit" className="btn btn-primary">
                Create Document
              </button>
            </form>
          </div>

          {/* Documents List */}
          {documents.length === 0 ? (
            <div className="card text-center py-20">
              <div className="text-5xl mb-4">📄</div>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                No documents yet
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                Create your first document to get started
              </p>
              <form action={createDocument} className="inline-block">
                <button type="submit" className="btn btn-primary">
                  Create Document
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/workspace/${workspaceId}/documents/${doc.id}`}
                  className="group card flex items-center justify-between hover:shadow-[var(--shadow-md)] transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 text-xl">📄</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[var(--color-text-primary)] truncate">
                        {doc.title || "Untitled"}
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        Edited {formatDate(doc.updatedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-[var(--color-text-tertiary)]"
                    >
                      <path d="M6 12l4-4-4-4" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
