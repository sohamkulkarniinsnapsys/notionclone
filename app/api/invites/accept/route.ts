// app/api/invites/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession } from "@/lib/permissions";
import { addDocumentCollaborator } from "@/lib/permissions";

/**
 * GET /api/invites/accept?token=xxx
 * Accept an invite (requires authentication)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");

    console.log("[INVITE] Accept invite request received, token:", token);

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Try to get authenticated user
    let userId: string | null = null;
    let userEmail: string | null = null;

    try {
      const auth = await requireAuthSession();
      userId = auth.userId;
      userEmail = auth.userEmail;
      console.log("[INVITE] Authenticated user:", userId, userEmail);
    } catch (error) {
      console.log("[INVITE] User not authenticated, redirecting to sign in");
      // Not authenticated - redirect to sign in with token preserved
      const signInUrl = new URL("/auth/signin", request.url);
      signInUrl.searchParams.set(
        "callbackUrl",
        `/api/invites/accept?token=${token}`,
      );
      return NextResponse.redirect(signInUrl);
    }

    // Find invite by token
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invite) {
      console.log("[INVITE] Invite not found for token:", token);
      return NextResponse.json(
        { error: "Invalid or expired invite" },
        { status: 404 },
      );
    }

    console.log("[INVITE] Found invite:", {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      documentId: invite.documentId,
      workspaceId: invite.workspaceId,
    });

    // Check if invite is expired
    if (invite.expiresAt < new Date()) {
      console.log("[INVITE] Invite expired at:", invite.expiresAt);
      // Mark as expired
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      });

      return NextResponse.json(
        { error: "This invite has expired" },
        { status: 410 },
      );
    }

    // Check if invite is already accepted
    if (invite.status === "accepted") {
      // Redirect to appropriate page
      if (invite.documentId) {
        const doc = await prisma.document.findUnique({
          where: { id: invite.documentId },
          select: { workspaceId: true },
        });
        if (doc) {
          return NextResponse.redirect(
            new URL(
              `/workspace/${doc.workspaceId}/documents/${invite.documentId}`,
              request.url,
            ),
          );
        }
      } else if (invite.workspaceId) {
        return NextResponse.redirect(
          new URL(`/workspace/${invite.workspaceId}`, request.url),
        );
      }

      return NextResponse.json(
        { error: "This invite has already been accepted" },
        { status: 400 },
      );
    }

    // Check if invite email matches user email
    if (invite.email !== userEmail) {
      console.log(
        "[INVITE] Email mismatch - invite:",
        invite.email,
        "user:",
        userEmail,
      );
      return NextResponse.json(
        {
          error: "This invite was sent to a different email address",
          inviteEmail: invite.email,
          userEmail,
        },
        { status: 403 },
      );
    }

    console.log("[INVITE] Email verified, processing invite...");

    // Accept workspace invite
    if (invite.workspaceId) {
      // Check if already a member
      const existingMember = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: invite.workspaceId,
          },
        },
      });

      if (!existingMember) {
        // Add as workspace member
        await prisma.workspaceMember.create({
          data: {
            userId,
            workspaceId: invite.workspaceId,
            role: invite.role,
          },
        });
      }

      // Mark invite as accepted
      await prisma.invite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
        },
      });

      console.log(`Workspace invite accepted: ${invite.id} by user ${userId}`);

      // Redirect to workspace
      return NextResponse.redirect(
        new URL(`/workspace/${invite.workspaceId}`, request.url),
      );
    }

    // Accept document invite
    if (invite.documentId) {
      // Get document to find workspace
      const document = await prisma.document.findUnique({
        where: { id: invite.documentId },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!document) {
        console.log("[INVITE] Document not found:", invite.documentId);
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 },
        );
      }

      console.log("[INVITE] Document found, workspace:", document.workspaceId);

      // Check if already a collaborator
      const existingCollaborator = await prisma.collaborator.findUnique({
        where: {
          userId_documentId: {
            userId,
            documentId: invite.documentId,
          },
        },
      });

      if (!existingCollaborator) {
        console.log("[INVITE] User is not a collaborator yet, adding...");
        console.log("[INVITE] Original role from invite:", invite.role);

        // Add as document collaborator
        // Convert role to lowercase for Prisma
        const roleMap: Record<string, "viewer" | "editor" | "admin" | "owner"> =
          {
            VIEWER: "viewer",
            EDITOR: "editor",
            ADMIN: "admin",
            OWNER: "owner",
            viewer: "viewer",
            editor: "editor",
            admin: "admin",
            owner: "owner",
          };
        const normalizedRole = roleMap[invite.role] || "viewer";

        console.log("[INVITE] Normalized role:", normalizedRole);
        console.log("[INVITE] Calling addDocumentCollaborator with:", {
          documentId: invite.documentId,
          userId,
          role: normalizedRole,
        });

        try {
          const result = await addDocumentCollaborator(
            invite.documentId,
            userId,
            normalizedRole,
          );
          console.log("[INVITE] ✅ Successfully added collaborator:", result);
        } catch (error) {
          console.error("[INVITE] ❌ Failed to add collaborator:", error);
          throw error;
        }

        console.log(
          `[INVITE] Added user ${userId} as ${normalizedRole} collaborator to document ${invite.documentId}`,
        );
      } else {
        console.log(
          "[INVITE] User is already a collaborator:",
          existingCollaborator,
        );
      }

      // Mark invite as accepted
      console.log("[INVITE] Marking invite as accepted...");
      await prisma.invite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
        },
      });

      console.log(
        `[INVITE] ✅ Document invite accepted: ${invite.id} by user ${userId}`,
      );

      // Redirect to document
      console.log("[INVITE] Redirecting to document:", invite.documentId);
      return NextResponse.redirect(
        new URL(
          `/workspace/${document.workspaceId}/documents/${invite.documentId}`,
          request.url,
        ),
      );
    }

    console.log(
      "[INVITE] ❌ Invalid invite type - neither workspace nor document",
    );
    return NextResponse.json({ error: "Invalid invite type" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[INVITE] ❌ Accept invite error:", error);

    const err = error as { message?: string };
    if (err.message?.includes("Unauthorized")) {
      // Redirect to sign in
      const signInUrl = new URL("/auth/signin", request.url);
      const token = request.nextUrl.searchParams.get("token");
      if (token) {
        signInUrl.searchParams.set(
          "callbackUrl",
          `/api/invites/accept?token=${token}`,
        );
      }
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}
