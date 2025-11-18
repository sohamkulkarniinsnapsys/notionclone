import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppSidebar from "@/components/sidebar/AppSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <AppSidebar>{children}</AppSidebar>;
}
