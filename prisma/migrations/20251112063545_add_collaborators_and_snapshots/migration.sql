/*
  Warnings:

  - Added the required column `ownerId` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Made the column `expiresAt` on table `Invite` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "YjsSnapshot" DROP CONSTRAINT "YjsSnapshot_documentId_fkey";

-- AlterTable
-- First add ownerId as nullable
ALTER TABLE "Document" ADD COLUMN     "htmlContent" TEXT,
ADD COLUMN     "ownerId" TEXT;

-- Set ownerId to createdBy for existing documents
UPDATE "Document" SET "ownerId" = "createdBy" WHERE "ownerId" IS NULL;

-- Now make ownerId NOT NULL
ALTER TABLE "Document" ALTER COLUMN "ownerId" SET NOT NULL;

-- AlterTable
-- Handle Invite changes with defaults for existing rows
ALTER TABLE "Invite" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "invitedById" TEXT,
ALTER COLUMN "workspaceId" DROP NOT NULL;

-- Set expiresAt to 7 days from now for existing invites
UPDATE "Invite" SET "expiresAt" = NOW() + INTERVAL '7 days' WHERE "expiresAt" IS NULL;

-- Now make expiresAt NOT NULL
ALTER TABLE "Invite" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "Collaborator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "snapshot" BYTEA NOT NULL,
    "htmlContent" TEXT,
    "jsonContent" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collaborator_documentId_idx" ON "Collaborator"("documentId");

-- CreateIndex
CREATE INDEX "Collaborator_userId_idx" ON "Collaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_userId_documentId_key" ON "Collaborator"("userId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentSnapshot_documentId_createdAt_idx" ON "DocumentSnapshot"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "Invite_documentId_email_idx" ON "Invite"("documentId", "email");

-- CreateIndex
CREATE INDEX "Invite_token_idx" ON "Invite"("token");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YjsSnapshot" ADD CONSTRAINT "YjsSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collaborator" ADD CONSTRAINT "Collaborator_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
