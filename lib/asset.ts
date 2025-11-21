// lib/asset.ts
import crypto from "crypto";
import path from "path";
import fetch from "node-fetch"; // if you don't have node-fetch, use global fetch in Node 18+

export async function bufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed fetching ${url}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function guessExtFromContentType(contentType?: string, fallback?: string) {
  if (!contentType) return fallback ?? "bin";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("bmp")) return "bmp";
  return fallback ?? "bin";
}

export function extFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).replace(".", "");
    if (ext) return ext;
  } catch {}
  return null;
}
