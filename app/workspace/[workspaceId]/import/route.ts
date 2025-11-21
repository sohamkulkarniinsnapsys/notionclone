// app/workspace/[workspaceId]/import/route.ts
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { marked } from "marked";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { parse as parseHtml } from "node-html-parser";
import path from "path";

import { uploadBufferToStorage } from "@/lib/storage";
import { sha256Hex } from "@/lib/asset";

/**
 * Convert HTML -> TipTap JSON on the server using jsdom for a DOM environment.
 * Returns JSONContent or null on failure.
 *
 * Uses dynamic import of jsdom so the file still loads if jsdom isn't installed.
 */
// inside app/workspace/[workspaceId]/import/route.ts
async function convertHtmlToContentJson(html: string): Promise<JSONContent | null> {
  if (!html) return null;

  let JSDOM: any;
  try {
    JSDOM = (await import("jsdom")).JSDOM;
  } catch (e) {
    console.warn("[IMPORT] jsdom not available; skipping html->contentJson conversion", e);
    return null;
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    resources: "usable",
    runScripts: "outside-only",
  });

  const injected: { window?: boolean; document?: boolean; navigator?: boolean } = {};

  try {
    if (typeof (global as any).window === "undefined") {
      (global as any).window = dom.window;
      injected.window = true;
    }
    if (typeof (global as any).document === "undefined") {
      (global as any).document = dom.window.document;
      injected.document = true;
    }
    if (typeof (global as any).navigator === "undefined") {
      (global as any).navigator = dom.window.navigator;
      injected.navigator = true;
    }

    let editor: Editor | null = null;
    try {
      editor = new Editor({
        extensions: [StarterKit],
        content: html,
        editable: false,
      });
      const json = editor.getJSON() as JSONContent;
      try { editor.destroy(); } catch {}
      return json;
    } catch (err) {
      console.warn("[IMPORT] html -> contentJson conversion inside jsdom failed:", err);
      try { if (editor) editor.destroy(); } catch {}
      return null;
    }
  } finally {
    // remove only those globals we injected
    try {
      if (injected.window) { try { delete (global as any).window; } catch { (global as any).window = undefined; } }
      if (injected.document) { try { delete (global as any).document; } catch { (global as any).document = undefined; } }
      if (injected.navigator) { try { delete (global as any).navigator; } catch { (global as any).navigator = undefined; } }
    } catch {}
    try { dom.window.close(); } catch {}
  }
}


function sanitizeFilename(s: string) {
  return (s || "document").replace(/[\/\\?%*:|"<>]/g, "_").slice(0, 120);
}

/** Walk a TipTap/ProseMirror JSON tree and replace image nodes with a replacer fn */
function walkAndReplaceJson(node: any, replacer: (imgNode: any) => void) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkAndReplaceJson(n, replacer));
  } else if (typeof node === "object") {
    if (node.type === "image" && node.attrs && (node.attrs.assetId || node.attrs.src)) {
      replacer(node);
    }
    for (const k of Object.keys(node)) {
      walkAndReplaceJson(node[k], replacer);
    }
  }
}

/** Convert a Buffer (Node) into a Uint8Array suitable for Prisma Bytes fields */
function bufferToPrismaBytes(buf: Buffer | Uint8Array | undefined | null): Uint8Array | undefined {
  if (!buf) return undefined;
  // If it's already a Uint8Array (and not a Buffer), return as-is
  if (buf instanceof Uint8Array && !(buf instanceof Buffer)) {
    return buf as Uint8Array;
  }
  // If it's a Buffer or Uint8Array view, construct a new Uint8Array referencing the same memory
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as Uint8Array);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

