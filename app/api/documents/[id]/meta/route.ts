// app/api/documents/[id]/meta/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canAccessDocument } from "@/lib/permissions";

type ContextWithParams = {
  params?: Promise<{ id: string }> | { id: string };
};

/**
 * GET /api/documents/[id]/meta
 * Returns document metadata (title, owner, timestamps) without the large snapshot data
 */
export async function GET(req: Request, context: ContextWithParams) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Resolve params which may be Promise or plain object
    const maybeParams = context?.params;
    const params =
      maybeParams && "then" in maybeParams ? await maybeParams : maybeParams;
    const id = params?.id;

    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    // Fetch document metadata (excluding large snapshot field)
    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Check if user has access to this document (checks both Collaborator and WorkspaceMember)
    const hasAccess = await canAccessDocument(session.user.id, id);

    if (!hasAccess) {
      console.error(
        "[META] User",
        session.user.id,
        "does not have access to document",
        id,
      );
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        workspaceId: doc.workspaceId,
        ownerId: doc.ownerId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error("GET /api/documents/[id]/meta error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
