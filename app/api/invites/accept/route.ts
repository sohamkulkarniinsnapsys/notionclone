// app/api/invites/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthSession } from '@/lib/permissions';
import { addDocumentCollaborator } from '@/lib/permissions';

/**
 * GET /api/invites/accept?token=xxx
 * Accept an invite (requires authentication)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Try to get authenticated user
    let userId: string | null = null;
    let userEmail: string | null = null;

    try {
      const auth = await requireAuthSession();
      userId = auth.userId;
      userEmail = auth.userEmail;
    } catch (error) {
      // Not authenticated - redirect to sign in with token preserved
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', `/api/invites/accept?token=${token}`);
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
      return NextResponse.json(
        { error: 'Invalid or expired invite' },
        { status: 404 }
      );
    }

    // Check if invite is expired
    if (invite.expiresAt < new Date()) {
      // Mark as expired
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });

      return NextResponse.json(
        { error: 'This invite has expired' },
        { status: 410 }
      );
    }

    // Check if invite is already accepted
    if (invite.status === 'accepted') {
      // Redirect to appropriate page
      if (invite.documentId) {
        const doc = await prisma.document.findUnique({
          where: { id: invite.documentId },
          select: { workspaceId: true },
        });
        if (doc) {
          return NextResponse.redirect(
            new URL(`/workspace/${doc.workspaceId}/documents/${invite.documentId}`, request.url)
          );
        }
      } else if (invite.workspaceId) {
        return NextResponse.redirect(
          new URL(`/workspace/${invite.workspaceId}`, request.url)
        );
      }

      return NextResponse.json(
        { error: 'This invite has already been accepted' },
        { status: 400 }
      );
    }

    // Check if invite email matches user email
    if (invite.email !== userEmail) {
      return NextResponse.json(
        {
          error: 'This invite was sent to a different email address',
          inviteEmail: invite.email,
          userEmail,
        },
        { status: 403 }
      );
    }

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
          status: 'accepted',
          acceptedAt: new Date(),
        },
      });

      console.log(
        `Workspace invite accepted: ${invite.id} by user ${userId}`
      );

      // Redirect to workspace
      return NextResponse.redirect(
        new URL(`/workspace/${invite.workspaceId}`, request.url)
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
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }

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
        // Add as document collaborator
        await addDocumentCollaborator(
          invite.documentId,
          userId,
          invite.role as any
        );
      }

      // Mark invite as accepted
      await prisma.invite.update({
        where: { id: invite.id },
        data: {
          status: 'accepted',
          acceptedAt: new Date(),
        },
      });

      console.log(
        `Document invite accepted: ${invite.id} by user ${userId}`
      );

      // Redirect to document
      return NextResponse.redirect(
        new URL(
          `/workspace/${document.workspaceId}/documents/${invite.documentId}`,
          request.url
        )
      );
    }

    return NextResponse.json(
      { error: 'Invalid invite type' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Accept invite error:', error);

    if (error.message?.includes('Unauthorized')) {
      // Redirect to sign in
      const signInUrl = new URL('/auth/signin', request.url);
      const token = request.nextUrl.searchParams.get('token');
      if (token) {
        signInUrl.searchParams.set('callbackUrl', `/api/invites/accept?token=${token}`);
      }
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500 }
    );
  }
}
