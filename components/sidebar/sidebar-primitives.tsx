"use client";

import React, { createContext, useContext, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

/**
 * Sidebar primitives
 *
 * Key notes:
 * - DesktopSidebar uses `h-screen` so the left column exactly matches viewport height.
 * - SidebarBody uses `flex-1 overflow-auto min-h-0` so it scrolls internally when needed.
 * - SidebarFooter is `sticky bottom-0` and `flex-none` so it remains visible.
 *
 * IMPORTANT: Mount AppSidebar only once (preferably in app/layout.tsx).
 */

// Types
export interface SidebarLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

// Context
const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
};

// Provider
export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

// Root container: full height layout (flex)
export const Sidebar = (props: { children: React.ReactNode; className?: string }) => {
  const { children, className } = props;
  // Use min-h-screen on container so the app can be embedded in nested layouts;
  // actual column uses h-screen to force viewport match.
  return <div className={cn("flex min-h-screen w-full", className)}>{children}</div>;
};

// Desktop Sidebar: fixed-height column that matches viewport
export const DesktopSidebar = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { open, setOpen, animate } = useSidebar();

  return (
    <motion.div
      className={cn(
        // h-screen ensures this left column is exactly viewport height and won't grow
        "hidden md:flex h-screen flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]",
        "relative z-20",
        className,
      )}
      animate={{
        width: open ? "280px" : "72px",
      }}
      transition={{
        duration: animate ? 0.28 : 0,
        ease: [0.4, 0, 0.2, 1],
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
    </motion.div>
  );
};

// Mobile Sidebar (drawer)
export const MobileSidebar = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { open, setOpen } = useSidebar();

  return (
    <>
      {/* mobile toggle button */}
      <button
        className="md:hidden fixed top-5 left-5 z-50 p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition-colors shadow-lg"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 300,
            }}
            className={cn(
              "md:hidden fixed left-0 top-0 h-full w-72 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] z-50",
              "flex flex-col",
              className
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Sidebar Body — scrollable area inside h-screen column
export const SidebarBody = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  // flex-1 + overflow-auto + min-h-0 so it scrolls internally when content > viewport.
  return (
    <div className={cn("flex-1 overflow-auto min-h-0 pb-20", className)}>
      {children}
    </div>
  );
};

// Sidebar Link
export const SidebarLink = ({
  link,
  className,
  onClick,
}: {
  link: SidebarLink;
  className?: string;
  onClick?: () => void;
}) => {
  const { open, animate } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");

  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 mx-2 rounded-lg min-h-[44px]",
        "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
        "hover:bg-[var(--color-bg-hover)] transition-all duration-200",
        "group relative",
        isActive && [
          "bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]",
          "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
          "before:w-1 before:h-10 before:bg-[var(--color-accent)] before:rounded-r-full",
        ],
        className
      )}
    >
      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
        {link.icon}
      </div>

      {open && (
        <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
          {link.label}
        </span>
      )}

      {!open && (
        <div className="absolute left-full ml-3 px-3 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          {link.label}
        </div>
      )}
    </Link>
  );
};

// Sidebar Section
export const SidebarSection = ({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) => {
  const { open } = useSidebar();

  return (
    <div className={cn("py-3", className)}>
      {title && open && (
        <div className="px-6 py-3 text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
          {title}
        </div>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
};

// Sidebar Footer
export const SidebarFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  // sticky bottom-0 ensures footer sits at the bottom of the h-screen column
  return (
    <div className={cn("border-t border-[var(--color-border)] p-4 flex-none bg-[var(--color-bg-secondary)] sticky bottom-0 z-10", className)}>
      {children}
    </div>
  );
};

// Sidebar User
export const SidebarUser = ({ name, email, avatar, className }: { name: string; email?: string; avatar?: string | React.ReactNode; className?: string }) => {
  const { open } = useSidebar();

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center overflow-hidden">
        {typeof avatar === "string" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : avatar ? (
          avatar
        ) : (
          <span className="text-base font-medium">{name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      {open && (
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{name}</div>
          {email && <div className="text-xs text-[var(--color-text-secondary)] truncate">{email}</div>}
        </div>
      )}
    </div>
  );
};

// Divider
export const SidebarDivider = ({ className }: { className?: string }) => {
  return <div className={cn("h-px bg-[var(--color-border)] mx-3 my-3", className)} />;
};
