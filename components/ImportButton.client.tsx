// components/ImportButton.client.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workspaceId: string;
};

export default function ImportButton({ workspaceId }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFile = async (file: File | null) => {
    setError(null);
    if (!file) return;
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file, file.name);

      const res = await fetch(`/workspace/${workspaceId}/import`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed: ${res.status}`);
      }

      // Expect server to return JSON: { ok: true, documentId: "...", document?: {...} }
      const data = await res.json().catch(() => null);

      const newDocId = data?.documentId ?? data?.id ?? data?.document?.id;
      if (!newDocId) {
        // server may return a document object or id
        console.warn("Import response did not include document id", data);
        setError("Import succeeded but server did not return a document id.");
        setUploading(false);
        return;
      }

      // Navigate to the new document page
      router.push(`/workspace/${workspaceId}/documents/${newDocId}`);
    } catch (err: any) {
      console.error("Import failed:", err);
      setError(err?.message ?? "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    handleFile(f);
    // clear input value so same file can be selected again if needed
    e.currentTarget.value = "";
  };

  return (
    <div className="flex items-center gap-2">
      <label className="btn btn-ghost cursor-pointer">
        {uploading ? "Importing..." : "Import ZIP"}
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={onPick}
          style={{ display: "none" }}
        />
      </label>
      {error && (
        <div className="text-sm text-[var(--color-error)]" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
