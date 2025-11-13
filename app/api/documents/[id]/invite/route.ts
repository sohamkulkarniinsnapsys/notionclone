import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";
import { sendEmail } from "@/lib/email/gmail";
import crypto from "crypto";

/**
 * POST /api/documents/[id]/invite
 * Invite a user to collaborate on a document
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { email, role } = body;

    // Validate input
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required and must be a string" }, { status: 400 });
    }

    if (!role || !["VIEWER", "EDITOR", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Invalid role. Must be VIEWER, EDITOR, or ADMIN" }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail.length === 0) {
      return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Authenticate and check permissions
    const { userId } = await requireAuthSession();

    // Check if document exists and get workspace info
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        workspaceId: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Require at least EDITOR role to invite others
    await apiRequireRole({
      resourceType: "document",
      resourceId: documentId,
      minimumRole: ROLES.EDITOR,
    });

    // For now, we'll check by email in invites
    const existingInvite = await prisma.invite.findFirst({
      where: {
        documentId: documentId,
        email: trimmedEmail,
        status: "pending",
      },
    });

    if (existingInvite) {
      return NextResponse.json({ error: "An invitation is already pending for this email" }, { status: 409 });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString("hex");

    // Create invite
    const invite = await prisma.invite.create({
      data: {
        documentId: documentId,
        workspaceId: document.workspaceId,
        email: trimmedEmail,
        role: role,
        token: token,
        invitedById: userId,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    console.log(
      `Invite created: ${invite.id} for ${trimmedEmail} to document ${documentId} by user ${userId}`,
    );

    // Get inviter information
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // Try to fetch the inviter's Google account refresh token from the Account table (NextAuth)
    const googleAccount = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: "google",
      },
      select: {
        refresh_token: true, // match your prisma schema field name
        access_token: true,
      },
    });

    const perUserRefreshToken = (googleAccount as any)?.refresh_token ?? undefined;

    // Also allow fallback env var: GMAIL_REFRESH_TOKEN or REFRESH_TOKEN
    const systemRefreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.REFRESH_TOKEN || undefined;

    const usedSource = perUserRefreshToken ? "per-user" : (systemRefreshToken ? "system" : "none");
    if (usedSource === "none") {
      console.warn("[Invite] No refresh token available — invites will be created but email won't be sent.");
    } else {
      console.log(`[Invite] Attempting to send email using ${usedSource} refresh token.`);
    }

    // Build email content
    const inviteUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/invites/${token}`;
    const inviterName = inviter?.name || inviter?.email || "A colleague";
    const subject = `${inviterName} invited you to collaborate on "${document.title}"`;
    const expiresAtStr = invite.expiresAt?.toUTCString() ?? "";

    const html = `
      <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #111;">
        <h2 style="margin:0 0 8px 0;">${inviterName} invited you to collaborate</h2>
        <p style="margin:0 0 12px 0;">You were invited to <strong>${document.title}</strong> as <strong>${role}</strong>.</p>
        <p style="margin:0 0 12px 0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:white;border-radius:6px;text-decoration:none;">
            Accept invitation
          </a>
        </p>
        <p style="margin:0 0 8px 0;font-size:13px;color:#666;">
          This invite will expire on ${expiresAtStr}.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:12px 0;" />
        <p style="margin:0;font-size:13px;color:#666;">If you don't have an account, you'll be prompted to sign up.</p>
      </div>
    `;

    const text = `${inviterName} invited you to collaborate on "${document.title}" as ${role}. Accept the invitation: ${inviteUrl}. Expires: ${expiresAtStr}`;

    // Attempt to send email; do not fail creation if email fails
    try {
      if (!perUserRefreshToken && !systemRefreshToken) {
        console.warn("[Invite] Skipping email send; no refresh token available.");
      } else {
        const emailSent = await sendEmail(
          {
            to: trimmedEmail,
            subject,
            html,
            text,
          },
          {
            refreshToken: perUserRefreshToken,
            userEmail: inviter?.email || process.env.GMAIL_USER,
            allowSystemFallback: true,
          }
        );

        if (emailSent) {
          console.log(`[Invite] Email sent successfully to ${trimmedEmail}`);
        } else {
          console.warn(`[Invite] Failed to send email to ${trimmedEmail}, but invite was created`);
        }
      }
    } catch (emailError: unknown) {
      console.error("[Invite] Error sending email:", emailError instanceof Error ? emailError.message : String(emailError));
      // Don't fail the request if email fails - invite is still created
    }

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
      message: "Invitation created successfully",
    });
  } catch (error: any) {
    console.error("Document invite error:", error);

    if (error.message?.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error.message?.includes("Forbidden")) {
      return NextResponse.json(
        {
          error: "Forbidden: Insufficient permissions to invite collaborators",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
