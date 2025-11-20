// components/InvitationsClient.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type Invite = {
  id: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  email: string;
  role: string;
  status: string;
  token?: string;
  createdAt?: string | null;
  expiresAt?: string | null;
};

export default function InvitationsClient({ invites: initialInvites }: { invites: Invite[] }) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites || []);
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function doAction(id: string, action: "accept" | "decline") {
    setErrorMessage(null);
    setLoadingIds((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/invites/${id}/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(body?.error || `Failed to ${action} invite`);
        setLoadingIds((s) => ({ ...s, [id]: false }));
        return;
      }

      // Option 1: Refresh server data (recommended)
      // This will re-run server component and show updated invites (relies on Next.js App Router)
      router.refresh();

      // Option 2: Optimistic client update in case refresh is not desired
      setInvites((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err) {
      setErrorMessage(String(err));
      setLoadingIds((s) => ({ ...s, [id]: false }));
    }
  }

  if (!invites || invites.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-medium mb-2">No pending invitations</div>
        <div className="text-sm text-[var(--color-text-secondary)]">
          If someone invited you, you'll see it here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded">
          {errorMessage}
        </div>
      )}
      <div className="grid gap-3">
        {invites.map((inv) => {
          const loading = !!loadingIds[inv.id];
          return (
            <div key={inv.id} className="card p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-[var(--color-text-primary)]">
                  {inv.workspaceName ? inv.workspaceName : "Workspace"}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)]">
                  Role: {inv.role} • Invited to: {inv.email}
                </div>
                <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  Created: {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : "—"}
                  {inv.expiresAt ? ` • Expires: ${new Date(inv.expiresAt).toLocaleString()}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost"
                  onClick={() => doAction(inv.id, "decline")}
                  disabled={loading}
                >
                  {loading ? "..." : "Decline"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => doAction(inv.id, "accept")}
                  disabled={loading}
                >
                  {loading ? "..." : "Accept"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
