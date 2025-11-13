// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.log("Skipping seed because NODE_ENV !== development");
    return;
  }

  console.log("Starting seed...");

  // Create a dev user
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: {
      email: "dev@example.com",
      name: "Dev User",
    },
  });

  console.log("Created user:", user.email);

  // Create a dev workspace
  const ws = await prisma.workspace.upsert({
    where: { id: "dev-workspace" },
    update: {},
    create: {
      id: "dev-workspace",
      name: "Dev Workspace",
      ownerId: user.id,
    },
  });

  console.log("Created workspace:", ws.name);

  // Add user as workspace member
  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: ws.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      workspaceId: ws.id,
      role: "owner",
    },
  });

  console.log("Added user to workspace");

  // Create a welcome document
  await prisma.document.upsert({
    where: { id: "dev-doc" },
    update: {
      title: "Welcome",
      updatedAt: new Date(),
    },
    create: {
      id: "dev-doc",
      title: "Welcome",
      workspaceId: ws.id,
      createdBy: user.id,
      ownerId: user.id,
    },
  });

  console.log("Created document: Welcome");
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
