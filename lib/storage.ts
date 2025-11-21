// lib/storage.ts
import fs from "fs";
import path from "path";

type UploadedAsset = {
  key: string; // storage key (path)
  url: string; // publicly accessible URL
  contentType?: string;
};

const USE_S3 = process.env.USE_S3 === "true";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const S3_BASE_URL = process.env.S3_BASE_URL; // optional custom base (CloudFront)

if (USE_S3) {
  // Lazy import S3 client to avoid requiring in dev if not used
  // using AWS SDK v3
}

export async function uploadBufferToStorage(buf: Buffer, key: string, contentType?: string): Promise<UploadedAsset> {
  if (USE_S3) {
    // S3 upload path
    const { S3Client, PutObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ region: S3_REGION });
    // check if exists
    try {
      await client.send(new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: key }));
      // exists
    } catch (err) {
      // Not found: upload
      await client.send(new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: key,
        Body: buf,
        ContentType: contentType,
        ACL: "public-read",
      }));
    }
    const url = S3_BASE_URL ? `${S3_BASE_URL.replace(/\/$/, "")}/${key}` : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
    return { key, url, contentType };
  } else {
    // local filesystem: write to public/uploads/<key>
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const destPath = path.join(uploadsDir, key);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destPath, buf);
    const url = `/uploads/${key}`;
    return { key, url, contentType };
  }
}
