import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppSidebar from "@/components/sidebar/AppSidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { workspaceId } = await params;

  return (
    <AppSidebar workspaceId={workspaceId}>
      {children}
    </AppSidebar>
  );
}
