// app/api/documents/[id]/rename/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";

/**
 * POST /api/documents/[id]/rename
 * Rename a document (requires editor role)
 */
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
