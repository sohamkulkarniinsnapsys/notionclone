// apps/frontend/app/api/documents/[id]/persist/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/auth'

async function resolveParams(context: any) {
  const maybePromise = context?.params
  if (!maybePromise) return null
  if (typeof maybePromise.then === 'function') {
    return await maybePromise
  }
  return maybePromise
}

/**
 * POST /api/documents/[id]/persist
 * Accepts Yjs snapshot bytes and persists to database
 */
export async function POST(req: NextRequest, context: any) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const resolved = await resolveParams(context)
    const id = resolved?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    // Check document exists and user has access
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { workspaceId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId: doc.workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Read body as arrayBuffer (raw bytes)
    const arr = await req.arrayBuffer();
    const bytes = Buffer.from(arr)

    // Persist bytes into Prisma (Document.yjsSnapshot)
    const updated = await prisma.document.update({
      where: { id },
      data: { yjsSnapshot: bytes },
    })

    return NextResponse.json({ ok: true, length: arr.byteLength, id: updated.id });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    console.error("persist route error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, context: any) {
  try {
    const resolved = await resolveParams(context)
    const id = resolved?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    // Optional: return a quick health check for the document persistence endpoint
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("persist GET error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
