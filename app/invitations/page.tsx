// app/invitations/page.tsx
"use server";

import { redirect } from "next/navigation";
import InvitationsClient from "@/components/InvitationsClient";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function InvitationsPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Fetch pending invites for this user's email
  let invites: any[] = [];
  try {
    const prismaAny = prisma as any;
    if (session.user.email && prismaAny?.invite?.findMany) {
      invites = await prismaAny.invite.findMany({
        where: { email: session.user.email, status: "pending" },
        include: {
          workspace: {
            select: { id: true, name: true, ownerId: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }
  } catch (e) {
    invites = [];
  }

  // Make invites serializable for passing to client component
  const serializableInvites = invites.map((inv: any) => ({
    id: inv.id,
    workspaceId: inv.workspaceId,
    workspaceName: inv.workspace?.name ?? null,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    token: inv.token,
    createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
    expiresAt: inv.expiresAt ? inv.expiresAt.toISOString() : null,
  }));

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          Invitations
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Accept or decline workspace / document invitations sent to{" "}
          <strong>{session.user.email}</strong>
        </p>
      </div>

      <InvitationsClient invites={serializableInvites} />
    </div>
  );
}
