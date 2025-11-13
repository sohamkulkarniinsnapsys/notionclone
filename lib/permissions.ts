// lib/permissions.ts - Permission middleware and role hierarchy
import { getServerSession } from 'next-auth';
import prisma from './prisma';
import { authOptions } from './auth';

/**
 * Role hierarchy (higher roles include all lower role permissions)
 * owner > admin > editor > viewer
 */
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  MEMBER: 'member', // for workspace-level
} as const;

type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Role hierarchy mapping
 * Each role includes permissions of roles below it
 */
const roleHierarchy: Record<Role, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
  member: 1,
};

/**
 * Check if a user's role meets the minimum required role
 */
export function hasMinimumRole(userRole: string, minimumRole: string): boolean {
  const userLevel = roleHierarchy[userRole as Role] || 0;
  const requiredLevel = roleHierarchy[minimumRole as Role] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Get user's role for a document
 */
export async function getUserDocumentRole(
  userId: string,
  documentId: string
): Promise<string | null> {
  // Check direct document collaborator
  const collaborator = await prisma.collaborator.findUnique({
    where: {
      userId_documentId: {
        userId,
        documentId,
      },
    },
    select: {
      role: true,
    },
  });

  if (collaborator) {
    return collaborator.role;
  }

  // Check if user is document owner
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true, workspaceId: true },
  });

  if (document?.ownerId === userId) {
    return ROLES.OWNER;
  }

  // Check workspace membership as fallback
  if (document?.workspaceId) {
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: document.workspaceId,
        },
      },
      select: { role: true },
    });

    // Workspace owners/admins get admin role on documents
    if (workspaceMember?.role === 'owner' || workspaceMember?.role === 'admin') {
      return ROLES.ADMIN;
    }

    // Regular workspace members get viewer role
    if (workspaceMember) {
      return ROLES.VIEWER;
    }
  }

  return null;
}

/**
 * Get user's role for a workspace
 */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  // Check workspace ownership
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });

  if (workspace?.ownerId === userId) {
    return ROLES.OWNER;
  }

  // Check workspace membership
  const member = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    select: { role: true },
  });

  return member?.role || null;
}

/**
 * Require minimum role for a resource
 * Throws error if user doesn't have permission
 */
export async function requireRole(params: {
  userId: string;
  resourceType: 'document' | 'workspace';
  resourceId: string;
  minimumRole: Role;
}): Promise<string> {
  const { userId, resourceType, resourceId, minimumRole } = params;

  let userRole: string | null = null;

  if (resourceType === 'document') {
    userRole = await getUserDocumentRole(userId, resourceId);
  } else if (resourceType === 'workspace') {
    userRole = await getUserWorkspaceRole(userId, resourceId);
  }

  if (!userRole) {
    throw new Error('Forbidden: No access to resource');
  }

  if (!hasMinimumRole(userRole, minimumRole)) {
    throw new Error(
      `Forbidden: Requires ${minimumRole} role, but user has ${userRole}`
    );
  }

  return userRole;
}

/**
 * Check if user can access a document (any role)
 */
export async function canAccessDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  const role = await getUserDocumentRole(userId, documentId);
  return role !== null;
}

/**
 * Check if user can edit a document
 */
export async function canEditDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  const role = await getUserDocumentRole(userId, documentId);
  return role ? hasMinimumRole(role, ROLES.EDITOR) : false;
}

/**
 * Check if user can delete a document
 */
export async function canDeleteDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  const role = await getUserDocumentRole(userId, documentId);
  return role ? hasMinimumRole(role, ROLES.ADMIN) : false;
}

/**
 * Get authenticated session and user, throwing if not authenticated
 */
export async function requireAuthSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Unauthorized: No valid session');
  }

  return {
    session,
    userId: session.user.id,
    userEmail: session.user.email || '',
  };
}

/**
 * Middleware helper for API routes
 * Returns user info and validates role
 */
export async function apiRequireRole(params: {
  resourceType: 'document' | 'workspace';
  resourceId: string;
  minimumRole: Role;
}) {
  const { session, userId, userEmail } = await requireAuthSession();

  const userRole = await requireRole({
    userId,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    minimumRole: params.minimumRole,
  });

  return {
    session,
    userId,
    userEmail,
    userRole,
  };
}

/**
 * Check if user is document owner
 */
export async function isDocumentOwner(
  userId: string,
  documentId: string
): Promise<boolean> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true },
  });

  return document?.ownerId === userId;
}

/**
 * Check if user is workspace owner
 */
export async function isWorkspaceOwner(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });

  return workspace?.ownerId === userId;
}

/**
 * Get all document collaborators with their roles
 */
export async function getDocumentCollaborators(documentId: string) {
  const collaborators = await prisma.collaborator.findMany({
    where: { documentId },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Also get document owner
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true },
  });

  return {
    collaborators,
    ownerId: document?.ownerId,
  };
}

/**
 * Add collaborator to document
 */
export async function addDocumentCollaborator(
  documentId: string,
  userId: string,
  role: Role
) {
  return await prisma.collaborator.upsert({
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
      updatedAt: new Date(),
    },
  });
}

/**
 * Remove collaborator from document
 */
export async function removeDocumentCollaborator(
  documentId: string,
  userId: string
) {
  return await prisma.collaborator.delete({
    where: {
      userId_documentId: {
        userId,
        documentId,
      },
    },
  });
}

/**
 * Get user's accessible documents in a workspace
 */
export async function getUserAccessibleDocuments(
  userId: string,
  workspaceId: string
) {
  // Get documents where user is owner
  const ownedDocs = await prisma.document.findMany({
    where: {
      workspaceId,
      ownerId: userId,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Get documents where user is collaborator
  const collaboratorDocs = await prisma.collaborator.findMany({
    where: {
      userId,
      document: {
        workspaceId,
      },
    },
    select: {
      document: {
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      role: true,
    },
  });

  // Combine and deduplicate
  const docMap = new Map();

  ownedDocs.forEach((doc) => {
    docMap.set(doc.id, { ...doc, role: ROLES.OWNER });
  });

  collaboratorDocs.forEach(({ document, role }) => {
    if (!docMap.has(document.id)) {
      docMap.set(document.id, { ...document, role });
    }
  });

  return Array.from(docMap.values());
}
