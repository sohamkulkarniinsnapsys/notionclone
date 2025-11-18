"use client";

import React from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Home,
  FileText,
  FolderOpen,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
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
}

export default function AppSidebar({
  children,
  workspaceId,
  className,
}: AppSidebarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Navigation links
  const mainLinks: SidebarLinkType[] = [
    {
      label: "Home",
      href: "/dashboard",
      icon: <Home size={22} />,
    },
  ];

  // Workspace links (if workspace is selected)
  const workspaceLinks: SidebarLinkType[] = workspaceId
    ? [
        {
          label: "All Documents",
          href: `/workspace/${workspaceId}/documents`,
          icon: <FileText size={22} />,
        },
        {
          label: "Workspace",
          href: `/workspace/${workspaceId}`,
          icon: <FolderOpen size={22} />,
        },
      ]
    : [];

  // Settings and auth links
  const bottomLinks: SidebarLinkType[] = [
    {
      label: "Settings",
      href: "/settings",
      icon: <Settings size={22} />,
    },
  ];

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/auth/signin" });
  };

  const handleMobileLinkClick = () => {
    // Close mobile sidebar when a link is clicked
    setOpen(false);
  };

  const sidebarContent = (
    <>
      <SidebarBody>
        {/* Main Navigation */}
        <SidebarSection>
          {mainLinks.map((link) => (
            <SidebarLink
              key={link.href}
              link={link}
              onClick={handleMobileLinkClick}
            />
          ))}
        </SidebarSection>

        {/* Workspace Navigation */}
        {workspaceLinks.length > 0 && (
          <>
            <SidebarDivider />
            <SidebarSection title="Workspace">
              {workspaceLinks.map((link) => (
                <SidebarLink
                  key={link.href}
                  link={link}
                  onClick={handleMobileLinkClick}
                />
              ))}
            </SidebarSection>
          </>
        )}

        {/* Settings */}
        <SidebarDivider />
        <SidebarSection>
          {bottomLinks.map((link) => (
            <SidebarLink
              key={link.href}
              link={link}
              onClick={handleMobileLinkClick}
            />
          ))}
        </SidebarSection>
      </SidebarBody>

      {/* Footer with user info and logout */}
      {session?.user && (
        <SidebarFooter>
          <SidebarUser
            name={session.user.name || "User"}
            email={session.user.email || undefined}
            avatar={session.user.image || undefined}
          />
          <button
            onClick={() => {
              handleMobileLinkClick();
              handleSignOut();
            }}
            className="flex items-center gap-4 px-4 py-3 mx-2 mt-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all duration-200 w-full min-h-[44px]"
          >
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
              <LogOut size={22} />
            </div>
            <span className="text-base font-medium">Logout</span>
          </button>
        </SidebarFooter>
      )}
    </>
  );

  return (
    <SidebarProvider open={open} setOpen={setOpen}>
      <Sidebar className={className}>
        {/* Desktop Sidebar */}
        <DesktopSidebar>{sidebarContent}</DesktopSidebar>

        {/* Mobile Sidebar */}
        <MobileSidebar>{sidebarContent}</MobileSidebar>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {children}
        </div>
      </Sidebar>
    </SidebarProvider>
  );
}
