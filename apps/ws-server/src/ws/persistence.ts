// apps/ws-server/src/ws/persistence.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Save a compressed Yjs snapshot to the database
 */
export async function saveSnapshotForDoc(
  docName: string,
  compressedBuffer: Buffer,
  userId?: string,
) {
  // assume docName like "workspaceId:docId" or just docId; we'll get last part as documentId
  const parts = docName.split(":");
  const documentId = parts[parts.length - 1];

  try {
    // Save to YjsSnapshot table for history
    await prisma.yjsSnapshot.create({
      data: {
        documentId,
        snapshot: Buffer.from(compressedBuffer),
        createdById: userId || null,
      },
    });

    // Also update the Document.yjsSnapshot field for quick access
    await prisma.document.update({
      where: { id: documentId },
      data: { yjsSnapshot: Buffer.from(compressedBuffer) },
    });
  } catch (err) {
    console.error("Error saving snapshot to DB", err);
    throw err;
  }
}

/**
 * Get the latest snapshot from the database
 * First tries Document.yjsSnapshot, then falls back to YjsSnapshot table
 */
export async function getLatestSnapshot(
  documentId: string,
): Promise<Buffer | null> {
  try {
    // Try getting from Document first (faster)
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { yjsSnapshot: true },
    });

    if (doc?.yjsSnapshot) {
      return Buffer.from(doc.yjsSnapshot);
    }

    // Fallback to YjsSnapshot table
    const snap = await prisma.yjsSnapshot.findFirst({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: { snapshot: true },
    });

    return snap ? Buffer.from(snap.snapshot) : null;
  } catch (err) {
    console.error("Error loading snapshot from DB", err);
    return null;
  }
}

/**
 * Clean up old snapshots (keep only last N)
 */
export async function cleanupOldSnapshots(
  documentId: string,
  keepCount: number = 10,
) {
  try {
    const snapshots = await prisma.yjsSnapshot.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (snapshots.length > keepCount) {
      const toDelete = snapshots.slice(keepCount).map((s: any) => s.id);
      await prisma.yjsSnapshot.deleteMany({
        where: { id: { in: toDelete } },
      });
      console.log(
        `Cleaned up ${toDelete.length} old snapshots for doc ${documentId}`,
      );
    }
  } catch (err) {
    console.error("Error cleaning up snapshots", err);
  }
}
