// components/ExportButton.client.tsx
"use client";
import React from "react";

export default function ExportButton({ docId }: { docId: string }) {
  const onExport = async () => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/export`);
      if (!res.ok) {
        let json = null;
        try { json = await res.json(); } catch {}
        const msg = json?.error ?? `Export failed: ${res.statusText} (${res.status})`;
        alert(msg);
        return;
      }

      const blob = await res.blob();

      // Try to extract filename from header
      const cd = res.headers.get("content-disposition") || "";
      let filename = `document-${docId}.zip`;
      const match = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/.exec(cd);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed — see console for details.");
    }
  };

  return (
    <button
  onClick={onExport}
  className="btn btn-ghost btn-success text-base"
  type="button"
  title="Export this document as Markdown (zip)"
>
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mr-2"
    aria-hidden="true"
  >
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
  Export (zip)
</button>
  );
}
