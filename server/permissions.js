// server/permissions.js
import { createRequire } from "module";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const prismaClientPath = resolve(__dirname, "../node_modules/@prisma/client");
const { PrismaClient } = require(prismaClientPath);

const prisma = new PrismaClient();

/**
 * Normalize role string from DB into a canonical lower-case value.
 * Accepts many variants and falls back to the raw lowercased value.
 */
function normalizeRole(raw) {
  if (!raw || typeof raw !== "string") return null;
  const r = raw.trim().toLowerCase();
  // Map common synonyms if you have them
  if (r === "editor" || r === "edit" || r === "editors") return "editor";
  if (r === "owner" || r === "admin" || r === "administrator") return r === "owner" ? "owner" : "admin";
  if (r === "viewer" || r === "read" || r === "read-only") return "viewer";
  // fallback to raw lowercased
  return r;
}

/**
 * Check if a user has permission to access a document
 * @param {string} userId
 * @param {string} documentId
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
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        ownerId: true,
        workspaceId: true,
        workspace: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (!document) {
      console.debug(`[permissions] document not found: ${documentId}`);
      return noPermission;
    }

    // Document owner short-circuit
    if (document.ownerId === userId) {
      return {
        canView: true,
        canEdit: true,
        canAdmin: true,
        isOwner: true,
      };
    }

    // Workspace owner short-circuit
    const workspaceOwnerId = document.workspace?.ownerId;
    if (workspaceOwnerId && workspaceOwnerId === userId) {
      return {
        canView: true,
        canEdit: true,
        canAdmin: true,
        isOwner: false,
      };
    }

    // Retrieve workspace membership and collaborator rows in parallel
    const [workspaceMembership, collaborator] = await Promise.all([
      document.workspaceId
        ? prisma.workspaceMember.findUnique({
            where: {
              userId_workspaceId: {
                userId,
                workspaceId: document.workspaceId,
              },
            },
            select: {
              role: true,
            },
          }).catch((e) => {
            console.warn(`[permissions] workspaceMember lookup failed: ${e?.message || e}`);
            return null;
          })
        : null,
      prisma.collaborator.findUnique({
        where: {
          userId_documentId: {
            userId,
            documentId,
          },
        },
        select: {
          role: true,
        },
      }).catch((e) => {
        console.warn(`[permissions] collaborator lookup failed: ${e?.message || e}`);
        return null;
      }),
    ]);

    // Determine effective role (collaborator overrides workspace membership)
    let effectiveRoleRaw = null;
    if (collaborator && collaborator.role) effectiveRoleRaw = collaborator.role;
    else if (workspaceMembership && workspaceMembership.role) effectiveRoleRaw = workspaceMembership.role;

    const effectiveRole = normalizeRole(effectiveRoleRaw);

    // Default conservative flags
    let canView = false;
    let canEdit = false;
    let canAdmin = false;

    if (effectiveRole) {
      switch (effectiveRole) {
        case "owner":
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
        default:
          // Unknown role: try to be conservative but allow common known synonyms
          if (effectiveRole.includes("edit")) {
            canView = true;
            canEdit = true;
          } else if (effectiveRole.includes("view") || effectiveRole.includes("read")) {
            canView = true;
          } else {
            console.warn(`[permissions] unknown normalized role="${effectiveRole}" for user ${userId} doc ${documentId}`);
          }
      }
    }

    return {
      canView,
      canEdit,
      canAdmin,
      isOwner: false,
    };
  } catch (error) {
    console.error("[permissions] Error checking document permission:", error);
    return noPermission;
  }
}

/**
 * Validate JWT token and extract user ID + docId/email
 * @param {string} token
 * @param {string} secret
 * @returns {{userId: string, email?: string, docId?: string} | null}
 */
export function validateToken(token, secret) {
  try {
    if (!token || !secret) {
      console.warn("[permissions.validateToken] missing token or secret");
      return null;
    }
    const decoded = jwt.verify(token, secret);
    return {
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
      docId: decoded.docId,
    };
  } catch (err) {
    console.error("[permissions.validateToken] Token validation failed:", err?.message || err);
    return null;
  }
}

/**
 * Debug helper used by the server for logs when permission denied.
 * Returns workspaceId, workspaceMembers, collaborators.
 */
export async function getDebugRows(userId, documentId) {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { workspaceId: true },
    });

    const workspaceId = document?.workspaceId || null;

    const [workspaceMembers, collaborators] = await Promise.all([
      workspaceId
        ? prisma.workspaceMember.findMany({
            where: { userId, workspaceId },
            select: { id: true, userId: true, workspaceId: true, role: true, createdAt: true },
          })
        : [],
      prisma.collaborator.findMany({
        where: { userId, documentId },
        select: { id: true, userId: true, documentId: true, role: true, createdAt: true },
      }),
    ]);

    // normalize roles for easier debugging output
    const normalizedWorkspaceMembers = workspaceMembers.map((m) => ({ ...m, role: normalizeRole(m.role) }));
    const normalizedCollaborators = collaborators.map((c) => ({ ...c, role: normalizeRole(c.role) }));

    return { workspaceMembers: normalizedWorkspaceMembers, collaborators: normalizedCollaborators, workspaceId };
  } catch (err) {
    console.error("[permissions.getDebugRows] error:", err);
    return { workspaceMembers: [], collaborators: [], workspaceId: null };
  }
}

/**
 * Close Prisma connection (for graceful shutdown)
 */
export async function closePrisma() {
  try {
    await prisma.$disconnect();
  } catch (e) {
    // ignore
  }
}
