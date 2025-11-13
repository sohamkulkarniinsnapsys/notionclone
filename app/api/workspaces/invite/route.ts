// app/api/workspaces/invite/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { workspaceId, email, role } = await req.json()
    if (!workspaceId || !email) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Only owner or member of workspace can invite (MVP: any member)
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, workspaceId },
    })
    if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const token = crypto.randomBytes(20).toString('hex')
    const prismaAny = prisma as any
    const invite = await prismaAny.invite.create({
      data: {
        workspaceId,
        email,
        role: role || 'member',
        token,
      },
    })
    return NextResponse.json({ invite })
  } catch (err) {
    console.error('POST /api/workspaces/invite error', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}