export async function POST(req: Request, context: { params: any }) {
  try {
    const resolvedParams = (await context.params) as { workspaceId?: string };
    const workspaceId = resolvedParams?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // membership check (use prisma directly)
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: session.user.id },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Expect multipart form POST with field 'file'
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing file (form field 'file')" }, { status: 400 });
    }

    // Read zip
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);

    // Try manifest.json first (preferred)
    const manifestEntry = zip.file("manifest.json");
    if (manifestEntry) {
      // Manifest-aware import
      const manifestStr = await manifestEntry.async("string");
      let manifest: any;
      try {
        manifest = JSON.parse(manifestStr);
      } catch (err) {
        console.warn("[IMPORT] manifest.json parse failed, falling back to legacy import", err);
        manifest = null;
      }

      if (manifest) {
        // Load assets: manifest.assets should be an array of { assetId, file, sha256, contentType? }
        const assetMap: Record<
          string,
          {
            url: string;
            key: string;
            sha: string;
            file: string;
            contentType?: string | null;
          }
        > = {};

        const assets = Array.isArray(manifest.assets) ? manifest.assets : [];

        for (const asset of assets) {
          try {
            if (!asset?.file) {
              console.warn("[IMPORT] asset missing file field in manifest, skipping:", asset);
              continue;
            }
            const zipEntry = zip.file(asset.file);
            if (!zipEntry) {
              console.warn("[IMPORT] asset file listed in manifest not present in zip:", asset.file);
              continue;
            }
            // NOTE: JSZip's nodebuffer yields a Buffer in Node env
            const data: Buffer = await zipEntry.async("nodebuffer");

            // verify sha256 if present -- sha256Hex may be async, so await defensively
            let computedSha: string;
            try {
              computedSha = typeof sha256Hex === "function" ? await sha256Hex(data) : String(data);
            } catch (e) {
              // If hash computation fails, surface an import error
              console.error("[IMPORT] sha256 computation failed for", asset.file, e);
              return NextResponse.json({ error: "Asset checksum computation failed" }, { status: 500 });
            }

            if (asset.sha256 && String(asset.sha256) !== String(computedSha)) {
              console.warn(
                "[IMPORT] asset checksum mismatch for",
                asset.file,
                "manifest sha:",
                asset.sha256,
                "computed:",
                computedSha,
              );
              return NextResponse.json({ error: "Asset checksum mismatch" }, { status: 400 });
            }

            // Determine extension from filename or manifest contentType
            const ext =
              (asset.file && path.extname(asset.file).replace(".", "")) ||
              (asset.contentType ? asset.contentType.split("/").pop() : "bin");
            const key = `images/${computedSha}.${ext}`;
            // Upload to storage; uploadBufferToStorage should be idempotent (skip if exists)
            const uploaded = await uploadBufferToStorage(data, key, asset.contentType ?? undefined);
            assetMap[asset.assetId || computedSha] = {
              url: uploaded.url,
              key: uploaded.key || key,
              sha: computedSha,
              file: asset.file,
              contentType: asset.contentType ?? null,
            };
          } catch (err) {
            console.error("[IMPORT] failed to process asset", asset, err);
            return NextResponse.json({ error: "Failed to process assets" }, { status: 500 });
          }
        } // end for assets

        // Read document json from manifest.documentFile, fallback to document.json
        const docFileName = manifest.documentFile || "document.json";
        let contentJson: JSONContent | null = null;
        if (zip.file(docFileName)) {
          try {
            const raw = await zip.file(docFileName)!.async("string");
            contentJson = JSON.parse(raw) as JSONContent;
            // Replace image nodes that reference assetId -> set attrs.src = uploaded url
            walkAndReplaceJson(contentJson, (imgNode) => {
              const assetId = imgNode.attrs?.assetId;
              if (assetId && assetMap[assetId]) {
                imgNode.attrs.src = assetMap[assetId].url;
                // keep provenance fields if wanted
                imgNode.attrs._importedUrl = assetMap[assetId].url;
                // optionally remove assetId
                delete imgNode.attrs.assetId;
              } else if (imgNode.attrs?._originalSrc) {
                // fallback to original src if present in export
                imgNode.attrs.src = imgNode.attrs._originalSrc;
              }
            });
          } catch (err) {
            console.warn("[IMPORT] failed to parse document.json from zip", err);
            contentJson = null;
          }
        }

        // Read and rewrite HTML if present
        let htmlContent: string | null = null;
        const htmlFileName = manifest.htmlFile || "document.html";
        if (zip.file(htmlFileName)) {
          try {
            const rawHtml = await zip.file(htmlFileName)!.async("string");
            const root = parseHtml(rawHtml);
            const imgs = root.querySelectorAll("img");
            imgs.forEach((img) => {
              const assetId = img.getAttribute("data-asset-id");
              if (assetId && assetMap[assetId]) {
                img.setAttribute("src", assetMap[assetId].url);
                img.removeAttribute("data-asset-id");
                img.removeAttribute("data-original-src");
              } else {
                const orig = img.getAttribute("data-original-src");
                if (orig) {
                  img.setAttribute("src", orig);
                  img.removeAttribute("data-original-src");
                }
              }
            });
            htmlContent = root.toString();

            // If we have HTML but no contentJson, try to convert HTML -> TipTap JSON using jsdom
            if (!contentJson && htmlContent) {
              try {
                const converted = await convertHtmlToContentJson(htmlContent);
                if (converted) {
                  contentJson = converted;
                } else {
                  // conversion skipped or failed — keep htmlContent but contentJson remains null
                  console.warn("[IMPORT] html -> contentJson conversion skipped/failed (manifest-aware)");
                }
              } catch (err) {
                console.warn("[IMPORT] html -> contentJson conversion error (manifest-aware):", err);
              }
            }
          } catch (err) {
            console.warn("[IMPORT] failed to parse/transform document.html from zip", err);
            htmlContent = null;
          }
        }

        // Snapshot handling (manifest.yjsSnapshotFile or autodiscover)
        let yjsSnapshotBuffer: Buffer | undefined = undefined;
        const snapshotFileName = manifest.yjsSnapshotFile || `${sanitizeFilename("snapshot")}.snapshot.b64`;
        if (manifest.yjsSnapshotFile && zip.file(manifest.yjsSnapshotFile)) {
          try {
            const b64 = await zip.file(manifest.yjsSnapshotFile)!.async("string");
            const trimmed = String(b64).trim();
            yjsSnapshotBuffer = Buffer.from(trimmed, "base64");
          } catch (err) {
            console.warn("[IMPORT] failed to decode yjs snapshot from zip", err);
          }
        } else {
          // also check if there's a file like *.snapshot.b64 in zip
          const snapEntryName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".snapshot.b64"));
          if (snapEntryName) {
            try {
              const b64 = await zip.file(snapEntryName)!.async("string");
              yjsSnapshotBuffer = Buffer.from(String(b64).trim(), "base64");
            } catch (err) {
              console.warn("[IMPORT] failed to decode autodiscovered snapshot", err);
            }
          }
        }

        // Also find title sourced from meta.json or filename or manifest
        let titleFromMeta: string | null = null;
        if (zip.file("meta.json")) {
          try {
            const metaStr = await zip.file("meta.json")!.async("string");
            const meta = JSON.parse(metaStr);
            if (meta?.title) titleFromMeta = String(meta.title);
          } catch (err) {
            // ignore meta parse errors
          }
        }

        // filenameTitle derived from uploaded file name (synchronous)
        const filenameTitle = (file?.name && sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""))) || null;

        // === SAFELY RESOLVE MANIFEST TITLE ===
        // manifest.title might (unexpectedly) be a Promise-like value — coerce safely
        let safeManifestTitle: string | null = null;
        try {
          const maybeTitle = manifest && (manifest.title as any);
          if (typeof maybeTitle === "string") {
            safeManifestTitle = maybeTitle;
          } else if (maybeTitle && typeof maybeTitle.then === "function") {
            try {
              const awaited = await maybeTitle;
              if (typeof awaited === "string") safeManifestTitle = awaited;
            } catch (e) {
              console.warn("[IMPORT] manifest.title promise rejected or not a string", e);
              safeManifestTitle = null;
            }
          } else {
            safeManifestTitle = null;
          }
        } catch (e) {
          safeManifestTitle = null;
        }

        // Final title precedence: meta.json title -> manifest.title -> filename -> fallback
        const finalTitle =
          (typeof titleFromMeta === "string" ? titleFromMeta : null) ??
          safeManifestTitle ??
          filenameTitle ??
          "Imported Document";

        // Create document row in DB (include contentJson and htmlContent & snapshot)
        const createData: any = {
          title: finalTitle,
          workspaceId,
          createdBy: session.user.id,
          ownerId: session.user.id,
        };
        if (contentJson) createData.contentJson = contentJson;
        if (htmlContent) createData.htmlContent = htmlContent;
        if (yjsSnapshotBuffer) {
          // convert Buffer -> Uint8Array for Prisma if necessary
          createData.yjsSnapshot = bufferToPrismaBytes(yjsSnapshotBuffer) as any;
        }

        // create document row (manifest branch or legacy branch) - example for manifest branch
        const createdDoc = await prisma.document.create({
          data: createData,
          select: { id: true, contentJson: true, htmlContent: true, yjsSnapshot: true },
        });

        // Log what we saved so you can debug easily
        console.log("[IMPORT] createdDoc:", {
          id: createdDoc.id,
          hasContentJson: !!createData.contentJson,
          hasHtmlContent: !!createData.htmlContent,
          hasSnapshot: !!createData.yjsSnapshot,
        });

        // Create DocumentSnapshot row if necessary (seed initial JSON)
        if (createData.contentJson) {
          try {
            await prisma.documentSnapshot.create({
              data: {
                documentId: createdDoc.id,
                snapshot: new Uint8Array([]), // empty snapshot bytes (schema allowing)
                jsonContent: createData.contentJson,
              },
            });
          } catch (err) {
            console.warn("[IMPORT] failed to create DocumentSnapshot row for contentJson", err);
          }
        }


        // Create DocumentSnapshot row if snapshot exists, else create an initial snapshot/inital json
        if (yjsSnapshotBuffer) {
          try {
            const snapBytes = bufferToPrismaBytes(yjsSnapshotBuffer);
            await prisma.documentSnapshot.create({
              data: {
                documentId: createdDoc.id,
                snapshot: snapBytes as any,
                // NOTE: removed `createdBy` because your Prisma model doesn't include that scalar field.
                // If you want to save the user who created the snapshot, add the correct field to your Prisma schema and set it here.
                jsonContent: contentJson ?? undefined,
              } as any,
            });
          } catch (err) {
            console.warn("[IMPORT] failed to create DocumentSnapshot row for imported snapshot", err);
          }
        } else if (contentJson) {
          try {
            await prisma.documentSnapshot.create({
              data: {
                documentId: createdDoc.id,
                snapshot: new Uint8Array([]),
                jsonContent: contentJson,
              } as any,
            });
          } catch (err) {
            // ignore
          }
        }

        const docUrl = `/workspace/${workspaceId}/documents/${createdDoc.id}`;
        return NextResponse.json({ ok: true, id: createdDoc.id, url: docUrl }, { status: 200 });
      } // end if manifest parsed
    } // end if manifestEntry

    // Fallback: legacy import behavior (scan for html/md/json/snapshot)
    // prioritized: html -> md -> json
    let htmlContent: string | null = null;
    let mdContent: string | null = null;
    let jsonContent: any | null = null;
    let snapshotBase64: string | null = null;
    let titleFromMeta: string | null = null;

    // Try to read meta.json (optional)
    if (zip.file("meta.json")) {
      try {
        const metaStr = await zip.file("meta.json")!.async("string");
        const meta = JSON.parse(metaStr);
        if (meta?.title) titleFromMeta = String(meta.title);
      } catch (e) {
        // ignore meta read failures
      }
    }

    // find html, md, json, snapshot by scanning filenames
    for (const name of entries) {
      const n = name.toLowerCase();
      if (n.endsWith(".html") && !htmlContent) {
        htmlContent = await zip.file(name)!.async("string");
      } else if ((n.endsWith(".md") || n.endsWith(".markdown")) && !mdContent) {
        mdContent = await zip.file(name)!.async("string");
      } else if ((n.endsWith(".json") || n.endsWith(".content.json")) && !jsonContent) {
        try {
          const s = await zip.file(name)!.async("string");
          jsonContent = JSON.parse(s);
        } catch (e) {
          // if parse fails, keep as null
        }
      } else if (n.endsWith(".snapshot.b64") && !snapshotBase64) {
        snapshotBase64 = await zip.file(name)!.async("string");
      }
    }

    // If md present but no html, convert md -> html
    if (!htmlContent && mdContent) {
      try {
        htmlContent = marked.parse(mdContent);
      } catch (e) {
        console.warn("[IMPORT] markdown -> html conversion failed", e);
      }
    }

    // If we have html but no contentJson, try html -> contentJson via TipTap server-side (jsdom)
    let contentJsonForLegacy: JSONContent | null = null;
    if (htmlContent) {
      try {
        const converted = await convertHtmlToContentJson(htmlContent);
        if (converted) {
          contentJsonForLegacy = converted;
        } else {
          console.warn("[IMPORT] html -> contentJson conversion skipped/failed (legacy)");
        }
      } catch (err) {
        console.warn("[IMPORT] html -> contentJson conversion failed (legacy):", err);
        contentJsonForLegacy = null;
      }
    }

    // If still no contentJson but jsonContent exists from ZIP, use that
    if (!contentJsonForLegacy && jsonContent) {
      contentJsonForLegacy = jsonContent as JSONContent;
    }

    // Title fallback (defensive typing)
    const filenameTitle = (file?.name && sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""))) || null;
    const title =
      (typeof titleFromMeta === "string" ? titleFromMeta : null) ??
      filenameTitle ??
      "Imported Document";

    // Create document row (include htmlContent & contentJson if available)
    const createDataLegacy: any = {
      title,
      workspaceId,
      createdBy: session.user.id,
      ownerId: session.user.id,
    };

    if (htmlContent) createDataLegacy.htmlContent = htmlContent;
    if (contentJsonForLegacy) createDataLegacy.contentJson = contentJsonForLegacy;

    // yjsSnapshot bytes (optional) — convert base64 -> Buffer
    if (snapshotBase64) {
      try {
        const trimmed = snapshotBase64.trim();
        const bytes = Buffer.from(trimmed, "base64");
        // For the document.yjsSnapshot field we convert to Uint8Array if Prisma types require it.
        createDataLegacy.yjsSnapshot = bufferToPrismaBytes(bytes) as any;
      } catch (err) {
        console.warn("[IMPORT] failed to decode snapshot base64:", err);
      }
    }

    // create document
    const doc = await prisma.document.create({
      data: createDataLegacy,
      select: { id: true },
    });

    // If snapshot included, also create a DocumentSnapshot row to seed history (optional)
    if (snapshotBase64) {
      try {
        const bytes = Buffer.from(snapshotBase64.trim(), "base64");
        const snapBytes = bufferToPrismaBytes(bytes);
        await prisma.documentSnapshot.create({
          data: {
            documentId: doc.id,
            snapshot: snapBytes as any,
            // removed createdBy per schema
            jsonContent: contentJsonForLegacy ?? undefined,
          } as any,
        });
      } catch (err) {
        console.warn("[IMPORT] failed to create DocumentSnapshot row:", err);
      }
    } else if (contentJsonForLegacy) {
      // create an initial snapshot row using contentJson (optional; empty snapshot bytes are allowed in your schema)
      try {
        await prisma.documentSnapshot.create({
          data: {
            documentId: doc.id,
            snapshot: new Uint8Array([]),
            jsonContent: contentJsonForLegacy,
          } as any,
        });
      } catch (err) {
        // ignore
      }
    }

    // return URL to open the new doc
    const docUrl = `/workspace/${workspaceId}/documents/${doc.id}`;
    return NextResponse.json({ ok: true, id: doc.id, url: docUrl }, { status: 200 });
  } catch (err) {
    console.error("[IMPORT] error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
