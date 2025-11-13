import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthSession, apiRequireRole, ROLES } from "@/lib/permissions";
import { sendEmail } from "@/lib/email/gmail";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== "string") return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!role || !["VIEWER","EDITOR","ADMIN"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) return NextResponse.json({ error: "Invalid email format" }, { status: 400 });

    const { userId } = await requireAuthSession();

    const document = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, title: true, workspaceId: true }});
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    await apiRequireRole({ resourceType: "document", resourceId: documentId, minimumRole: ROLES.EDITOR });

    const existingInvite = await prisma.invite.findFirst({ where: { documentId, email: trimmedEmail, status: "pending" }});
    if (existingInvite) return NextResponse.json({ error: "An invitation is already pending for this email" }, { status: 409 });

    const token = crypto.randomBytes(32).toString("hex");
    const invite = await prisma.invite.create({
      data: {
        documentId,
        workspaceId: document.workspaceId,
        email: trimmedEmail,
        role,
        token,
        invitedById: userId,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`Invite created: ${invite.id} for ${trimmedEmail} to document ${documentId} by user ${userId}`);

    const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });

    const googleAccount = await prisma.account.findFirst({
      where: { userId, provider: "google" },
      select: { refresh_token: true },
    });

    const perUserRefreshToken = googleAccount?.refresh_token ?? undefined;
    const systemRefreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.REFRESH_TOKEN || undefined;

    const usedSource = perUserRefreshToken ? "per-user" : (systemRefreshToken ? "system" : "none");
    if (usedSource === "none") {
      console.warn("[Invite] No refresh token available — invites will be created but email won't be sent.");
    } else {
      console.log(`[Invite] Attempting to send email using ${usedSource} refresh token.`);
    }

    const inviteUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/invites/${token}`;
    const inviterName = inviter?.name || inviter?.email || "A colleague";
    const subject = `${inviterName} invited you to collaborate on "${document.title}"`;
    const expiresAtStr = invite.expiresAt?.toUTCString() ?? "";

    const html = `<div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #111;">
        <h2 style="margin:0 0 8px 0;">${inviterName} invited you to collaborate</h2>
        <p style="margin:0 0 12px 0;">You were invited to <strong>${document.title}</strong> as <strong>${role}</strong>.</p>
        <p style="margin:0 0 12px 0;"><a href="${inviteUrl}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:white;border-radius:6px;text-decoration:none;">Accept invitation</a></p>
        <p style="margin:0 0 8px 0;font-size:13px;color:#666;">This invite will expire on ${expiresAtStr}.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:12px 0;" />
        <p style="margin:0;font-size:13px;color:#666;">If you don't have an account, you'll be prompted to sign up.</p>
      </div>`;
    const text = `${inviterName} invited you to collaborate on "${document.title}" as ${role}. Accept the invitation: ${inviteUrl}. Expires: ${expiresAtStr}`;

    try {
      if (!perUserRefreshToken && !systemRefreshToken) {
        console.warn("[Invite] Skipping email send; no refresh token available.");
      } else {
        const emailSent = await sendEmail({
          to: trimmedEmail,
          subject,
          html,
          text,
        }, {
          refreshToken: perUserRefreshToken, // prefer per-user
          userEmail: inviter?.email || process.env.GMAIL_USER,
          allowSystemFallback: true,
        });

        if (emailSent) console.log(`[Invite] Email sent to ${trimmedEmail}`);
        else console.warn(`[Invite] Email send failed for ${trimmedEmail}, invite created.`);
      }
    } catch (err) {
      console.error("[Invite] sendEmail threw error:", err);
    }

    return NextResponse.json({ success: true, invite: { id: invite.id, email: invite.email, role: invite.role, status: invite.status, expiresAt: invite.expiresAt }, message: "Invitation created successfully" });
  } catch (error: any) {
    console.error("Document invite error:", error);
    if (error.message?.includes("Unauthorized")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message?.includes("Forbidden")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
