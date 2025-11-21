// app/api/documents/[id]/export/route.ts
import { NextResponse } from "next/server";
import JSZip from "jszip";
import TurndownService from "turndown";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkDocumentPermission } from "@/lib/services/permissions";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { parse as parseHtml } from "node-html-parser";
import crypto from "crypto";
import path from "path";
import fs from "fs";

function sanitizeFilename(s: string) {
  return (s || "document").replace(/[\/\\?%*:|"<>]/g, "_").slice(0, 120);
}

function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function guessExtFromUrlOrContentType(url?: string, contentType?: string) {
  // Prefer extension from URL if available
  if (url) {
    try {
      const u = new URL(url, "http://example.com"); // base in case of relative
      const ext = path.extname(u.pathname || "").replace(".", "");
      if (ext) return ext.toLowerCase();
    } catch {}
  }
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
    if (ct.includes("png")) return "png";
    if (ct.includes("gif")) return "gif";
    if (ct.includes("svg")) return "svg";
    if (ct.includes("webp")) return "webp";
    if (ct.includes("bmp")) return "bmp";
  }
  return "bin";
}

async function fetchBufferForUrl(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
  // Data URL
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const meta = url.substring(5, comma);
    const isBase64 = meta.includes(";base64");
    const contentType = meta.split(";")[0] || "application/octet-stream";
    const payload = url.substring(comma + 1);
    const buf = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    return { buffer: buf, contentType };
  }

  // Local uploads path (relative)
  if (url.startsWith("/uploads/") || url.startsWith("/public/uploads/")) {
    // map /uploads/... to public/uploads/...
    const rel = url.replace(/^\/+/, ""); // uploads/...
    const filePath = path.join(process.cwd(), "public", rel);
    const buf = await fs.promises.readFile(filePath);
    // Try to guess content type by extension
    const ext = path.extname(filePath).replace(".", "");
    const ct = ext ? `image/${ext}` : undefined;
    return { buffer: buf, contentType: ct };
  }

  // Remote URL (http/https). Use global fetch.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const ct = res.headers.get("content-type") ?? undefined;
    return { buffer: buf, contentType: ct ?? undefined };
  } catch (err) {
    // Re-throw with context
    throw new Error(`Error fetching ${url}: ${(err as Error).message}`);
  }
}

/**
 * Walk a Tiptap/ProseMirror JSON tree and collect image nodes' src values.
 * Also returns a reference to the node objects so they can be modified in-place.
 */
function collectImageNodesFromJson(json: any): { node: any; path: string[] }[] {
  const results: { node: any; path: string[] }[] = [];

  function walk(node: any, pathArr: string[]) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((n, idx) => walk(n, pathArr.concat(String(idx))));
    } else if (typeof node === "object") {
      // If this is an image node with attrs.src -> capture it
      if (node.type === "image" && node.attrs && node.attrs.src) {
        results.push({ node, path: pathArr.slice() });
      }
      for (const key of Object.keys(node)) {
        walk(node[key], pathArr.concat(key));
      }
    }
  }

  walk(json, []);
  return results;
}

