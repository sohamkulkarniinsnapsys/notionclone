// components/drawing/useDrawingUpload.ts
"use client";

/**
 * useDrawingUpload
 *
 * Hook to upload drawing blobs (PNG/WebP) to the app's uploads API.
 * - Posts a FormData with field "file" (filename provided or "drawing.png")
 * - Reports upload progress, supports retries and cancellation.
 * - Performs basic content-type checks.
 *
 * Integration notes for this Notion-clone repo:
 * - The project's upload endpoint is expected at: /api/uploads (existing file: app/api/uploads/route.ts).
 *   That route should accept multipart/form-data and return JSON like: { url: string, filename?: string, size?: number }
 * - If you want a separate dedicated endpoint for drawings, create /api/uploads/drawings and update UPLOAD_ENDPOINT.
 *
 * Developer note: the repository archive you uploaded during the session is at:
 *   /mnt/data/notionclonelatest.zip
 * We do NOT hardcode this path as an upload target. It's only referenced above for project context.
 *
 * Usage:
 * const { upload, uploading, progress, error, abort, reset } = useDrawingUpload();
 * const result = await upload(blob, { filename: "my-drawing.png", maxRetries: 2 });
 * // result -> { url, filename, size, status }
 */

import { useCallback, useRef, useState } from "react";

type UploadResult = {
  url: string;
  filename?: string;
  size?: number;
  status?: string;
};

type UploadOptions = {
  filename?: string;
  maxRetries?: number;
  signal?: AbortSignal; // optional external abort
  endpoint?: string; // allow override (defaults to /api/uploads)
  fieldName?: string; // default "file"
  extraFormFields?: Record<string, string>; // optional extra fields to include in formdata
  accept?: string[]; // allowed mime types
};

export function useDrawingUpload(defaultEndpoint = "/api/uploads") {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0); // 0..100
  const [error, setError] = useState<string | null>(null);
  const currentXhrRef = useRef<XMLHttpRequest | null>(null);
  const externalAbortRef = useRef<AbortSignal | null>(null);

  const reset = useCallback(() => {
    setUploading(false);
    setProgress(0);
    setError(null);
    // abort any current xhr
    if (currentXhrRef.current) {
      try {
        currentXhrRef.current.abort();
      } catch (e) {
        // ignore
      }
      currentXhrRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (currentXhrRef.current) {
      try {
        currentXhrRef.current.abort();
      } catch (e) {
        // ignore
      }
      currentXhrRef.current = null;
    }
    // if external abort signal exists and is abortable, we cannot programmatically abort it here
    // but the caller can signal their AbortController
    setUploading(false);
    setProgress(0);
    setError("aborted");
  }, []);

  /**
   * upload(blob, opts)
   * returns Promise<UploadResult>
   */
  const upload = useCallback(
    async (blob: Blob, opts?: UploadOptions): Promise<UploadResult> => {
      const {
        filename = `drawing-${Date.now()}.png`,
        maxRetries = 2,
        endpoint = defaultEndpoint,
        fieldName = "file",
        extraFormFields = {},
        accept = ["image/png", "image/webp", "image/jpeg"],
        signal,
      } = opts ?? {};

      // basic content-type check
      const mime = blob.type || "application/octet-stream";
      if (accept && accept.length > 0 && !accept.includes(mime)) {
        const msg = `Invalid content-type: ${mime}. Allowed: ${accept.join(", ")}`;
        setError(msg);
        throw new Error(msg);
      }

      externalAbortRef.current = signal ?? null;

      let attempt = 0;
      let lastError: any = null;

      setUploading(true);
      setProgress(0);
      setError(null);

      while (attempt <= maxRetries) {
        attempt++;
        // Use XMLHttpRequest to get upload progress events.
        const xhr = new XMLHttpRequest();
        currentXhrRef.current = xhr;

        const fd = new FormData();
        const file = new File([blob], filename, { type: mime });
        fd.append(fieldName, file);
        for (const k of Object.keys(extraFormFields)) {
          fd.append(k, extraFormFields[k]);
        }

        const promise: Promise<UploadResult> = new Promise((resolve, reject) => {
          xhr.upload.onprogress = function (e: ProgressEvent<EventTarget>) {
            if (e.lengthComputable) {
              const p = Math.round((e.loaded / e.total) * 100);
              setProgress(p);
            } else {
              // unknown total, set indeterminate-ish
              setProgress((prev) => Math.min(99, prev + 10));
            }
          };

          xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
              const status = xhr.status;
              // cleanup ref
              currentXhrRef.current = null;
              if (status >= 200 && status < 300) {
                // parse response JSON safely
                try {
                  const json = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                  const url = json.url || json.data?.url || json.filename ? json.filename : null;
                  // prefer json.url
                  const result: UploadResult = {
                    url: json.url ?? json.data?.url ?? "",
                    filename: json.filename ?? filename,
                    size: json.size ?? blob.size,
                    status: "ok",
                  };
                  if (!result.url || result.url.length === 0) {
                    // Some servers return just { filename } with a known base path; attempt best-effort fallback
                    // but reject if no usable url
                    reject(new Error("Upload succeeded but server returned no URL"));
                    return;
                  }
                  resolve(result);
                } catch (err) {
                  reject(new Error("Invalid JSON response from upload endpoint"));
                }
              } else {
                reject(new Error(`Upload failed with status ${status}`));
              }
            }
          };

          xhr.onerror = function (ev) {
            currentXhrRef.current = null;
            reject(new Error("Network error during upload"));
          };

          xhr.onabort = function () {
            currentXhrRef.current = null;
            reject(new Error("Upload aborted"));
          };

          try {
            xhr.open("POST", endpoint, true);
            // Important: include credentials if upload endpoint requires session cookie auth
            xhr.withCredentials = true;

            // If the caller passed in an AbortSignal, wire it up to abort the xhr
            if (signal) {
              if (signal.aborted) {
                xhr.abort();
                reject(new Error("Upload aborted by signal"));
                return;
              }
              const onAbort = () => {
                try {
                  xhr.abort();
                } catch (e) {
                  // ignore
                }
                reject(new Error("Upload aborted by signal"));
              };
              signal.addEventListener("abort", onAbort, { once: true });
            }

            xhr.send(fd);
          } catch (err) {
            currentXhrRef.current = null;
            reject(err);
          }
        });

        try {
          const res = await promise;
          // success
          setUploading(false);
          setProgress(100);
          setError(null);
          return res;
        } catch (err: any) {
          lastError = err;
          // if aborted explicitly, bubble up
          if (err?.message?.toLowerCase().includes("abort")) {
            setUploading(false);
            setError("aborted");
            throw err;
          }
          // else retry if attempts remain
          if (attempt > maxRetries) {
            setUploading(false);
            setError(err?.message ?? "upload failed");
            throw err;
          } else {
            // small backoff
            await new Promise((r) => setTimeout(r, 300 * attempt));
            setProgress(0);
            // continue loop for retry
          }
        }
      }

      // if we exit loop unexpectedly
      setUploading(false);
      setError(lastError ? String(lastError) : "upload failed");
      throw lastError ?? new Error("upload failed");
    },
    [defaultEndpoint]
  );

  return {
    upload,
    uploading,
    progress,
    error,
    abort,
    reset,
  } as const;
}

export default useDrawingUpload;
