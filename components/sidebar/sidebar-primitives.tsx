"use client";

import React, { createContext, useContext, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

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

// Main Sidebar Container
export const Sidebar = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex h-screen w-full", className)}>{children}</div>
  );
};

// Desktop Sidebar
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
        "hidden md:flex h-full flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]",
        "relative z-20",
        className,
      )}
      animate={{
        width: open ? "280px" : "72px",
      }}
      transition={{
        duration: animate ? 0.3 : 0,
        ease: [0.4, 0, 0.2, 1],
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
    </motion.div>
  );
};

// Mobile Sidebar
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
      {/* Mobile Menu Button */}
      <button
        className="md:hidden fixed top-5 left-5 z-50 p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition-colors shadow-lg"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
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
              className,
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Sidebar Body
export const SidebarBody = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex-1 overflow-y-auto overflow-x-hidden", className)}>
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
  const isActive =
    pathname === link.href || pathname?.startsWith(link.href + "/");

  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 px-4 py-3 mx-2 rounded-lg min-h-[44px]",
        "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
        "hover:bg-[var(--color-bg-hover)] transition-all duration-200",
        "group relative",
        isActive && [
          "bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]",
          "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
          "before:w-1 before:h-10 before:bg-[var(--color-accent)] before:rounded-r-full",
        ],
        className,
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
        {link.icon}
      </div>

      {/* Label with animation */}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{
              opacity: 1,
              width: "auto",
            }}
            exit={{
              opacity: 0,
              width: 0,
            }}
            transition={{
              duration: animate ? 0.2 : 0,
              opacity: { duration: animate ? 0.2 : 0 },
              width: { duration: animate ? 0.2 : 0 },
            }}
            className="text-base font-medium whitespace-nowrap overflow-hidden"
          >
            {link.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Tooltip for collapsed state */}
      {!open && (
        <div className="absolute left-full ml-3 px-3 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          {link.label}
        </div>
      )}
    </Link>
  );
};

// Sidebar Section (for grouping links)
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
        <div className="px-6 py-3 text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
          {title}
        </div>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
};

// Sidebar Footer (for user info, etc.)
export const SidebarFooter = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("border-t border-[var(--color-border)] p-4", className)}>
      {children}
    </div>
  );
};

// User Info Component
export const SidebarUser = ({
  name,
  email,
  avatar,
  className,
}: {
  name: string;
  email?: string;
  avatar?: string | React.ReactNode;
  className?: string;
}) => {
  const { open } = useSidebar();

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      {/* Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center overflow-hidden">
        {typeof avatar === "string" ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : avatar ? (
          avatar
        ) : (
          <span className="text-base font-medium">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* User Info */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0 overflow-hidden"
          >
            <div className="text-base font-medium text-[var(--color-text-primary)] truncate">
              {name}
            </div>
            {email && (
              <div className="text-sm text-[var(--color-text-secondary)] truncate">
                {email}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Divider
export const SidebarDivider = ({ className }: { className?: string }) => {
  return (
    <div className={cn("h-px bg-[var(--color-border)] mx-3 my-3", className)} />
  );
};
