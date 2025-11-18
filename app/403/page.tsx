"use client";

import Link from "next/link";
import React from "react";

export default function ForbiddenPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          textAlign: "center",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          padding: 32,
          background: "var(--color-bg-secondary)",
        }}
      >
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>403 — Forbidden</h1>
        <p style={{ marginBottom: 16, color: "var(--color-text-muted)" }}>
          You don't have permission to view this document.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/" className="btn">
            Go to Home
          </Link>
          <Link href="/workspace" className="btn btn-ghost">
            Back to Workspaces
          </Link>
        </div>
      </div>
    </div>
  );
}
