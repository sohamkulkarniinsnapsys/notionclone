// app/api/documents/[id]/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";

const YWS_ADMIN_TOKEN = process.env.YWS_ADMIN_TOKEN;
const YWS_URL = process.env.YWS_URL || "ws://localhost:1234";

/**
 * Close Yjs room on WebSocket server
 */
async function closeYjsRoom(documentId: string): Promise<void> {
  if (!YWS_ADMIN_TOKEN) {
    console.warn("YWS_ADMIN_TOKEN not configured, skipping WS cleanup");
    return;
  }

  try {
    // Convert ws:// to http:// for admin endpoint
    const adminUrl = YWS_URL.replace("ws://", "http://").replace(
      "wss://",
      "https://",
    );
    const response = await fetch(`${adminUrl}/admin/close-room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${YWS_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ documentId }),
    });

    if (!response.ok) {
      console.error(
        "Failed to close WS room:",
        response.status,
        response.statusText,
      );
    } else {
      console.log(`Successfully closed WS room for document: ${documentId}`);
    }
  } catch (error) {
    console.error("Error closing WS room:", error);
    // Don't throw - we still want to delete the document even if WS cleanup fails
  }
}

/**
 * DELETE /api/documents/[id]/delete
 * Delete a document (requires admin or owner role)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;

    // Authenticate and check permissions
    const { userId } = await requireAuthSession();

    // Check if document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        workspaceId: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Require admin or owner role
    await apiRequireRole({
      resourceType: "document",
      resourceId: documentId,
      minimumRole: ROLES.ADMIN,
    });

    // Close WebSocket room before deleting
    await closeYjsRoom(documentId);

    // Delete document (cascades to collaborators, snapshots, etc.)
    await prisma.document.delete({
      where: { id: documentId },
    });

    console.log(`Document deleted: ${documentId} by user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error: any) {
    console.error("Document deletion error:", error);

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
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/documents/[id]/delete
 * Alternative endpoint for clients that can't send DELETE with body
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return DELETE(request, { params });
}
