// server/permissions.js
import { createRequire } from "module";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import Prisma client from parent directory using absolute path
const require = createRequire(import.meta.url);
const prismaClientPath = resolve(__dirname, "../node_modules/@prisma/client");
const { PrismaClient } = require(prismaClientPath);

// Create Prisma client instance
const prisma = new PrismaClient();

/**
 * Check if a user has permission to access a document
 * @param {string} userId - The user's ID
 * @param {string} documentId - The document's ID
 * @returns {Promise<{canView: boolean, canEdit: boolean, canAdmin: boolean, isOwner: boolean}>}
 */
export async function checkDocumentPermission(userId, documentId) {
  const noPermission = {
    canView: false,
    canEdit: false,
    canAdmin: false,
    isOwner: false,
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
      };
    }

    // 3. Check if user is workspace owner
    if (document.workspace.ownerId === userId) {
      return {
        canView: true,
        canEdit: true,
        canAdmin: true,
        isOwner: false,
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
    let canView = false;
    let canEdit = false;
    let canAdmin = false;

    if (collaborator) {
      // Document-specific permissions take precedence
      switch (collaborator.role) {
        case "owner":
          canView = true;
          canEdit = true;
          canAdmin = true;
          break;
        case "admin":
          canView = true;
          canEdit = true;
          canAdmin = true;
          break;
        case "editor":
          canView = true;
          canEdit = true;
          break;
        case "viewer":
          canView = true;
          break;
      }
    } else if (workspaceMembership) {
      // Fall back to workspace membership permissions
      switch (workspaceMembership.role) {
        case "owner":
        case "admin":
          canView = true;
          canEdit = true;
          canAdmin = true;
          break;
        case "editor":
        case "member":
          canView = true;
          canEdit = true;
          break;
        case "viewer":
          canView = true;
          break;
      }
    }

    return {
      canView,
      canEdit,
      canAdmin,
      isOwner: false,
    };
  } catch (error) {
    console.error("Error checking document permission:", error);
    return noPermission;
  }
}

/**
 * Validate JWT token and extract user ID
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Promise<{userId: string, email: string} | null>}
 */
export async function validateToken(token, secret) {
  try {
    const decoded = jwt.verify(token, secret);
    return {
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
    };
  } catch (err) {
    console.error("Token validation failed:", err.message);
    return null;
  }
}

/**
 * Close Prisma connection
 */
export async function closePrisma() {
  await prisma.$disconnect();
}
