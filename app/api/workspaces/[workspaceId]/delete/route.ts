// app/api/workspaces/[workspaceId]/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";

const YWS_ADMIN_TOKEN = process.env.YWS_ADMIN_TOKEN;
const YWS_URL = process.env.YWS_URL || "ws://localhost:1234";

/**
 * Close all Yjs rooms for documents in a workspace
 */
async function closeWorkspaceRooms(workspaceId: string): Promise<void> {
  if (!YWS_ADMIN_TOKEN) {
    console.warn("YWS_ADMIN_TOKEN not configured, skipping WS cleanup");
    return;
  }

  try {
    // Get all documents in the workspace
    const documents = await prisma.document.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    // Convert ws:// to http:// for admin endpoint
    const adminUrl = YWS_URL.replace("ws://", "http://").replace(
      "wss://",
      "https://",
    );

    // Close each document room
    const closePromises = documents.map(async (doc) => {
      try {
        const response = await fetch(`${adminUrl}/admin/close-room`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${YWS_ADMIN_TOKEN}`,
          },
          body: JSON.stringify({ documentId: doc.id }),
        });

        if (response.ok) {
          console.log(`Closed WS room for document: ${doc.id}`);
        }
      } catch (error) {
        console.error(`Failed to close room for document ${doc.id}:`, error);
      }
    });

    await Promise.allSettled(closePromises);
  } catch (error) {
    console.error("Error closing workspace rooms:", error);
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/delete
 * Delete a workspace and all its documents (requires owner role)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;

    // Authenticate and check permissions
    const { userId } = await requireAuthSession();

    // Check if workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        _count: {
          select: {
            documents: true,
            members: true,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );
    }

    // Only workspace owner can delete workspace
    if (workspace.ownerId !== userId) {
      return NextResponse.json(
        { error: "Forbidden: Only workspace owner can delete workspace" },
        { status: 403 },
      );
    }

    // Close all WebSocket rooms before deleting
    await closeWorkspaceRooms(workspaceId);

    // Delete workspace (cascades to documents, members, invites, etc.)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    console.log(`Workspace deleted: ${workspaceId} by user ${userId}`);
    console.log(`  - ${workspace._count.documents} documents deleted`);
    console.log(`  - ${workspace._count.members} members removed`);

    return NextResponse.json({
      success: true,
      message: "Workspace deleted successfully",
      deletedDocuments: workspace._count.documents,
      removedMembers: workspace._count.members,
    });
  } catch (error: any) {
    console.error("Workspace deletion error:", error);

    if (error.message?.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error.message?.includes("Forbidden")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to delete workspace" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/delete
 * Alternative endpoint for clients that can't send DELETE with body
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return DELETE(request, { params });
}
