"use client";

import { useState } from "react";

interface InviteFormProps {
  documentId: string;
  onClose: () => void;
}

export default function InviteForm({ documentId, onClose }: InviteFormProps) {
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
      const response = await fetch(`/api/documents/${documentId}/invite`, {
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
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "#d1fae5",
            color: "#065f46",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          Invitation sent successfully!
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="email"
          style={{
            display: "block",
            marginBottom: 8,
            fontSize: 14,
            fontWeight: 500,
            color: "#374151",
          }}
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
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
            outline: "none",
          }}
          required
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label
          htmlFor="role"
          style={{
            display: "block",
            marginBottom: 8,
            fontSize: 14,
            fontWeight: 500,
            color: "#374151",
          }}
        >
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as "VIEWER" | "EDITOR")}
          disabled={isLoading || success}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
            outline: "none",
            background: "white",
          }}
        >
          <option value="VIEWER">Viewer (can view only)</option>
          <option value="EDITOR">Editor (can edit)</option>
        </select>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          style={{
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "white",
            color: "#374151",
            fontSize: 14,
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || success}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: 6,
            background: isLoading || success ? "#9ca3af" : "#2563eb",
            color: "white",
            fontSize: 14,
            fontWeight: 500,
            cursor: isLoading || success ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Sending..." : success ? "Sent!" : "Send Invitation"}
        </button>
      </div>
    </form>
  );
}