export async function GET(_req: Request, context: { params: any }) {
  try {
    // Next.js dynamic params come as a Promise in some runtimes — await them
    const resolvedParams = (await context.params) as { id?: string };
    const docId = resolvedParams?.id;

    if (!docId) {
      return NextResponse.json({ error: "Missing document id" }, { status: 400 });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // permission check
    let perms: { canView?: boolean } | null = null;
    try {
      perms = await checkDocumentPermission(session.user.id, docId);
    } catch (permErr) {
      console.error("[EXPORT] permission check error:", permErr);
      return NextResponse.json({ error: "Permission check failed" }, { status: 500 });
    }
    if (!perms?.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // fetch document
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        title: true,
        htmlContent: true,
        contentJson: true,
        yjsSnapshot: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const zip = new JSZip();
    const safeTitle = sanitizeFilename(doc.title || "document");

    // Prefer server-stored HTML if available
    let html: string | null = doc.htmlContent ?? null;

    // If no HTML but JSON exists, try to render JSON -> HTML using Tiptap Editor (server-side).
    // This may fail in some environments; we wrap in try/catch and fallback to including JSON.
    if (!html && doc.contentJson) {
      try {
        const content = doc.contentJson as unknown as JSONContent;
        const editor = new Editor({
          extensions: [StarterKit],
          content,
          editable: false,
        });
        html = editor.getHTML();
        try {
          editor.destroy();
        } catch (e) {
          // ignore destroy errors
        }
      } catch (err) {
        console.warn("[EXPORT] failed to render contentJson -> HTML:", err);
        html = null;
      }
    }

    // We'll build a manifest describing assets and files
    const manifest: any = {
      version: "1.0",
      producer: "notionclonenextjs",
      createdAt: new Date().toISOString(),
      documentFile: "document.json",
      htmlFile: html ? "document.html" : null,
      yjsSnapshotFile: doc.yjsSnapshot ? `${safeTitle}.snapshot.b64` : null,
      assets: [] as Array<{
        assetId: string;
        file: string;
        originalUrl?: string;
        contentType?: string | null;
        size?: number | null;
        sha256: string;
      }>,
    };

    // Collect candidate image URLs from contentJson and html
    const imageEntries: { url: string; via: "json" | "html"; jsonNode?: any }[] = [];

    if (doc.contentJson) {
      const json = doc.contentJson as any;
      const nodes = collectImageNodesFromJson(json);
      for (const n of nodes) {
        const src = n.node?.attrs?.src;
        if (src) imageEntries.push({ url: src, via: "json", jsonNode: n.node });
      }
    }

    if (html) {
      try {
        const root = parseHtml(html);
        const imgs = root.querySelectorAll("img");
        imgs.forEach((img) => {
          const src = img.getAttribute("src");
          if (src) imageEntries.push({ url: src, via: "html" });
        });
      } catch (err) {
        console.warn("[EXPORT] failed parsing html for images:", err);
      }
    }

    // Fetch each unique image and add to zip assets/
    // Map sha -> { sha, ext, buffer, originalUrl, contentType }
    const seen = new Map<
      string,
      { sha: string; ext: string; buffer: Buffer; originalUrl: string; contentType?: string | null }
    >();

    for (const entry of imageEntries) {
      const url = entry.url;
      try {
        const { buffer, contentType } = await fetchBufferForUrl(url);
        const sha = sha256Hex(buffer);
        if (seen.has(sha)) {
          // already fetched/deduped
          continue;
        }
        const ext = guessExtFromUrlOrContentType(url, contentType);
        seen.set(sha, { sha, ext, buffer, originalUrl: url, contentType: contentType ?? null });
      } catch (err) {
        console.warn("[EXPORT] could not fetch asset", url, (err as Error).message);
        // skip this asset but continue exporting other content
      }
    }

    // Add assets to zip and add manifest entries
    for (const [sha, info] of seen) {
      const filename = `${sha}.${info.ext}`;
      zip.file(path.posix.join("assets", filename), info.buffer);
      manifest.assets.push({
        assetId: sha,
        file: `assets/${filename}`,
        originalUrl: info.originalUrl,
        contentType: info.contentType ?? null,
        size: info.buffer.length,
        sha256: sha,
      });
    }

    // Prepare contentJson: replace src with assetId token + keep original src in _originalSrc
    if (doc.contentJson) {
      const json = JSON.parse(JSON.stringify(doc.contentJson)); // deep clone to avoid mutating DB object
      function replaceInJson(node: any) {
        if (!node) return;
        if (Array.isArray(node)) {
          node.forEach(replaceInJson);
        } else if (typeof node === "object") {
          if (node.type === "image" && node.attrs && node.attrs.src) {
            const src = node.attrs.src;
            // find SHA for this src if available
            for (const [sha, info] of seen) {
              if (info.originalUrl === src || src.includes(sha)) {
                node.attrs.assetId = sha;
                node.attrs._originalSrc = src;
                delete node.attrs.src;
                break;
              }
            }
          }
          for (const k of Object.keys(node)) {
            replaceInJson(node[k]);
          }
        }
      }
      try {
        replaceInJson(json);
        zip.file("document.json", JSON.stringify(json, null, 2));
      } catch (err) {
        console.warn("[EXPORT] failed to process contentJson for export:", err);
        // As fallback include original contentJson raw
        zip.file("document.json", JSON.stringify(doc.contentJson, null, 2));
      }
    } else {
      // no contentJson; include an empty placeholder so importer can detect absence
      zip.file("document.json", JSON.stringify({}, null, 2));
    }

    // Prepare HTML: replace <img src="..."> with data-asset-id and data-original-src attributes
    if (html) {
      try {
        const root = parseHtml(html);
        const imgs = root.querySelectorAll("img");
        imgs.forEach((img) => {
          const src = img.getAttribute("src");
          if (!src) return;
          for (const [sha, info] of seen) {
            if (info.originalUrl === src || src.includes(info.sha)) {
              img.setAttribute("data-asset-id", sha);
              img.setAttribute("data-original-src", src);
              img.removeAttribute("src");
              break;
            }
          }
        });
        zip.file("document.html", root.toString());
      } catch (err) {
        console.warn("[EXPORT] failed to transform html images:", err);
        zip.file("document.html", html);
      }
    }

    // If html was not available but contentJson existed, include HTML rendered earlier (if any)
    if (!html && doc.contentJson) {
      // In earlier code we attempted rendering contentJson -> html. If it succeeded, `html` would be set.
      // If it wasn't set, we already included the JSON. Nothing else to do.
    }

    // Convert any found HTML to Markdown as before (but for portability we write markdown only if html exists)
    if (html) {
      try {
        const turndown = new TurndownService({ headingStyle: "atx" });
        const markdown = turndown.turndown(html);
        zip.file(`${safeTitle}.md`, markdown);
      } catch (err) {
        console.warn("[EXPORT] turndown failed:", err);
      }
      zip.file(`${safeTitle}.html`, html);
      zip.file(`${safeTitle}.json`, JSON.stringify(doc.contentJson ?? null, null, 2));
      zip.file(
        "meta.json",
        JSON.stringify({ id: doc.id, title: doc.title ?? null, exportedAt: new Date().toISOString() }, null, 2),
      );
    } else if (doc.contentJson) {
      zip.file(`${safeTitle}.json`, JSON.stringify(doc.contentJson, null, 2));
      zip.file(
        "README.md",
        `This export contains the editor's JSON representation (TipTap/ProseMirror). If you want HTML/Markdown, restore the JSON into your editor (client) and then export HTML/Markdown from the client.\n`,
      );
      zip.file(
        "meta.json",
        JSON.stringify(
          {
            id: doc.id,
            title: doc.title ?? null,
            exportedAt: new Date().toISOString(),
            note: "Exported contentJson because htmlContent was not available.",
          },
          null,
          2,
        ),
      );
    } else {
      // no html and no contentJson: include minimal meta
      zip.file(
        "meta.json",
        JSON.stringify({ id: doc.id, title: doc.title ?? null, exportedAt: new Date().toISOString() }, null, 2),
      );
    }

    // Add manifest.json (describing files + assets)
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    // Always include Yjs snapshot if present (base64) so a full restore is possible
    if (doc.yjsSnapshot) {
      try {
        const bytes = doc.yjsSnapshot instanceof Buffer ? doc.yjsSnapshot : Buffer.from(doc.yjsSnapshot as any);
        const base64 = bytes.toString("base64");
        zip.file(`${safeTitle}.snapshot.b64`, base64);
      } catch (err) {
        console.warn("[EXPORT] Failed to include yjs snapshot:", err);
      }
    }

    // If zip would be empty (shouldn't happen), add minimal meta
    const entries = Object.keys(zip.files);
    if (entries.length === 0) {
      zip.file(
        "meta.json",
        JSON.stringify({ id: doc.id, title: doc.title ?? null, exportedAt: new Date().toISOString() }, null, 2),
      );
    }

    // generate zip buffer
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const uint8 = Uint8Array.from(buf);

    const filename = `${safeTitle}.zip`;

    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[EXPORT] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
