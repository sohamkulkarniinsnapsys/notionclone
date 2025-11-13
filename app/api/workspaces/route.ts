// app/api/workspaces/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/workspaces
 * List all workspaces the user has access to
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Get all workspaces where user is a member
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            createdAt: true,
          },
        },
      },
    });

    const workspaces = memberships.map((m: any) => ({
      ...m.workspace,
      role: m.role,
    }));

    return NextResponse.json({ workspaces });
  } catch (err) {
    console.error("GET /api/workspaces error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * POST /api/workspaces
 * Create a new workspace and add creator as owner
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "missing_name" }, { status: 400 });
    }
    const ws = await prisma.workspace.create({
      data: {
        name,
        ownerId: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: "owner",
          },
        },
      },
      select: { id: true, name: true },
    });
    return NextResponse.json({ workspace: ws }, { status: 201 });
  } catch (err) {
    console.error("POST /api/workspaces error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
