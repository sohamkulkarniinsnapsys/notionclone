// apps/ws-server/src/types/y-websocket-utils.d.ts
declare module "y-websocket/bin/utils" {
  import type { IncomingMessage } from "http";
  import type WebSocket from "ws";

  // Minimal shape: setupWSConnection(conn, req, options?)
  // We keep types permissive to match different y-websocket versions.
  export function setupWSConnection(conn: WebSocket, req: IncomingMessage, opts?: any): void;
}
