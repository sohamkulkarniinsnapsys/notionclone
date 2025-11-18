// app/api/documents/[id]/snapshot/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkDocumentPermission } from "@/lib/services/permissions";
import {
  getDocumentSnapshot,
  saveDocumentSnapshot,
} from "@/lib/services/documentService";

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
 * SECURITY: Requires canEdit permission
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

    // Resolve params which may be Promise or plain object
    const maybeParams = context?.params;
    const params =
      maybeParams && "then" in maybeParams ? await maybeParams : maybeParams;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: "Missing document ID" },
        { status: 400 },
      );
    }

    // SECURITY: Check permissions BEFORE accepting any data
    const permissions = await checkDocumentPermission(session.user.id, id);

    if (!permissions.canEdit) {
      console.warn(
        `[SNAPSHOT] User ${session.user.id} attempted to save snapshot for document ${id} without edit permission`,
      );
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

    // Parse incoming snapshot data
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

    // Normalize into fresh ArrayBuffer-backed Uint8Array
    const snapshotForPrisma =
      normalizeToArrayBufferBackedUint8Array(incomingBytes);
    const buffer = Buffer.from(snapshotForPrisma);

    // Save snapshot using service (includes permission check)
    const saved = await saveDocumentSnapshot(id, session.user.id, buffer);

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
    console.error("[POST] /api/documents/[id]/snapshot error:", err);
    const prismaError = err as { code?: string };
    if (prismaError?.code === "P2025") {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/documents/[id]/snapshot
 * Returns the document snapshot as base64 encoded string
 *
 * SECURITY: Requires canView permission
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

    // Resolve params which may be Promise or plain object
    const maybeParams = context?.params;
    const params =
      maybeParams && "then" in maybeParams ? await maybeParams : maybeParams;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: "Missing document ID" },
        { status: 400 },
      );
    }

    // SECURITY: Check permissions BEFORE returning any data
    const permissions = await checkDocumentPermission(session.user.id, id);

    if (!permissions.canView) {
      console.warn(
        `[SNAPSHOT] User ${session.user.id} attempted to view snapshot for document ${id} without view permission`,
      );
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

    // Get snapshot using service (includes permission check)
    const snapshotData = await getDocumentSnapshot(id, session.user.id);

    if (!snapshotData) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Convert snapshot to base64 if it exists
    let snapshotBase64: string | null = null;
    if (snapshotData.snapshot) {
      try {
        if (Buffer.isBuffer(snapshotData.snapshot)) {
          snapshotBase64 = snapshotData.snapshot.toString("base64");
        } else {
          // Handle Uint8Array
          const buffer = Buffer.from(snapshotData.snapshot);
          snapshotBase64 = buffer.toString("base64");
        }
      } catch (err) {
        console.error("Error converting snapshot to base64:", err);
      }
    }

    return NextResponse.json({
      snapshotBase64,
      documentId: id,
      permissions: {
        canView: snapshotData.permissions.canView,
        canEdit: snapshotData.permissions.canEdit,
        canAdmin: snapshotData.permissions.canAdmin,
        isOwner: snapshotData.permissions.isOwner,
      },
    });
  } catch (err: unknown) {
    console.error("[GET] /api/documents/[id]/snapshot error:", err);
    const prismaError = err as { code?: string };
    if (prismaError?.code === "P2025") {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
