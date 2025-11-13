// app/api/documents/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/documents?workspaceId=xxx
 * List all documents in a workspace that the user has access to
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "missing_workspace_id" },
        { status: 400 },
      );
    }

    // Check if user has access to this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Get all documents in the workspace
    const documents = await prisma.document.findMany({
      where: { workspaceId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (err) {
    console.error("GET /api/documents error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Create a new document in a workspace
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, title } = body;

    if (!workspaceId || !title) {
      return NextResponse.json(
        { error: "missing_required_fields" },
        { status: 400 },
      );
    }

    // Check if user has access to this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Create the document
    const document = await prisma.document.create({
      data: {
        title,
        workspaceId,
        createdBy: session.user.id,
        ownerId: session.user.id,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
