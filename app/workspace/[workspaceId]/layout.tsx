// app/workspace/[workspaceId]/layout.tsx
import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Workspace layout
 *
 * NOTE:
 * - This layout enforces authentication and renders its children.
 * - It intentionally does NOT mount AppSidebar so you have a single, global sidebar
 *   (recommended) mounted at root `app/layout.tsx`.
 *
 * If you *do* want the sidebar mounted here instead of root, see the commented
 * alternative at the bottom of this file.
 */

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceId: string };
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }
  return <>{children}</>;
}