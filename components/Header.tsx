"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: "/auth/signin", redirect: true });
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
      setShowConfirmModal(false);
    }
  };

  if (status === "loading") {
    return (
      <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 flex items-center justify-between document-header animate-fadeIn">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 skeleton" />
          <div className="w-32 h-5 skeleton" />
        </div>
        <div className="w-10 h-10 rounded skeleton" />
      </header>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  return (
    <>
      <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 flex items-center justify-between sticky top-0 z-[var(--z-sticky)] document-header animate-slideDown">
        {/* Left - Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[var(--color-bg-hover)] transition-all hover:scale-105"
        >
          <span className="text-2xl">📝</span>
          <span className="text-base font-semibold text-[var(--color-text-primary)]">
            Notion Clone
          </span>
        </Link>

        {/* Right - User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[var(--color-bg-hover)] transition-all hover:scale-105"
            aria-label="User menu"
          >
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="w-8 h-8 rounded-full transition-transform hover:scale-110"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-sm font-medium transition-transform hover:scale-110">
                {session.user.name?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <span className="hidden md:inline text-base text-[var(--color-text-primary)]">
              {session.user.name || session.user.email}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-text-secondary)] transition-transform"
              style={{
                transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              <polyline points="3 4.5 6 7.5 9 4.5" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-[var(--z-dropdown)]"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-[var(--shadow-xl)] z-[calc(var(--z-dropdown)+1)] animate-scaleIn overflow-hidden">
                <div className="p-3 border-b border-[var(--color-border)]">
                  <div className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                    {session.user.email}
                  </div>
                </div>
                <div className="p-2">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-3 py-2.5 rounded text-base text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all hover:translate-x-1"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 8l6-6 6 6" />
                      <path d="M3 7v7h10V7" />
                      <path d="M6 14v-4h4v4" />
                    </svg>
                    <span>Home</span>
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 px-3 py-2.5 rounded text-base text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all hover:translate-x-1"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="8" cy="8" r="3" />
                      <path d="M13.4 6.6l-1-1.8a1 1 0 0 0-1.4-.4l-.8.5a5 5 0 0 0-1.2-.7V3a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v1.2a5 5 0 0 0-1.2.7l-.8-.5a1 1 0 0 0-1.4.4l-1 1.8a1 1 0 0 0 .4 1.4l.8.4v1.2l-.8.4a1 1 0 0 0-.4 1.4l1 1.8a1 1 0 0 0 1.4.4l.8-.5a5 5 0 0 0 1.2.7V13a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.2a5 5 0 0 0 1.2-.7l.8.5a1 1 0 0 0 1.4-.4l1-1.8a1 1 0 0 0-.4-1.4l-.8-.4V7.4l.8-.4a1 1 0 0 0 .4-1.4z" />
                    </svg>
                    <span>Settings</span>
                  </Link>
                </div>
                <div className="p-2 border-t border-[var(--color-border)]">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowConfirmModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-base text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all hover:translate-x-1"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6" />
                      <path d="M10.6667 11.3333L14 8L10.6667 4.66667" />
                      <path d="M14 8H6" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Sign Out Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[var(--z-modal-backdrop)] animate-fadeIn"
          onClick={() => !isSigningOut && setShowConfirmModal(false)}
        >
          <div
            className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-xl)] w-full max-w-lg mx-4 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--color-border)]">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Sign Out
              </h2>
            </div>
            <div className="p-6">
              <p className="text-base text-[var(--color-text-secondary)] mb-3">
                Are you sure you want to sign out?
              </p>
              <p className="text-sm text-[var(--color-text-tertiary)]">
                You'll need to sign in again to access your documents.
              </p>
            </div>
            <div className="p-6 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSigningOut}
                className="btn btn-ghost px-6 py-3 text-base"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="btn btn-primary bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 px-6 py-3 text-base"
                type="button"
              >
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
