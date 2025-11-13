// app/api/invites/[id]/accept/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/auth'

async function resolveParams(context: any) {
  const maybe = context?.params
  if (!maybe) return null
  if (typeof maybe.then === 'function') return await maybe
  return maybe
}

export async function POST(req: Request, context: any) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { id } = await resolveParams(context) || {}
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const prismaAny = prisma as any
    const invite = await prismaAny.invite.findUnique({
      where: { id },
      select: { id: true, email: true, status: true, workspaceId: true, role: true },
    })
    if (!invite || invite.status !== 'pending') {
      return NextResponse.json({ error: 'invalid_invite' }, { status: 400 })
    }
    if (invite.email !== session.user.email) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Add membership and mark invite accepted
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: session.user.id, workspaceId: invite.workspaceId } },
        update: { role: invite.role || 'member' },
        create: { userId: session.user.id, workspaceId: invite.workspaceId, role: invite.role || 'member' },
      }),
      prismaAny.invite.update({ where: { id: invite.id }, data: { status: 'accepted' } }),
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/invites/[id]/accept error', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}


