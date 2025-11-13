// app/api/invites/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";
import {
  sendWorkspaceInvite,
  sendDocumentInvite,
  isValidEmail,
  sanitizeEmail,
} from "@/lib/email";
import crypto from "crypto";

// Rate limiting map: email -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // max invites per hour per workspace/document
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function GET() {
  try {
    const { userId, userEmail } = await requireAuthSession();

    // Fetch invites for the current user
    const invites = await prisma.invite.findMany({
      where: {
        email: userEmail,
        status: "pending",
        expiresAt: {
          gte: new Date(),
        },
      },
      include: {
        workspace: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ invites });
  } catch (err: any) {
    console.error("GET /api/invites error", err);

    if (err.message?.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, userEmail: inviterEmail } = await requireAuthSession();
    const body = await request.json();
    const { email, role, workspaceId, documentId } = body;

    // Validate input
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }

    if (
      !role ||
      !["owner", "admin", "editor", "viewer", "member"].includes(role)
    ) {
      return NextResponse.json(
        {
          error:
            "Valid role is required (owner, admin, editor, viewer, member)",
        },
        { status: 400 },
      );
    }

    if (!workspaceId && !documentId) {
      return NextResponse.json(
        { error: "Either workspaceId or documentId must be provided" },
        { status: 400 },
      );
    }

    if (workspaceId && documentId) {
      return NextResponse.json(
        {
          error: "Cannot invite to both workspace and document simultaneously",
        },
        { status: 400 },
      );
    }

    const sanitizedEmail = sanitizeEmail(email);

    // Check if inviting self
    if (sanitizedEmail === inviterEmail) {
      return NextResponse.json(
        { error: "Cannot invite yourself" },
        { status: 400 },
      );
    }

    // Rate limiting
    const rateLimitKey = workspaceId || documentId || "";
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    let inviterName = "A user";
    let resourceName = "";

    // Workspace invite
    if (workspaceId) {
      // Check permissions
      await apiRequireRole({
        resourceType: "workspace",
        resourceId: workspaceId,
        minimumRole: ROLES.ADMIN,
      });

      // Get workspace details
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      });

      if (!workspace) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 },
        );
      }

      resourceName = workspace.name;

      // Check if user is already a member
      const existingMember = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: sanitizedEmail,
            workspaceId,
          },
        },
      });

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a member of this workspace" },
          { status: 400 },
        );
      }

      // Check for existing pending invite
      const existingInvite = await prisma.invite.findFirst({
        where: {
          email: sanitizedEmail,
          workspaceId,
          status: "pending",
          expiresAt: {
            gte: new Date(),
          },
        },
      });

      if (existingInvite) {
        return NextResponse.json(
          { error: "A pending invite already exists for this user" },
          { status: 400 },
        );
      }
    }

    // Document invite
    if (documentId) {
      // Check permissions
      await apiRequireRole({
        resourceType: "document",
        resourceId: documentId,
        minimumRole: ROLES.ADMIN,
      });

      // Get document details
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { title: true },
      });

      if (!document) {
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 },
        );
      }

      resourceName = document.title;

      // Check if user is already a collaborator
      const existingCollaborator = await prisma.collaborator.findUnique({
        where: {
          userId_documentId: {
            userId: sanitizedEmail,
            documentId,
          },
        },
      });

      if (existingCollaborator) {
        return NextResponse.json(
          { error: "User is already a collaborator on this document" },
          { status: 400 },
        );
      }

      // Check for existing pending invite
      const existingInvite = await prisma.invite.findFirst({
        where: {
          email: sanitizedEmail,
          documentId,
          status: "pending",
          expiresAt: {
            gte: new Date(),
          },
        },
      });

      if (existingInvite) {
        return NextResponse.json(
          { error: "A pending invite already exists for this user" },
          { status: 400 },
        );
      }
    }

    // Get inviter name
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    inviterName = inviter?.name || inviter?.email || "A user";

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Set expiration (7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invite
    const invite = await prisma.invite.create({
      data: {
        email: sanitizedEmail,
        token,
        role,
        workspaceId: workspaceId || null,
        documentId: documentId || null,
        status: "pending",
        expiresAt,
        invitedById: userId,
      },
    });

    // Send email
    let emailSent = false;
    try {
      if (workspaceId) {
        emailSent = await sendWorkspaceInvite({
          to: sanitizedEmail,
          inviterName,
          workspaceName: resourceName,
          role,
          token,
          expiresAt,
        });
      } else if (documentId) {
        emailSent = await sendDocumentInvite({
          to: sanitizedEmail,
          inviterName,
          documentTitle: resourceName,
          role,
          token,
          expiresAt,
        });
      }
    } catch (emailError) {
      console.error("Failed to send invite email:", emailError);
      // Don't fail the request if email fails
    }

    console.log(
      `Invite created: ${invite.id} for ${sanitizedEmail} by ${userId}, email sent: ${emailSent}`,
    );

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        emailSent,
      },
    });
  } catch (error: any) {
    console.error("POST /api/invites error", error);

    if (error.message?.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error.message?.includes("Forbidden")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 },
    );
  }
}
