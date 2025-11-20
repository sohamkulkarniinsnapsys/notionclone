/**
 * Document Service
 * Centralizes document operations including breadcrumb generation
 */

import prisma from "@/lib/prisma";
import { checkDocumentPermission, PermissionResult } from "./permissions";

export interface BreadcrumbItem {
  id: string;
  title: string;
}

export interface DocumentWithBreadcrumb {
  id: string;
  title: string;
  workspaceId: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  breadcrumb: BreadcrumbItem[];
  permissions: PermissionResult;
}

/**
 * Create document helper (centralized)
 */
export async function createDocument(
  userId: string,
  workspaceId: string,
  opts: { title?: string; parentId?: string | null; contentJson?: any } = {},
) {
  const { title = "Untitled", parentId = null, contentJson = null } = opts;

  // If parentId provided, double-check parent exists and belongs to the workspace
  if (parentId) {
    const parent = await prisma.document.findUnique({
      where: { id: parentId },
      select: { id: true, workspaceId: true },
    });
    if (!parent) {
      throw new Error("Parent document not found");
    }
    if (parent.workspaceId !== workspaceId) {
      throw new Error("Parent document belongs to a different workspace");
    }
  }

  const doc = await prisma.document.create({
    data: {
      title,
      workspaceId,
      ownerId: userId,
      createdBy: userId,
      parentId,
      contentJson,
    },
  });

  return doc;
}

/**
 * Get document with breadcrumb trail and permissions
 */
export async function getDocumentWithBreadcrumb(
  documentId: string,
  userId: string,
): Promise<DocumentWithBreadcrumb | null> {
  try {
    // Get document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!document) {
      return null;
    }

    // Check permissions
    const permissions = await checkDocumentPermission(userId, documentId);

    if (!permissions.canView) {
      return null;
    }

    // Generate breadcrumb trail
    const breadcrumb = await generateBreadcrumb(
      documentId,
      document.workspaceId,
    );

    return {
      id: document.id,
      title: document.title,
      workspaceId: document.workspaceId,
      ownerId: document.ownerId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      breadcrumb,
      permissions,
    };
  } catch (error) {
    console.error("Error getting document with breadcrumb:", error);
    return null;
  }
}

/**
 * Generate breadcrumb trail for a document
 * Traces parent pages to build the path
 */
async function generateBreadcrumb(
  documentId: string,
  workspaceId: string,
): Promise<BreadcrumbItem[]> {
  try {
    const breadcrumb: BreadcrumbItem[] = [];

    // Get workspace info
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
      },
    });

    if (workspace) {
      breadcrumb.push({
        id: workspace.id,
        title: workspace.name,
      });
    }

    // Get current document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        contentJson: true,
      },
    });

    if (!document) {
      return breadcrumb;
    }

    // Find parent documents via explicit parentId chain
    const parentDocs = await findParentDocuments(documentId, workspaceId);

    // Add parent documents to breadcrumb (they are ordered top -> immediate parent)
    for (const parent of parentDocs) {
      breadcrumb.push({
        id: parent.id,
        title: parent.title,
      });
    }

    // Add current document
    breadcrumb.push({
      id: document.id,
      title: document.title,
    });

    return breadcrumb;
  } catch (error) {
    console.error("Error generating breadcrumb:", error);
    return [];
  }
}

/**
 * Find parent documents by walking `parentId` chain.
 * Returns an array ordered from top-most ancestor (closest to workspace root)
 * down to the immediate parent.
 */
