// src/app/api/documents/[id]/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getDocumentWithBreadcrumb,
  saveDocumentSnapshot,
  getDocumentSnapshot,
} from "@/lib/services/documentService";
import { checkDocumentPermission } from "@/lib/services/permissions";

type ContextWithParams = {
  params?: Promise<{ id: string }> | { id: string };
};

async function resolveParams(context: ContextWithParams) {
  // Next.js sometimes provides context.params as a plain object or as a Promise.
  const maybePromise = context?.params;
  if (!maybePromise) return null;
  if ("then" in maybePromise && typeof maybePromise.then === "function") {
    return await maybePromise;
  }
  return maybePromise;
}

/**
 * GET /api/documents/[id]
 * Returns document with breadcrumb trail and permission flags
 */
export async function GET(req: Request, context: ContextWithParams) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - Authentication required" },
        { status: 401 },
      );
    }

    const resolved = await resolveParams(context);
    const id = resolved?.id;
    if (!id) {
      return NextResponse.json(
        { error: "Missing document ID" },
        { status: 400 },
      );
    }

    // Get document with breadcrumb and permissions using service
    const documentData = await getDocumentWithBreadcrumb(id, session.user.id);

    if (!documentData) {
      // Check if document exists
      const permissions = await checkDocumentPermission(session.user.id, id);

      if (!permissions.canView) {
        return NextResponse.json(
          {
            error: "Forbidden - You do not have access to this document",
            permissions: {
              canView: false,
              canEdit: false,
              canAdmin: false,
              isOwner: false,
            },
          },
          { status: 403 },
        );
      }

      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Get snapshot separately
    const snapshotData = await getDocumentSnapshot(id, session.user.id);
    const snapshotBase64 = snapshotData?.snapshot
      ? Buffer.from(snapshotData.snapshot).toString("base64")
      : null;

    // Return document with breadcrumb and permissions
    return NextResponse.json({
      document: {
        id: documentData.id,
        title: documentData.title,
        workspaceId: documentData.workspaceId,
        ownerId: documentData.ownerId,
        createdAt: documentData.createdAt.toISOString(),
        updatedAt: documentData.updatedAt.toISOString(),
      },
      breadcrumb: documentData.breadcrumb,
      permissions: {
        canView: documentData.permissions.canView,
        canEdit: documentData.permissions.canEdit,
        canAdmin: documentData.permissions.canAdmin,
        isOwner: documentData.permissions.isOwner,
      },
      snapshotBase64,
    });
  } catch (err) {
    console.error("GET /api/documents/[id] error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/documents/[id]
 * Save document snapshot - requires edit permission
 */
export async function POST(req: Request, context: ContextWithParams) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - Authentication required" },
        { status: 401 },
      );
    }

    const resolved = await resolveParams(context);
    const id = resolved?.id;
    if (!id) {
      return NextResponse.json(
        { error: "Missing document ID" },
        { status: 400 },
      );
    }

    // Check permissions using service
    const permissions = await checkDocumentPermission(session.user.id, id);

    if (!permissions.canEdit) {
      return NextResponse.json(
        {
          error:
            "Forbidden - You do not have edit permission for this document",
          permissions: {
            canView: permissions.canView,
            canEdit: false,
            canAdmin: permissions.canAdmin,
            isOwner: permissions.isOwner,
          },
        },
        { status: 403 },
      );
    }

    // Read binary snapshot data
    const arrayBuffer = await req.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    // Save snapshot using service
    const saved = await saveDocumentSnapshot(id, session.user.id, bytes);

    if (!saved) {
      return NextResponse.json(
        { error: "Failed to save document snapshot" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id,
      savedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("POST /api/documents/[id] error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/documents/[id]
 * Delete document - requires admin/owner permission
 */
export async function DELETE(req: Request, context: ContextWithParams) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - Authentication required" },
        { status: 401 },
      );
    }

    const resolved = await resolveParams(context);
    const id = resolved?.id;
    if (!id) {
      return NextResponse.json(
        { error: "Missing document ID" },
        { status: 400 },
      );
    }

    // Check permissions
    const permissions = await checkDocumentPermission(session.user.id, id);

    if (!permissions.canAdmin && !permissions.isOwner) {
      return NextResponse.json(
        {
          error:
            "Forbidden - Only document owners or admins can delete documents",
        },
        { status: 403 },
      );
    }

    // Use document service to delete
    const { deleteDocument } = await import("@/lib/services/documentService");
    const deleted = await deleteDocument(id, session.user.id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete document" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id,
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("DELETE /api/documents/[id] error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
