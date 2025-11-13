// WebSocket token generation endpoint
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

/**
 * GET /api/yjs/token?docId=xxx
 * Generate a short-lived JWT token for WebSocket authentication
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ error: 'missing_doc_id' }, { status: 400 });
    }

    // Check if document exists and user has access
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { workspaceId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId: doc.workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Generate JWT token (expires in 15 minutes)
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error('NEXTAUTH_SECRET not configured');
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    const token = jwt.sign(
      {
        docId,
        userId: session.user.id,
        email: session.user.email,
      },
      secret,
      { expiresIn: '15m' }
    );

    return NextResponse.json({ token });
  } catch (err) {
    console.error('GET /api/yjs/token error', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
