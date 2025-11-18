"use server";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Fetch user memberships
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: {
      workspace: {
        select: { id: true, name: true, ownerId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const workspaceIds = memberships.map((m: any) => m.workspaceId);

  // Recent documents across user's workspaces
  const recentDocuments = workspaceIds.length
    ? await prisma.document.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      })
    : [];

  // Load pending invites
  let invites: any[] = [];
  try {
    const prismaAny = prisma as any;
    if (session.user.email && prismaAny?.invite?.findMany) {
      invites = await prismaAny.invite.findMany({
        where: { email: session.user.email, status: "pending" },
        include: { workspace: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });
    }
  } catch {
    invites = [];
  }

  // Create document action
  async function createDoc(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) {
      redirect("/auth/signin");
    }
    const wsId = String(formData.get("workspaceId") || "");
    if (!wsId) return;

    const title = String(formData.get("title") ?? "").trim();

    const member = await prisma.workspaceMember.findFirst({
      where: { userId: sessionInner.user.id, workspaceId: wsId },
    });
    if (!member) return;

    const doc = await prisma.document.create({
      data: {
        title: title || "Untitled",
        workspaceId: wsId,
        createdBy: sessionInner.user.id,
        ownerId: sessionInner.user.id,
      },
      select: { id: true, workspaceId: true },
    });

    redirect(`/workspace/${doc.workspaceId}/documents/${doc.id}`);
  }

  // Create workspace action
  async function createWorkspace(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) {
      redirect("/auth/signin");
    }
    const name = String(formData.get("name") || "").trim();
    if (!name) return;

    await prisma.workspace.create({
      data: {
        name,
        ownerId: sessionInner.user.id,
        members: {
          create: {
            userId: sessionInner.user.id,
            role: "owner",
          },
        },
      },
    });
    redirect("/dashboard");
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex-col">
        <div className="p-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
            Quick Actions
          </h2>
          {memberships.length > 0 && (
            <form action={createDoc} className="space-y-2">
              <select
                name="workspaceId"
                defaultValue={memberships[0]?.workspace.id}
                className="input w-full text-base"
                required
              >
                {memberships.map((m: any) => (
                  <option key={m.workspace.id} value={m.workspace.id}>
                    {m.workspace.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary w-full text-base">
                + New Document
              </button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
            Workspaces
          </h3>
          <div className="space-y-1">
            {memberships.map((m: any) => (
              <Link
                key={m.workspace.id}
                href={`/workspace/${m.workspace.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-base text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span>📁</span>
                <span className="truncate">{m.workspace.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
              Welcome back, {session.user.name || "User"}
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              Here's what you've been working on
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="card">
              <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                {memberships.length}
              </div>
              <div className="text-base text-[var(--color-text-secondary)]">
                Workspaces
              </div>
            </div>
            <div className="card">
              <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                {recentDocuments.length}
              </div>
              <div className="text-base text-[var(--color-text-secondary)]">
                Recent Documents
              </div>
            </div>
            <div className="card">
              <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                {invites.length}
              </div>
              <div className="text-base text-[var(--color-text-secondary)]">
                Pending Invites
              </div>
            </div>
          </div>

          {/* Create Workspace */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Create Workspace
            </h2>
            <form action={createWorkspace} className="flex gap-2">
              <input
                name="name"
                placeholder="Workspace name"
                required
                className="input flex-1"
              />
              <button type="submit" className="btn btn-primary">
                Create
              </button>
            </form>
          </section>

          {/* Workspaces Grid */}
          {memberships.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                Your Workspaces
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {memberships.map((m: any) => (
                  <Link
                    key={m.workspace.id}
                    href={`/workspace/${m.workspace.id}`}
                    className="card hover:shadow-[var(--shadow-md)] transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">📁</span>
                    </div>
                    <h3 className="font-semibold text-[var(--color-text-primary)] mb-1">
                      {m.workspace.name}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {m.role}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent Documents */}
          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Recent Documents
            </h2>
            {recentDocuments.length === 0 ? (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-[var(--color-text-secondary)] mb-4">
                  No documents yet
                </p>
                {memberships.length > 0 && (
                  <form action={createDoc} className="inline-block">
                    <input
                      type="hidden"
                      name="workspaceId"
                      value={memberships[0]?.workspace.id}
                    />
                    <button type="submit" className="btn btn-primary">
                      Create your first document
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <DashboardClient
                memberships={memberships}
                recentDocuments={recentDocuments}
                userId={session.user.id}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
