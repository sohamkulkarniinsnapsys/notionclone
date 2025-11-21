// app/api/uploads/route.ts
export const runtime = "nodejs"; // valid: "nodejs" — allow Node APIs (fs)

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Compute SHA256 hex of a Buffer
 */
function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Guess extension from filename (safe)
 */
function guessExtFromFilename(name?: string) {
  if (!name) return "bin";
  const ext = path.extname(name).replace(".", "").toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

/**
 * Basic filename sanitizer: keep only safe chars and limit length
 */
function sanitizeBasename(name?: string) {
  if (!name) return "file";
  const base = path.basename(name).replace(/[\/\\?%*:|"<>]/g, "_");
  return base.slice(0, 120);
}

/**
 * Validate mime type is allowed (images by default)
 */
function isAllowedContentType(contentType?: string) {
  if (!contentType) return false;
  return /^image\/(png|jpeg|jpg|gif|webp|avif|x-icon|svg\+xml|bmp)$/.test(contentType.toLowerCase());
}

const UPLOADS_PUBLIC_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_BYTES_DEFAULT = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file (form field 'file')" }, { status: 400 });
    }

    // Read file into Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Size check
    const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || MAX_BYTES_DEFAULT);
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large" }, { status: 413 });
    }

    // Content type validation
    const contentType = (file as any).type || "";
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 415 });
    }

    // compute sha and prepare key
    const sha = sha256Hex(buffer);
    const ext = guessExtFromFilename((file as any)?.name || undefined);
    const safeBase = sanitizeBasename((file as any)?.name || sha);
    const key = `images/${sha}.${ext}`;
    const destPath = path.join(UPLOADS_PUBLIC_DIR, key);

    // Ensure destination directories exist
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    // Write file only if missing (idempotent)
    const exists = await fs.promises
      .access(destPath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await fs.promises.writeFile(destPath, buffer);
    }

    // Public URL — use env override if provided
    const publicUrlPrefix = process.env.PUBLIC_UPLOADS_URL ?? "";
    const url = publicUrlPrefix ? `${publicUrlPrefix.replace(/\/$/, "")}/uploads/${key}` : `/uploads/${key}`;

    const headers = {
      // clients can cache uploaded images aggressively (immutable by sha)
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    return NextResponse.json(
      {
        ok: true,
        url,
        key,
        sha,
        size: buffer.length,
        contentType,
        filename: safeBase,
      },
      { status: 200, headers },
    );
  } catch (err) {
    console.error("[UPLOAD] error:", err);
    return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
}
