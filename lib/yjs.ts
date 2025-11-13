// lib/yjs.ts
/**
 * Small Yjs / binary helpers used by server routes and anywhere else.
 * - base64ToUint8Array: decode base64 -> Uint8Array
 * - uint8ArrayToBase64: encode Uint8Array -> base64
 * - applyBase64ToYDoc: convenience for applying base64 update to a Y.Doc (if you need it later)
 */

import * as Y from "yjs";

/**
 * Decode a base64 string to a Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // atob returns a binary string; decode into bytes
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // convert bytes to binary string
  let binary = "";
  const chunkSize = 0x8000; // avoid stack issues on large buffers
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Helper: apply a base64-encoded update to a Y.Doc instance.
 * Useful server-side if you want to validate or manipulate a Y.Doc before persisting.
 */
export function applyBase64ToYDoc(ydoc: Y.Doc, base64Update: string) {
  const bytes = base64ToUint8Array(base64Update);
  Y.applyUpdate(ydoc, bytes);
}
