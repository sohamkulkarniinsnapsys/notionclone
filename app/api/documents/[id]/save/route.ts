// app/api/documents/[id]/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";
import DOMPurify from "isomorphic-dompurify";

/**
 * Helper: sanitize HTML to prevent XSS
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "a",
      "code",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "img",
      "video",
      "audio",
      "source",
      "div",
      "span",
      "hr",
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "src",
      "alt",
      "width",
      "height",
      "class",
      "id",
      "colspan",
      "rowspan",
      "type",
      "controls",
      "autoplay",
      "loop",
      "muted",
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Validate JSON content shape (basic check for Tiptap doc)
 */
function validateJsonContent(json: any): boolean {
  if (!json || typeof json !== "object") return false;
  if (json.type !== "doc" || !Array.isArray(json.content)) return false;
  return true;
}

/**
 * Decode base64 into a Uint8Array (works in Node and browser).
 */
function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } else {
    // Node environment fallback
    const buf = Buffer.from(base64, "base64");
    const bytes = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) bytes[i] = buf[i];
    return bytes;
  }
}

/**
 * Normalize a Uint8Array (or Buffer like data) into a fresh ArrayBuffer-backed Uint8Array.
 * This guarantees Prisma's Bytes typing (Uint8Array<ArrayBuffer>).
 */
function normalizeToArrayBufferBackedUint8Array(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

/**
 * Create an empty ArrayBuffer-backed Uint8Array (useful when snapshot is optional
 * but DB column is non-nullable)
 */
function createEmptySnapshotBytes(): Uint8Array {
  return new Uint8Array(0);
}

/**
 * POST /api/documents/[id]/save
 * - Accepts: { html?: string, json?: any, clientUpdatedAt?: string, snapshotBase64?: string }
 * - Requires editor role
 * - Saves canonical HTML/JSON, optionally persists Yjs snapshot bytes and a DocumentSnapshot row
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json().catch(() => ({}));
    const { html, json, clientUpdatedAt, snapshotBase64 } = body ?? {};

    // Basic validation
    if (!html && !json && !snapshotBase64) {
      return NextResponse.json(
        { error: "At least one of html, json or snapshotBase64 must be provided" },
        { status: 400 },
      );
    }

    if (html && typeof html !== "string") {
      return NextResponse.json({ error: "HTML must be a string" }, { status: 400 });
    }

    if (json && !validateJsonContent(json)) {
      return NextResponse.json({ error: "Invalid JSON content structure" }, { status: 400 });
    }

    // Authenticate and get user id
    const { userId } = await requireAuthSession();

    // Document existence
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, updatedAt: true, workspaceId: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Require role
    await apiRequireRole({
      resourceType: "document",
      resourceId: documentId,
      minimumRole: ROLES.EDITOR,
    });

    // Concurrent edit check (optional)
    if (clientUpdatedAt) {
      const clientTime = new Date(clientUpdatedAt);
      if (document.updatedAt > clientTime) {
        console.warn(
          `Potential conflict: document updated at ${document.updatedAt}, client at ${clientTime}`,
        );
        // We allow the save but log the warning — you can change to reject stale saves
      }
    }

    // Sanitize HTML
    const sanitizedHtml = html ? sanitizeHtml(html) : null;

    // Prepare update data (for document row)
    const updateData: any = {};
    if (sanitizedHtml) updateData.htmlContent = sanitizedHtml;
    if (json) updateData.contentJson = json;

    // If client provided a snapshotBase64, decode and normalize it and write to document.yjsSnapshot
    let snapshotBytesForPrisma: Uint8Array | null = null;
    if (snapshotBase64 && typeof snapshotBase64 === "string") {
      try {
        const decoded = base64ToUint8Array(snapshotBase64);
        snapshotBytesForPrisma = normalizeToArrayBufferBackedUint8Array(decoded);
        // persist inline yjsSnapshot as well
        updateData.yjsSnapshot = snapshotBytesForPrisma;
      } catch (err) {
        console.error("Invalid snapshotBase64 provided:", err);
        return NextResponse.json({ error: "Invalid snapshotBase64" }, { status: 400 });
      }
    }

    // If no snapshot provided, we won't set yjsSnapshot (leave existing) — unless you prefer to clear it.
    // Now update the Document row
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: updateData,
      select: { id: true, title: true, updatedAt: true },
    });

    // Prepare documentSnapshot creation data.
    // DocumentSnapshot.snapshot is NOT nullable in your schema — so supply either the provided snapshot bytes
    // or an empty Uint8Array(0).
    const snapshotPayload: Uint8Array =
      snapshotBytesForPrisma ?? createEmptySnapshotBytes();

    // Build snapshot create object; include jsonContent only when json provided
    const snapshotCreateData: any = {
      documentId,
      snapshot: snapshotPayload,
      htmlContent: sanitizedHtml ?? null,
      actorId: userId,
    };
    if (json) snapshotCreateData.jsonContent = json;

    const snapshot = await prisma.documentSnapshot.create({
      data: snapshotCreateData,
      select: { id: true, createdAt: true },
    });

    console.log(`Document saved: ${documentId} by user ${userId}, snapshot: ${snapshot.id}`);

    return NextResponse.json({
      success: true,
      document: updatedDocument,
      snapshot: { id: snapshot.id, createdAt: snapshot.createdAt },
    });
  } catch (error: any) {
    console.error("Document save error:", error);

    if (error.message?.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message?.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
  }
}
