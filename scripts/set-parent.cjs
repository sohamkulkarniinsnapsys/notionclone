// scripts/set-parent.cjs
// Usage: node ./scripts/set-parent.cjs <childId> <parentId>

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  const childId = process.argv[2];
  const parentId = process.argv[3];
  if (!childId || !parentId) {
    console.error("Usage: node ./scripts/set-parent.cjs <childId> <parentId>");
    process.exit(1);
  }

  const prev = await prisma.document.findUnique({
    where: { id: childId },
    select: { id: true, parentId: true, title: true },
  });
  console.log("Before:", prev);

  await prisma.document.update({
    where: { id: childId },
    data: { parentId },
  });

  const after = await prisma.document.findUnique({
    where: { id: childId },
    select: { id: true, parentId: true, title: true },
  });
  console.log("After:", after);

  await prisma.$disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
