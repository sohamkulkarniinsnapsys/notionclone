// app/api/docs/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/auth'

async function resolveParams(context: any) {
  const maybe = context?.params
  if (!maybe) return null
  if (typeof maybe.then === 'function') return await maybe
  return maybe
}

export async function GET(req: Request, context: any) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const resolved = await resolveParams(context)
    const id = resolved?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const doc = await prisma.document.findUnique({
      where: { id },
      // Note: Avoid selecting contentJson to keep compatibility if Prisma types aren't regenerated yet
      select: { id: true, title: true, workspaceId: true },
    })
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, workspaceId: doc.workspaceId },
      select: { id: true },
    })
    if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    // Access contentJson via a cast to remain type-safe pre-regeneration
    const docAny = doc as any
    return NextResponse.json({ id: doc.id, title: doc.title, contentJson: docAny?.contentJson ?? null })
  } catch (err) {
    console.error('GET /api/docs/[id] error', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, context: any) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const resolved = await resolveParams(context)
    const id = resolved?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const body = await req.json()
    const contentJson = body?.contentJson
    if (typeof contentJson === 'undefined') {
      return NextResponse.json({ error: 'missing_content' }, { status: 400 })
    }

    // Verify access
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { workspaceId: true },
    })
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, workspaceId: doc.workspaceId },
      select: { id: true },
    })
    if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    await prisma.document.update({
      where: { id },
      // Cast to any to avoid Prisma client type mismatch before regeneration
      data: ({ contentJson } as any),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/docs/[id] error', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}


