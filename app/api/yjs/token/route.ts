// WebSocket token generation endpoint
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { canAccessDocument } from "@/lib/permissions";

/**
 * GET /api/yjs/token?docId=xxx
 * Generate a short-lived JWT token for WebSocket authentication
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("docId");

    if (!docId) {
      console.error("[TOKEN] Missing docId parameter");
      return NextResponse.json({ error: "missing_doc_id" }, { status: 400 });
    }

    console.log(
      "[TOKEN] Request for docId:",
      docId,
      "userId:",
      session.user.id,
    );

    // Check if document exists and user has access
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { workspaceId: true },
    });

    if (!doc) {
      console.error("[TOKEN] Document not found:", docId);
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    console.log("[TOKEN] Document found, workspaceId:", doc.workspaceId);

    // Check if user has access to this document (checks both Collaborator and WorkspaceMember)
    const hasAccess = await canAccessDocument(session.user.id, docId);

    if (!hasAccess) {
      console.error(
        "[TOKEN] User",
        session.user.id,
        "does not have access to document",
        docId,
      );
      console.error("[TOKEN] Checking all permissions for user...");

      // Debug: Check all permissions for this user
      const allMemberships = await prisma.workspaceMember.findMany({
        where: { userId: session.user.id },
        select: { workspaceId: true, role: true },
      });
      const allCollaborations = await prisma.collaborator.findMany({
        where: { userId: session.user.id },
        select: { documentId: true, role: true },
      });
      console.error(
        "[TOKEN] User workspace memberships:",
        JSON.stringify(allMemberships, null, 2),
      );
      console.error(
        "[TOKEN] User document collaborations:",
        JSON.stringify(allCollaborations, null, 2),
      );

      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    console.log("[TOKEN] Access verified for user:", session.user.id);

    // Generate JWT token (expires in 15 minutes)
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("[TOKEN] NEXTAUTH_SECRET not configured");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    const token = jwt.sign(
      {
        docId,
        userId: session.user.id,
        email: session.user.email,
      },
      secret,
      { expiresIn: "15m" },
    );

    console.log(
      "[TOKEN] Token generated successfully for user:",
      session.user.id,
    );
    return NextResponse.json({ token });
  } catch (err) {
    console.error("[TOKEN] GET /api/yjs/token error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
