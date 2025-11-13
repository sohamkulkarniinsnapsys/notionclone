"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();
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
      <header className="header-container">
        <div className="header-content">
          <div className="header-logo">
            <span className="logo-icon">📝</span>
            <span className="logo-text">Notion Clone</span>
          </div>
          <div className="header-actions">
            <div className="skeleton-avatar"></div>
          </div>
        </div>
      </header>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  return (
    <>
      <header className="header-container">
        <div className="header-content">
          <div className="header-logo" onClick={() => router.push("/dashboard")}>
            <span className="logo-icon">📝</span>
            <span className="logo-text">Notion Clone</span>
          </div>

          <div className="header-actions">
            <div className="user-info">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="user-avatar"
                />
              ) : (
                <div className="user-avatar-fallback">
                  {session.user.name?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <span className="user-name">{session.user.name || session.user.email}</span>
            </div>

            <button
              onClick={() => setShowConfirmModal(true)}
              className="logout-button"
              aria-label="Sign out"
              type="button"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10.6667 11.3333L14 8L10.6667 4.66667"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 8H6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => !isSigningOut && setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Sign Out</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to sign out?</p>
              <p className="modal-subtext">You'll need to sign in again to access your documents.</p>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSigningOut}
                className="modal-button modal-button-secondary"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="modal-button modal-button-danger"
                type="button"
              >
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .header-container {
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          padding: 0 24px;
          height: 60px;
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .header-logo:hover {
          opacity: 0.8;
        }

        .logo-icon {
          font-size: 24px;
        }

        .logo-text {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px;
          border-radius: 8px;
          background: #f9fafb;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
        }

        .user-avatar-fallback {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
        }

        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .skeleton-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .logout-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: transparent;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .logout-button:hover {
          background: #f9fafb;
          border-color: #9ca3af;
          color: #111827;
        }

        .logout-button:active {
          transform: scale(0.98);
        }

        /* Modal styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          padding: 0;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
          animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .modal-header {
          padding: 24px 24px 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }

        .modal-body {
          padding: 24px;
        }

        .modal-body p {
          margin: 0 0 8px;
          font-size: 14px;
          color: #374151;
        }

        .modal-subtext {
          font-size: 13px;
          color: #6b7280;
        }

        .modal-actions {
          padding: 16px 24px 24px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .modal-button {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .modal-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .modal-button-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .modal-button-secondary:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .modal-button-danger {
          background: #ef4444;
          color: white;
        }

        .modal-button-danger:hover:not(:disabled) {
          background: #dc2626;
        }

        @media (max-width: 768px) {
          .header-container {
            padding: 0 16px;
          }

          .user-name {
            display: none;
          }

          .logout-button span {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