async function findParentDocuments(
  documentId: string,
  workspaceId?: string,
): Promise<Array<{ id: string; title: string }>> {
  try {
    const parents: Array<{ id: string; title: string }> = [];

    // Get the starting doc's parentId
    let current = await prisma.document.findUnique({
      where: { id: documentId },
      select: { parentId: true },
    });

    // Walk up the parent chain
    while (current?.parentId) {
      const parent = await prisma.document.findUnique({
        where: { id: current.parentId },
        select: { id: true, title: true, parentId: true, workspaceId: true },
      });

      if (!parent) break;

      // Optional: ensure parent belongs to same workspace (defensive)
      if (workspaceId && parent.workspaceId !== workspaceId) {
        // stop traversal if parent not in same workspace (data inconsistency)
        break;
      }

      // We want ancestors in top -> bottom order. We'll unshift each found parent.
      parents.unshift({
        id: parent.id,
        title: parent.title ?? "Untitled",
      });

      current = { parentId: parent.parentId };
    }

    return parents;
  } catch (error) {
    console.error("Error finding parent documents:", error);
    return [];
  }
}

/**
 * Get document snapshot with permission check
 */
export async function getDocumentSnapshot(
  documentId: string,
  userId: string,
): Promise<{ snapshot: Buffer | null; permissions: PermissionResult } | null> {
  try {
    // Check permissions first
    const permissions = await checkDocumentPermission(userId, documentId);

    if (!permissions.canView) {
      return null;
    }

    // Get the latest snapshot
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        yjsSnapshot: true,
      },
    });

    if (!document) {
      return null;
    }

    // Convert to Buffer if needed
    const snapshot = document.yjsSnapshot
      ? Buffer.isBuffer(document.yjsSnapshot)
        ? document.yjsSnapshot
        : Buffer.from(document.yjsSnapshot)
      : null;

    return {
      snapshot,
      permissions,
    };
  } catch (error) {
    console.error("Error getting document snapshot:", error);
    return null;
  }
}

/**
 * Save document snapshot with permission check
 */
export async function saveDocumentSnapshot(
  documentId: string,
  userId: string,
  snapshot: Buffer,
): Promise<boolean> {
  try {
    // Check permissions
    const permissions = await checkDocumentPermission(userId, documentId);

    if (!permissions.canEdit) {
      return false;
    }

    // Save snapshot
    await prisma.document.update({
      where: { id: documentId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yjsSnapshot: snapshot as any,
        updatedAt: new Date(),
      },
    });

    // Optionally, save to DocumentSnapshot table for history
    await prisma.documentSnapshot.create({
      data: {
        documentId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        snapshot: snapshot as any,
        actorId: userId,
      },
    });

    return true;
  } catch (error) {
    console.error("Error saving document snapshot:", error);
    return false;
  }
}

/**
 * Update document title
 */
export async function updateDocumentTitle(
  documentId: string,
  userId: string,
  title: string,
): Promise<boolean> {
  try {
    // Check permissions
    const permissions = await checkDocumentPermission(userId, documentId);

    if (!permissions.canEdit) {
      return false;
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        title,
        updatedAt: new Date(),
      },
    });

    return true;
  } catch (error) {
    console.error("Error updating document title:", error);
    return false;
  }
}

/**
 * Delete document with permission check
 */
export async function deleteDocument(
  documentId: string,
  userId: string,
): Promise<boolean> {
  try {
    // Check permissions - must be owner or admin
    const permissions = await checkDocumentPermission(userId, documentId);

    if (!permissions.canAdmin && !permissions.isOwner) {
      return false;
    }

    await prisma.document.delete({
      where: { id: documentId },
    });

    return true;
  } catch (error) {
    console.error("Error deleting document:", error);
    return false;
  }
}

/**
 * Get document metadata (lightweight)
 */
export async function getDocumentMeta(
  documentId: string,
  userId: string,
): Promise<{
  id: string;
  title: string;
  workspaceId: string;
  permissions: PermissionResult;
} | null> {
  try {
    const permissions = await checkDocumentPermission(userId, documentId);

    if (!permissions.canView) {
      return null;
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        workspaceId: true,
      },
    });

    if (!document) {
      return null;
    }

    return {
      id: document.id,
      title: document.title,
      workspaceId: document.workspaceId,
      permissions,
    };
  } catch (error) {
    console.error("Error getting document meta:", error);
    return null;
  }
}
