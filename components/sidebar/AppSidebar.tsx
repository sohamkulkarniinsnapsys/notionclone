"use client";

import React from "react";
import { useSession, signOut } from "next-auth/react";
import { Home, FileText, FolderOpen, LogOut, Settings } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  DesktopSidebar,
  MobileSidebar,
  SidebarBody,
  SidebarLink,
  SidebarSection,
  SidebarFooter,
  SidebarUser,
  SidebarDivider,
  SidebarLink as SidebarLinkType,
} from "./sidebar-primitives";

interface AppSidebarProps {
  children: React.ReactNode;
  workspaceId?: string;
  className?: string;
  workspaces?: { id: string; name: string }[];
  recentDocuments?: { id: string; title?: string | null; workspaceId: string }[];
}

export default function AppSidebar({ children, workspaceId, className, workspaces = [], recentDocuments = [] }: AppSidebarProps) {
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);

  const mainLinks: SidebarLinkType[] = [{ label: "Home", href: "/dashboard", icon: <Home size={18} /> }];

  const workspaceLinks: SidebarLinkType[] = workspaceId
    ? [
        { label: "All Documents", href: `/workspace/${workspaceId}/documents`, icon: <FileText size={18} /> },
        { label: "Workspace", href: `/workspace/${workspaceId}`, icon: <FolderOpen size={18} /> },
      ]
    : [];

  const bottomLinks: SidebarLinkType[] = [{ label: "Settings", href: "/settings", icon: <Settings size={18} /> }];

  const handleSignOut = async () => await signOut({ callbackUrl: "/auth/signin" });

  const handleMobileLinkClick = () => setOpen(false);

  const sidebarContent = (
    <>
      <SidebarBody>
        <SidebarSection>
          {mainLinks.map((l) => <SidebarLink key={l.href} link={l} onClick={handleMobileLinkClick} />)}
        </SidebarSection>

        {workspaceLinks.length > 0 && (
          <>
            <SidebarDivider />
            <SidebarSection title="Workspace">
              {workspaceLinks.map((l) => <SidebarLink key={l.href} link={l} onClick={handleMobileLinkClick} />)}
            </SidebarSection>
          </>
        )}

        {workspaces.length > 0 && (
          <>
            <SidebarDivider />
            <SidebarSection title="Workspaces">
              <div className="px-2 space-y-1">
                {workspaces.map((ws) => (
                  <SidebarLink key={ws.id} link={{ label: ws.name, href: `/workspace/${ws.id}`, icon: "📁" as any }} onClick={handleMobileLinkClick} />
                ))}
              </div>
            </SidebarSection>
          </>
        )}

        {recentDocuments.length > 0 && (
          <>
            <SidebarDivider />
            <SidebarSection title="Recent">
              <div className="px-2 space-y-1">
                {recentDocuments.slice(0, 10).map((d) => (
                  <SidebarLink key={d.id} link={{ label: d.title || "Untitled", href: `/workspace/${d.workspaceId}/documents/${d.id}`, icon: "📄" as any }} onClick={handleMobileLinkClick} />
                ))}
              </div>
            </SidebarSection>
          </>
        )}
      </SidebarBody>

      {session?.user && (
        <SidebarFooter>
          <SidebarUser name={session.user.name || "User"} email={session.user.email || undefined} avatar={session.user.image || undefined} />
          <button onClick={() => { handleMobileLinkClick(); handleSignOut(); }} className="flex items-center gap-3 px-4 py-2 mt-2 mx-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all duration-150 w-full min-h-[44px]">
            <LogOut size={16} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </SidebarFooter>
      )}
    </>
  );

  return (
    <SidebarProvider open={open} setOpen={setOpen}>
      <Sidebar className={className}>
        <DesktopSidebar>{sidebarContent}</DesktopSidebar>
        <MobileSidebar>{sidebarContent}</MobileSidebar>

        {/* main content: make it scroll independently of the left column */}
        <div className="flex-1 flex flex-col min-h-screen overflow-auto">
          {children}
        </div>
      </Sidebar>
    </SidebarProvider>
  );
}
