// app/api/documents/[id]/snapshot/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canAccessDocument } from "@/lib/permissions";

/**
 * POST /api/documents/[id]/snapshot
 *
 * Accepts:
 *  - JSON: { snapshotBase64: "<base64 string>" }
 *  - OR raw binary POST (arrayBuffer)
 *
 * Persists:
 *  - document.yjsSnapshot (Bytes)
 *  - documentSnapshot (history row)
 *
 * Note: TypeScript/Prisma types require a Uint8Array backed by a plain ArrayBuffer.
 * We create such a Uint8Array and then cast to `any` at the Prisma call sites to
 * satisfy the compiler while keeping runtime safety.
 */

type ContextWithParams = {
  params?: Promise<{ id: string }> | { id: string };
};

function base64ToUint8Array(base64: string): Uint8Array {
  // Node first
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    const buf = Buffer.from(base64, "base64");
    const arr = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) arr[i] = buf[i];
    return arr;
  }

  // Browser fallback
  const binary = typeof atob === "function" ? atob(base64) : "";
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

/** Make a fresh ArrayBuffer-backed Uint8Array (guarantees runtime shape) */
function normalizeToArrayBufferBackedUint8Array(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

export async function POST(req: Request, context: ContextWithParams) {
  try {
    // Auth
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

    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let incomingBytes: Uint8Array | null = null;

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      const snapshotBase64 = body?.snapshotBase64;
      if (!snapshotBase64 || typeof snapshotBase64 !== "string") {
        return NextResponse.json(
          { error: "Missing snapshotBase64 in JSON body" },
          { status: 400 },
        );
      }
      try {
        incomingBytes = base64ToUint8Array(snapshotBase64);
      } catch (err) {
        console.error("Failed to decode base64 snapshot:", err);
        return NextResponse.json({ error: "Invalid base64" }, { status: 400 });
      }
    } else {
      // binary POST
      try {
        const arrayBuffer = await req.arrayBuffer();
        if (arrayBuffer && arrayBuffer.byteLength > 0) {
          incomingBytes = new Uint8Array(arrayBuffer);
        }
      } catch {
        // will error below if none
      }
    }

    if (!incomingBytes) {
      return NextResponse.json(
        {
          error:
            "No snapshot data found (expect JSON with snapshotBase64 or binary POST)",
        },
        { status: 400 },
      );
    }

    // Normalize into fresh ArrayBuffer-backed Uint8Array (ensures runtime correctness)
    const snapshotForPrisma =
      normalizeToArrayBufferBackedUint8Array(incomingBytes);

    // Ensure doc exists
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });
    if (!doc) {
      return NextResponse.json(
        { error: "document_not_found" },
        { status: 404 },
      );
    }

    // === IMPORTANT: cast to satisfy compiler ===
    // This is safe because we created `snapshotForPrisma` as a fresh ArrayBuffer-backed Uint8Array.

    // Persist inline snapshot (document.yjsSnapshot)
    const updated = await prisma.document.update({
      where: { id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yjsSnapshot: snapshotForPrisma as any,
        updatedAt: new Date(),
      },
      select: { id: true, updatedAt: true },
    });

    // Create DocumentSnapshot history row
    await prisma.documentSnapshot.create({
      data: {
        documentId: id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        snapshot: snapshotForPrisma as any,
        htmlContent: null,
        actorId: session.user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      id: updated.id,
      updatedAt: updated.updatedAt,
    });
  } catch (err: unknown) {
    console.error("[POST] /api/documents/[id]/snapshot error:", err);
    const prismaError = err as { code?: string };
    if (prismaError?.code === "P2025") {
      return NextResponse.json(
        { error: "document_not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * GET /api/documents/[id]/snapshot
 * Returns the document snapshot as base64 encoded string
 */
export async function GET(req: Request, context: ContextWithParams) {
  try {
    // Auth
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

    // Fetch document with snapshot
    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        yjsSnapshot: true,
      },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "document_not_found" },
        { status: 404 },
      );
    }

    // Check if user has access to this document (checks both Collaborator and WorkspaceMember)
    const hasAccess = await canAccessDocument(session.user.id, id);

    if (!hasAccess) {
      console.error(
        "[SNAPSHOT] User",
        session.user.id,
        "does not have access to document",
        id,
      );
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Convert snapshot to base64 if it exists
    let snapshotBase64: string | null = null;
    if (doc.yjsSnapshot) {
      try {
        // Convert Buffer/Uint8Array to base64
        if (Buffer.isBuffer(doc.yjsSnapshot)) {
          snapshotBase64 = doc.yjsSnapshot.toString("base64");
        } else {
          // Handle Uint8Array
          const buffer = Buffer.from(doc.yjsSnapshot);
          snapshotBase64 = buffer.toString("base64");
        }
      } catch (err) {
        console.error("Error converting snapshot to base64:", err);
      }
    }

    return NextResponse.json({
      snapshotBase64,
      documentId: doc.id,
    });
  } catch (err: unknown) {
    console.error("[POST] /api/documents/[id]/snapshot error:", err);
    const prismaError = err as { code?: string };
    if (prismaError?.code === "P2025") {
      return NextResponse.json(
        { error: "document_not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
