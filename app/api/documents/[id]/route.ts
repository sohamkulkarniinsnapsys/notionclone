// src/app/api/documents/[id]/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
 */
export async function GET(req: Request, context: ContextWithParams) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const resolved = await resolveParams(context);
    const id = resolved?.id;
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        yjsSnapshot: true,
        workspaceId: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Check if user has access to this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId: doc.workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const snapshotBase64 = doc.yjsSnapshot
      ? Buffer.from(doc.yjsSnapshot).toString("base64")
      : null;

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        workspaceId: doc.workspaceId,
        ownerId: doc.ownerId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      snapshotBase64,
    });
  } catch (err) {
    console.error("GET /api/documents/[id] error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * POST /api/documents/[id]
 * Accepts binary body and persists as yjsSnapshot  
 */
export async function POST(req: Request, context: ContextWithParams) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const resolved = await resolveParams(context);
    const id = resolved?.id;
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    // Check document exists and user has access
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { workspaceId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId: doc.workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const arrayBuffer = await req.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const updated = await prisma.document.update({
      where: { id },
      data: { yjsSnapshot: bytes },
    });

    return NextResponse.json({ ok: true, id: updated.id });
  } catch (err: unknown) {
    // P2025 is Prisma "Record to update not found"
    const prismaError = err as { code?: string };
    if (prismaError?.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("POST /api/documents/[id] error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
