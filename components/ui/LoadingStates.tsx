"use client";

import React from "react";

/**
 * Optimized loading states with proper accessibility and performance
 */

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: string;
}

export function LoadingSpinner({
  size = "md",
  color = "#4F46E5",
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: "16px",
    md: "24px",
    lg: "32px",
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: "inline-block",
        width: sizeMap[size],
        height: sizeMap[size],
        border: `3px solid rgba(79, 70, 229, 0.1)`,
        borderTop: `3px solid ${color}`,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = "20px",
  borderRadius = "4px",
  className = "",
  style = {},
}: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background:
          "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function DocumentLoadingSkeleton() {
  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "900px",
        margin: "0 auto",
      }}
      role="status"
      aria-label="Loading document"
    >
      {/* Title skeleton */}
      <Skeleton width="60%" height="36px" borderRadius="6px" />

      <div style={{ marginTop: "2rem" }}>
        {/* Content skeletons */}
        <Skeleton width="100%" height="20px" style={{ marginBottom: "1rem" }} />
        <Skeleton width="95%" height="20px" style={{ marginBottom: "1rem" }} />
        <Skeleton width="98%" height="20px" style={{ marginBottom: "1rem" }} />
        <Skeleton width="90%" height="20px" style={{ marginBottom: "2rem" }} />

        <Skeleton width="100%" height="20px" style={{ marginBottom: "1rem" }} />
        <Skeleton width="92%" height="20px" style={{ marginBottom: "1rem" }} />
        <Skeleton width="97%" height="20px" style={{ marginBottom: "1rem" }} />
      </div>

      <span className="sr-only">Loading document content...</span>
    </div>
  );
}

export function EditorLoadingSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
      role="status"
      aria-label="Loading editor"
    >
      {/* Toolbar skeleton */}
      <div
        style={{
          padding: "1rem",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <Skeleton width="32px" height="32px" borderRadius="4px" />
        <Skeleton width="32px" height="32px" borderRadius="4px" />
        <Skeleton width="32px" height="32px" borderRadius="4px" />
        <div
          style={{ width: "1px", background: "#e5e7eb", margin: "0 0.5rem" }}
        />
        <Skeleton width="32px" height="32px" borderRadius="4px" />
        <Skeleton width="32px" height="32px" borderRadius="4px" />
      </div>

      {/* Editor content skeleton */}
      <div style={{ flex: 1, padding: "2rem" }}>
        <DocumentLoadingSkeleton />
      </div>

      <span className="sr-only">Loading editor interface...</span>
    </div>
  );
}

export function PageLoadingState({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "400px",
        padding: "2rem",
        textAlign: "center",
      }}
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="lg" />
      <p
        style={{
          marginTop: "1rem",
          fontSize: "1rem",
          color: "#6b7280",
        }}
      >
        {message}
      </p>
    </div>
  );
}

export function ButtonLoadingState() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <LoadingSpinner size="sm" color="#ffffff" />
      <span>Loading...</span>
    </span>
  );
}

/**
 * Error boundary fallback component
 */
interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  message?: string;
}

export function ErrorFallback({
  error,
  resetError,
  message = "Something went wrong",
}: ErrorFallbackProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "400px",
        padding: "2rem",
        textAlign: "center",
      }}
      role="alert"
      aria-live="assertive"
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "#fee2e2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1rem",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: "600",
          color: "#111827",
          marginBottom: "0.5rem",
        }}
      >
        {message}
      </h2>

      {error && (
        <p
          style={{
            fontSize: "0.875rem",
            color: "#6b7280",
            marginBottom: "1rem",
            maxWidth: "500px",
          }}
        >
          {error.message}
        </p>
      )}

      {resetError && (
        <button
          onClick={resetError}
          style={{
            padding: "0.5rem 1rem",
            background: "#4F46E5",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "500",
            transition: "background-color 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#4338CA";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "#4F46E5";
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}

/**
 * Inline CSS for animations (to be added to global styles)
 */
export const loadingAnimationStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
`;
