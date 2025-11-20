"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import AppSidebar from "@/components/sidebar/AppSidebar";
import DashboardClient from "@/components/DashboardClient";
import Link from "next/link";

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

  // Create document action (when user has at least one workspace)
  // This will create a new document in the user's first workspace and redirect to it.
  const firstWorkspaceId = memberships.length ? memberships[0].workspace.id : null;
  async function createDocument(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) {
      redirect("/auth/signin");
    }

    if (!firstWorkspaceId) {
      // No workspace to create document in; go to dashboard (or you might redirect to create workspace flow)
      redirect("/dashboard");
    }

    const title = String(formData.get("title") || "").trim() || "Untitled";

    const doc = await prisma.document.create({
      data: {
        title,
        workspaceId: firstWorkspaceId,
        createdBy: sessionInner.user.id,
        ownerId: sessionInner.user.id,
      },
    });

    redirect(`/workspace/${firstWorkspaceId}/documents/${doc.id}`);
  }

  // Prepare workspaces list for sidebar
  const workspaceList = memberships.map((m: any) => ({
    id: m.workspace.id,
    name: m.workspace.name,
  }));

  // Prepare recent docs for sidebar
  const recentDocsForSidebar = recentDocuments.map((d) => ({
    id: d.id,
    title: d.title,
    workspaceId: d.workspaceId,
  }));

  // Render main dashboard but wrapped in AppSidebar.
  return (
    <AppSidebar>
      <div className="flex h-full">
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
                  {memberships.map((m: any) => {
                    const wid = m.workspace.id;
                    const wName = m.workspace.name;
                    return (
                      <div
                        key={wid}
                        className="card hover:shadow-[var(--shadow-md)] transition-shadow group relative"
                      >
                        <div className="flex items-center gap-3 pr-10">
                          <span className="text-2xl flex-shrink-0">📁</span>

                          <Link
                            href={`/workspace/${wid}`}
                            className="block flex-1 min-w-0"
                            aria-label={`Open workspace ${wName}`}
                          >
                            <h3 className="font-semibold text-[var(--color-text-primary)] truncate">
                              {wName}
                            </h3>
                            <p className="text-sm text-[var(--color-text-secondary)] truncate">
                              {m.role}
                            </p>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
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

                  {/* If user has workspaces, show create document button that makes a document in the first workspace */}
                  {memberships.length > 0 ? (
                    <form action={createDocument} className="inline-block">
                      {/* optional: allow entering a title; default handled server-side */}
                      <input
                        type="hidden"
                        name="title"
                        value="Untitled"
                      />
                      <button type="submit" className="btn btn-primary">
                        Create Document
                      </button>
                    </form>
                  ) : (
                    /* If user has no workspaces, show the create workspace action (previous behaviour) */
                    <form action={createWorkspace} className="inline-block">
                      <button type="submit" className="btn btn-primary">
                        Create your first workspace
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
    </AppSidebar>
  );
}
