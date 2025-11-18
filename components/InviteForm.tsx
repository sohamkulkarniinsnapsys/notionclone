"use client";

import { useState } from "react";

interface InviteFormProps {
  resourceId: string;
  resourceType: "document" | "workspace";
  onClose: () => void;
}

export default function InviteForm({
  resourceId,
  resourceType,
  onClose,
}: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("EDITOR");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter an email address");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const endpoint =
        resourceType === "document"
          ? `/api/documents/${resourceId}/invite`
          : `/api/workspaces/${resourceId}/invite`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          role,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setEmail("");
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(data.error || "Failed to send invitation");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-[var(--color-error-bg)] border border-[var(--color-error)] rounded-md text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-[var(--color-success-bg)] border border-[var(--color-success)] rounded-md text-sm text-[var(--color-success)]">
          ✓ Invitation sent successfully!
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-2"
        >
          Email Address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          disabled={isLoading || success}
          className="input"
          required
        />
      </div>

      <div>
        <label
          htmlFor="role"
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-2"
        >
          Access Level
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as "VIEWER" | "EDITOR")}
          disabled={isLoading || success}
          className="input"
        >
          <option value="VIEWER">Can view</option>
          <option value="EDITOR">Can edit</option>
        </select>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          {role === "VIEWER"
            ? "Can view but not make changes"
            : "Can view and edit content"}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="btn btn-ghost"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || success}
          className="btn btn-primary"
        >
          {isLoading ? "Sending..." : success ? "Sent!" : "Send Invite"}
        </button>
      </div>
    </form>
  );
}
