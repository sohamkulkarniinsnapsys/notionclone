/**
 * Shared Permission Service
 * Centralizes document access control logic used by both REST API and WebSocket server
 */

import prisma from "@/lib/prisma";

export type Permission = "none" | "view" | "edit" | "admin" | "owner";

export interface PermissionResult {
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  isOwner: boolean;
  permission: Permission;
}

/**
 * Check if a user has permission to access a document
 * @param userId - The user's ID
 * @param documentId - The document's ID
 * @returns Permission result with flags and permission level
 */
export async function checkDocumentPermission(
  userId: string,
  documentId: string,
): Promise<PermissionResult> {
  const noPermission: PermissionResult = {
    canView: false,
    canEdit: false,
    canAdmin: false,
    isOwner: false,
    permission: "none",
  };

  try {
    // 1. Get the document and workspace membership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        ownerId: true,
        workspaceId: true,
        workspace: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!document) {
      return noPermission;
    }

    // 2. Check if user is document owner
    if (document.ownerId === userId) {
      return {
        canView: true,
        canEdit: true,
        canAdmin: true,
        isOwner: true,
        permission: "owner",
      };
    }

    // 3. Check if user is workspace owner
    if (document.workspace.ownerId === userId) {
      return {
        canView: true,
        canEdit: true,
        canAdmin: true,
        isOwner: false,
        permission: "admin",
      };
    }

    // 4. Check workspace membership
    const workspaceMembership = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId: document.workspaceId,
      },
      select: {
        role: true,
      },
    });

    // 5. Check document-specific collaborator permissions
    const collaborator = await prisma.collaborator.findFirst({
      where: {
        userId,
        documentId,
      },
      select: {
        role: true,
      },
    });

    // Determine permission level based on collaborator role (highest priority)
    let permission: Permission = "none";
    let canView = false;
    let canEdit = false;
    let canAdmin = false;

    if (collaborator) {
      // Document-specific permissions take precedence
      switch (collaborator.role) {
        case "owner":
          permission = "owner";
          canView = true;
          canEdit = true;
          canAdmin = true;
          break;
        case "admin":
          permission = "admin";
          canView = true;
          canEdit = true;
          canAdmin = true;
          break;
        case "editor":
          permission = "edit";
          canView = true;
          canEdit = true;
          break;
        case "viewer":
          permission = "view";
          canView = true;
          break;
      }
    } else if (workspaceMembership) {
      // Fall back to workspace membership permissions
      switch (workspaceMembership.role) {
        case "owner":
        case "admin":
          permission = "admin";
          canView = true;
          canEdit = true;
          canAdmin = true;
          break;
        case "editor":
        case "member":
          permission = "edit";
          canView = true;
          canEdit = true;
          break;
        case "viewer":
          permission = "view";
          canView = true;
          break;
      }
    }

    // 6. Check pending invites as last resort
    if (!canView && !canEdit) {
      const invite = await prisma.invite.findFirst({
        where: {
          documentId,
          email: await getUserEmail(userId),
          status: "pending",
          expiresAt: {
            gte: new Date(),
          },
        },
      });

      if (invite) {
        // Pending invite gives view access
        return {
          canView: true,
          canEdit: false,
          canAdmin: false,
          isOwner: false,
          permission: "view",
        };
      }
    }

    return {
      canView,
      canEdit,
      canAdmin,
      isOwner: false,
      permission,
    };
  } catch (error) {
    console.error("Error checking document permission:", error);
    return noPermission;
  }
}

/**
 * Get user email by ID
 */
async function getUserEmail(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email || "";
}

/**
 * Check if user can view a document
 */
export async function canViewDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const permission = await checkDocumentPermission(userId, documentId);
  return permission.canView;
}

/**
 * Check if user can edit a document
 */
export async function canEditDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const permission = await checkDocumentPermission(userId, documentId);
  return permission.canEdit;
}

/**
 * Check if user can admin a document (invite others, change permissions)
 */
export async function canAdminDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const permission = await checkDocumentPermission(userId, documentId);
  return permission.canAdmin;
}

/**
 * Batch check permissions for multiple documents
 */
export async function checkMultipleDocumentPermissions(
  userId: string,
  documentIds: string[],
): Promise<Map<string, PermissionResult>> {
  const results = new Map<string, PermissionResult>();

  await Promise.all(
    documentIds.map(async (docId) => {
      const permission = await checkDocumentPermission(userId, docId);
      results.set(docId, permission);
    }),
  );

  return results;
}

/**
 * Get all documents a user has access to in a workspace
 */
export async function getUserAccessibleDocuments(
  userId: string,
  workspaceId: string,
): Promise<string[]> {
  try {
    // Get all documents in workspace
    const documents = await prisma.document.findMany({
      where: {
        workspaceId,
      },
      select: {
        id: true,
      },
    });

    // Filter by permission
    const accessibleDocs: string[] = [];
    for (const doc of documents) {
      const hasAccess = await canViewDocument(userId, doc.id);
      if (hasAccess) {
        accessibleDocs.push(doc.id);
      }
    }

    return accessibleDocs;
  } catch (error) {
    console.error("Error getting user accessible documents:", error);
    return [];
  }
}

/**
 * Add or update a collaborator's permission
 */
export async function setDocumentCollaborator(
  documentId: string,
  userId: string,
  role: "owner" | "admin" | "editor" | "viewer",
  actorId: string,
): Promise<boolean> {
  try {
    // Check if actor has admin rights
    const actorPermission = await checkDocumentPermission(actorId, documentId);
    if (!actorPermission.canAdmin) {
      throw new Error("Actor does not have admin rights");
    }

    // Upsert collaborator
    await prisma.collaborator.upsert({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
      create: {
        userId,
        documentId,
        role,
      },
      update: {
        role,
      },
    });

    return true;
  } catch (error) {
    console.error("Error setting document collaborator:", error);
    return false;
  }
}

/**
 * Remove a collaborator from a document
 */
export async function removeDocumentCollaborator(
  documentId: string,
  userId: string,
  actorId: string,
): Promise<boolean> {
  try {
    // Check if actor has admin rights
    const actorPermission = await checkDocumentPermission(actorId, documentId);
    if (!actorPermission.canAdmin) {
      throw new Error("Actor does not have admin rights");
    }

    // Don't allow removing the document owner
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true },
    });

    if (document?.ownerId === userId) {
      throw new Error("Cannot remove document owner");
    }

    // Delete collaborator
    await prisma.collaborator.delete({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
    });

    return true;
  } catch (error) {
    console.error("Error removing document collaborator:", error);
    return false;
  }
}

/**
 * Get all collaborators for a document
 */
export async function getDocumentCollaborators(
  documentId: string,
  actorId: string,
): Promise<
  Array<{
    userId: string;
    role: string;
    email: string;
    name: string | null;
  }>
> {
  try {
    // Check if actor can view the document
    const canView = await canViewDocument(actorId, documentId);
    if (!canView) {
      return [];
    }

    const collaborators = await prisma.collaborator.findMany({
      where: {
        documentId,
      },
      select: {
        userId: true,
        role: true,
      },
    });

    // Get user details
    const collaboratorsWithDetails = await Promise.all(
      collaborators.map(async (collab) => {
        const user = await prisma.user.findUnique({
          where: { id: collab.userId },
          select: {
            email: true,
            name: true,
          },
        });

        return {
          userId: collab.userId,
          role: collab.role,
          email: user?.email || "",
          name: user?.name || null,
        };
      }),
    );

    return collaboratorsWithDetails;
  } catch (error) {
    console.error("Error getting document collaborators:", error);
    return [];
  }
}
