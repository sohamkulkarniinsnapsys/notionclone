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

  // Load pending invites for the signed-in user's email (guard if model isn't generated yet)
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

  // Simple "create document" action via POST to /api/documents
  async function createDoc(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) {
      redirect("/auth/signin");
    }
    const wsId = String(formData.get("workspaceId") || "");
    if (!wsId) return;
    const title = String(formData.get("title") || "Untitled");

    // Verify access
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: sessionInner.user.id, workspaceId: wsId },
    });
    if (!member) return;

    const doc = await prisma.document.create({
      data: {
        title,
        workspaceId: wsId,
        createdBy: sessionInner.user.id,
        ownerId: sessionInner.user.id,
      },
      select: { id: true, workspaceId: true },
    });
    redirect(`/workspace/${doc.workspaceId}/documents/${doc.id}`);
  }

  // Create a new workspace action
  async function createWorkspace(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) {
      redirect("/auth/signin");
    }
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    const ws = await prisma.workspace.create({
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
      select: { id: true },
    });
    redirect(`/dashboard`);
  }

  // Accept invite
  async function acceptInvite(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) redirect("/auth/signin");
    const inviteId = String(formData.get("inviteId") || "");
    if (!inviteId) return;
    await fetch(
      `${process.env.NEXTAUTH_URL ?? ""}/api/invites/${inviteId}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      },
    );
    redirect("/dashboard");
  }

  // Decline invite
  async function declineInvite(formData: FormData) {
    "use server";
    const sessionInner = await getSession();
    if (!sessionInner?.user) redirect("/auth/signin");
    const inviteId = String(formData.get("inviteId") || "");
    if (!inviteId) return;
    await fetch(
      `${process.env.NEXTAUTH_URL ?? ""}/api/invites/${inviteId}/decline`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      },
    );
    redirect("/dashboard");
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
        Dashboard
      </h1>

      <DashboardClient
        memberships={memberships}
        recentDocuments={recentDocuments}
        userId={session.user.id}
      />

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Create Workspace
        </h2>
        <form
          action={createWorkspace}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            name="name"
            placeholder="Workspace name"
            required
            style={{
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 6,
              flex: 1,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 12px",
              background: "#111827",
              color: "white",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Create
          </button>
        </form>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          New Document
        </h2>
        {memberships.length === 0 ? (
          <div style={{ color: "#666" }}>
            No workspace to create a document.
          </div>
        ) : (
          <form
            action={createDoc}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <select
              name="workspaceId"
              defaultValue={memberships[0]?.workspace.id}
              style={{
                padding: 8,
                border: "1px solid #ddd",
                borderRadius: 6,
              }}
            >
              {memberships.map((m: any) => (
                <option key={m.workspace.id} value={m.workspace.id}>
                  {m.workspace.name}
                </option>
              ))}
            </select>
            <input
              name="title"
              placeholder="Untitled"
              style={{
                padding: 8,
                border: "1px solid #ddd",
                borderRadius: 6,
                flex: 1,
              }}
            />
            <button
              type="submit"
              style={{
                padding: "8px 12px",
                background: "#2563eb",
                color: "white",
                border: 0,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Create
            </button>
          </form>
        )}
      </section>

      {invites && invites.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Pending Invites
          </h2>
          <div style={{ color: "#666" }}>
            You have {invites.length} pending invite
            {invites.length !== 1 ? "s" : ""}. Check your email.
          </div>
        </section>
      )}
    </div>
  );
}
