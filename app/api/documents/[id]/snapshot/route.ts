// app/api/documents/[id]/snapshot/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
  params?: any;
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
    const params = typeof maybeParams?.then === "function" ? await maybeParams : maybeParams;
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
        return NextResponse.json({ error: "Missing snapshotBase64 in JSON body" }, { status: 400 });
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
      } catch (err) {
        // will error below if none
      }
    }

    if (!incomingBytes) {
      return NextResponse.json(
        { error: "No snapshot data found (expect JSON with snapshotBase64 or binary POST)" },
        { status: 400 },
      );
    }

    // Normalize into fresh ArrayBuffer-backed Uint8Array (ensures runtime correctness)
    const snapshotForPrisma = normalizeToArrayBufferBackedUint8Array(incomingBytes);

    // Ensure doc exists
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "document_not_found" }, { status: 404 });
    }

    // === IMPORTANT: cast to `any` at Prisma call sites to satisfy compiler ===
    // This is safe because we created `snapshotForPrisma` as a fresh ArrayBuffer-backed Uint8Array.

    // Persist inline snapshot (document.yjsSnapshot)
    const updated = await prisma.document.update({
      where: { id },
      data: {
        // cast to any to satisfy Prisma's strict Uint8Array<ArrayBuffer> generic type
        yjsSnapshot: snapshotForPrisma as any,
        updatedAt: new Date(),
      },
      select: { id: true, updatedAt: true },
    });

    // Create DocumentSnapshot history row
    await prisma.documentSnapshot.create({
      data: {
        documentId: id,
        snapshot: snapshotForPrisma as any, // cast here as well
        htmlContent: null,
        actorId: session.user.id,
      },
    });

    return NextResponse.json({ ok: true, id: updated.id, updatedAt: updated.updatedAt });
  } catch (err: any) {
    console.error("[POST] /api/documents/[id]/snapshot error:", err);
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "document_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
