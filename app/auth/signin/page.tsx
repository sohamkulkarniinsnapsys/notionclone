"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function SignInContent() {
  const searchParams = useSearchParams();

  const workspaceId = searchParams.get("workspaceId");
  const callbackUrlFromQuery = searchParams.get("callbackUrl");

  const callbackUrl = callbackUrlFromQuery
    ? callbackUrlFromQuery
    : workspaceId
      ? `/workspace/${encodeURIComponent(workspaceId)}`
      : "/dashboard";

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg-secondary)] p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">📝</div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
            Notion Clone
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Sign in to continue
          </p>
        </div>

        {/* Sign In Card */}
        <div className="card space-y-4">
          {/* Google Sign In */}
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] font-medium hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-hover)] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              className="text-[var(--color-accent)] hover:underline"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-[var(--color-accent)] hover:underline"
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg-secondary)]">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-pulse">📝</div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Loading...
            </p>
          </div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
