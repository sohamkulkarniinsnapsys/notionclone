// apps/frontend/app/api/docs/[id]/snapshot/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import zlib from 'zlib';

async function resolveParams(context: any) {
  const maybePromise = context?.params
  if (!maybePromise) return null
  if (typeof maybePromise.then === 'function') {
    return await maybePromise
  }
  return maybePromise
}

export async function GET(req: Request, context: any) {
  try {
    const resolved = await resolveParams(context)
    const id = resolved?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const snap = await prisma.yjsSnapshot.findFirst({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!snap) return NextResponse.json({ snapshot: null });

    // decompress then base64 encode (frontend expects base64 of raw update)
    const compressed = Buffer.from(snap.snapshot);
    const decompressed = zlib.gunzipSync(compressed);
    const base64 = decompressed.toString('base64');
    return NextResponse.json({ snapshot: base64, createdAt: snap.createdAt });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ snapshot: null });
  }
}

export async function POST(req: Request, context: any) {
  try {
    const resolved = await resolveParams(context)
    const id = resolved?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

    const body = await req.json();
    const snapshotBase64 = body.snapshot as string;
    const userId = body.userId as string | undefined;

    // snapshotBase64 is base64 of raw update; compress and store
    const raw = Buffer.from(snapshotBase64, 'base64');
    const compressed = zlib.gzipSync(raw);

    await prisma.yjsSnapshot.create({
      data: {
        documentId: id,
        snapshot: compressed,
        createdById: userId || null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


