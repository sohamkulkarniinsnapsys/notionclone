// app/api/documents/[id]/rename/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";

/**
 * POST /api/documents/[id]/rename
 * Rename a document (requires editor role)
 *
 * Additional behavior:
 * - Updates DB (existing)
 * - Notifies collaboration server (y-websocket) via admin broadcast endpoint so
 *   connected clients receive the change in real-time.
 *
 * env:
 * - YWS_HTTP_URL (e.g. http://localhost:1234)
 * - YWS_ADMIN_TOKEN  (shared secret to authenticate to y-websocket admin endpoints)
 */

async function notifyYwsOfTitleChange(documentId: string, title: string) {
  try {
    const ywsUrl = process.env.YWS_HTTP_URL;
    const adminToken = process.env.YWS_ADMIN_TOKEN;
    if (!ywsUrl || !adminToken) {
      // Not configured -> nothing to do, this is optional
      console.warn(
        "[rename] YWS_HTTP_URL or YWS_ADMIN_TOKEN not configured; skipping notify",
      );
      return false;
    }

    const res = await fetch(`${ywsUrl.replace(/\/$/, "")}/admin/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        documentId,
        meta: { title },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[rename] yws notify returned ${res.status}: ${text}`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("[rename] failed to notify y-websocket server:", err);
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { title } = body;

    // Validate title
    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required and must be a string" },
        { status: 400 },
      );
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      return NextResponse.json(
        { error: "Title cannot be empty" },
        { status: 400 },
      );
    }

    if (trimmedTitle.length > 200) {
      return NextResponse.json(
        { error: "Title must be 200 characters or less" },
        { status: 400 },
      );
    }

    // Authenticate and check permissions
    const { userId } = await requireAuthSession();

    // Check if document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        workspaceId: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Require editor role to rename
    await apiRequireRole({
      resourceType: "document",
      resourceId: documentId,
      minimumRole: ROLES.EDITOR,
    });

    // Update document title
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        title: trimmedTitle,
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    console.log(
      `Document renamed: ${documentId} to "${trimmedTitle}" by user ${userId}`,
    );

    // Notify y-websocket server (best-effort, do not fail the request)
    (async () => {
      try {
        const ok = await notifyYwsOfTitleChange(documentId, trimmedTitle);
        if (ok) {
          console.log("[rename] y-websocket notified of title change");
        }
      } catch (err) {
        console.warn("[rename] notifyYwsOfTitleChange threw:", err);
      }
    })();

    return NextResponse.json({
      success: true,
      document: updatedDocument,
    });
  } catch (error: any) {
    console.error("Document rename error:", error);

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
      { error: "Failed to rename document" },
      { status: 500 },
    );
  }
}
