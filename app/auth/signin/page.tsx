// app/auth/signin/page.tsx (client)
"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();

  // Use explicit string values only — never pass components or functions here.
  // Prefer a workspaceId query param if you want to redirect to a specific workspace.
  const workspaceId = searchParams.get("workspaceId"); // optional: ?workspaceId=abc
  const callbackUrlFromQuery = searchParams.get("callbackUrl");

  // priority: explicit callbackUrl query > workspaceId route > root
  const callbackUrl = callbackUrlFromQuery
    ? callbackUrlFromQuery
    : workspaceId
      ? `/workspace/${encodeURIComponent(workspaceId)}`
      : "/";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "20px",
      }}
    >
      <h1>Sign in to Notion Clone</h1>

      <button
        onClick={() => signIn("google", { callbackUrl })}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#4285f4",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Sign in with Google
      </button>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
          }}
        >
          Loading...
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
