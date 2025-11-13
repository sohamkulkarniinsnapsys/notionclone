// app/api/invites/[id]/decline/route.ts
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
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { id } = await resolveParams(context) || {}
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const prismaAny = prisma as any
    const invite = await prismaAny.invite.findUnique({
      where: { id },
      select: { id: true, email: true, status: true },
    })
    if (!invite || invite.status !== 'pending') {
      return NextResponse.json({ error: 'invalid_invite' }, { status: 400 })
    }
    if (invite.email !== session.user.email) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    await prismaAny.invite.update({ where: { id }, data: { status: 'declined' } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/invites/[id]/decline error', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}


