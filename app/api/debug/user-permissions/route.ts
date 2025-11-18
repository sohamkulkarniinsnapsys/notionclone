// app/api/debug/user-permissions/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canAccessDocument } from "@/lib/permissions";

/**
 * GET /api/debug/user-permissions?docId=xxx
 * Debug endpoint to check user's permissions for a document
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("docId");

    if (!docId) {
      return NextResponse.json(
        { error: "docId parameter required" },
        { status: 400 },
      );
    }

    const userId = session.user.id;

    // Get document info
    const document = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        ownerId: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "document not found" },
        { status: 404 },
      );
    }

    // Check if user is owner
    const isOwner = document.ownerId === userId;

    // Check workspace membership
    const workspaceMembership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: document.workspaceId,
        },
      },
      select: { role: true },
    });

    // Check document collaboration
    const collaborator = await prisma.collaborator.findUnique({
      where: {
        userId_documentId: {
          userId,
          documentId: docId,
        },
      },
      select: { role: true, createdAt: true },
    });

    // Check pending invites
    const pendingInvites = await prisma.invite.findMany({
      where: {
        email: session.user.email || undefined,
        documentId: docId,
        status: "pending",
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    // Use canAccessDocument function
    const hasAccess = await canAccessDocument(userId, docId);

    return NextResponse.json({
      userId,
      userEmail: session.user.email,
      document: {
        id: document.id,
        title: document.title,
        workspaceId: document.workspaceId,
        ownerId: document.ownerId,
      },
      permissions: {
        isOwner,
        hasAccess,
        workspaceMembership: workspaceMembership
          ? { role: workspaceMembership.role }
          : null,
        collaborator: collaborator
          ? { role: collaborator.role, addedAt: collaborator.createdAt }
          : null,
        pendingInvites: pendingInvites.length > 0 ? pendingInvites : null,
      },
      summary: {
        canAccess: hasAccess,
        accessReason: isOwner
          ? "Document owner"
          : collaborator
            ? `Document collaborator (${collaborator.role})`
            : workspaceMembership
              ? `Workspace member (${workspaceMembership.role})`
              : "No access",
      },
    });
  } catch (error) {
    console.error("[DEBUG] Error checking permissions:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
