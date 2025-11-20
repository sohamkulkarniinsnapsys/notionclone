// scripts/check-parent.cjs
// Usage: node ./scripts/check-parent.cjs <documentId>

require("dotenv").config(); // load env from .env (if present)
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function run() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: node ./scripts/check-parent.cjs <documentId>");
    process.exit(1);
  }

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, title: true, parentId: true, workspaceId: true },
  });

  console.log("Document info:", doc);

  await prisma.$disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
