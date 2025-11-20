// server/y-websocket-server.js
import http from "http";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import dotenv from "dotenv";

dotenv.config();

import { validateToken, checkDocumentPermission, getDebugRows } from "./permissions.js";

const port = process.env.PORT
  ? Number(process.env.PORT)
  : process.env.YWS_PORT
    ? Number(process.env.YWS_PORT)
    : 1234;

const secret = process.env.NEXTAUTH_SECRET;
const ADMIN_TOKEN = process.env.YWS_ADMIN_TOKEN;

if (!secret) {
  console.error("ERROR: NEXTAUTH_SECRET is not configured");
  process.exit(1);
}

console.log("[yws] Startup DB prefix:", (process.env.DATABASE_URL || "").slice(0, 80));
console.log("[yws] NEXTAUTH_SECRET length:", (process.env.NEXTAUTH_SECRET || "").length);

const docs = new Map();
const awarenessInstances = new Map();

const messageSync = 0;
const messageAwareness = 1;

function getYDoc(docName) {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docName, doc);
    console.log(`Created new Y.Doc for room: ${docName}`);
  }
  return doc;
}

const BUFFERED_AMOUNT_THRESHOLD = 2 * 1024 * 1024;
const MAX_SEND_ERRORS = 3;

function safeSend(ws, data) {
  if (!ws) return false;
  if (ws.readyState !== WebSocket.OPEN) return false;
  const buffered = ws.bufferedAmount || 0;
  if (buffered > BUFFERED_AMOUNT_THRESHOLD) {
    console.warn("[safeSend] skipping slow client, bufferedAmount:", buffered);
    return false;
  }
  try {
    ws.send(data, (err) => {
      if (err) {
        ws.__sendErrorCount = (ws.__sendErrorCount || 0) + 1;
        if (ws.__sendErrorCount >= MAX_SEND_ERRORS) {
          console.warn("[safeSend] repeated send errors, terminating socket");
          try { ws.terminate(); } catch (e) {}
        }
      } else {
        ws.__sendErrorCount = 0;
      }
    });
    return true;
  } catch (err) {
    console.warn("[safeSend] unexpected send error:", err);
    try { ws.terminate(); } catch (e) {}
    return false;
  }
}

function getAwareness(docName, wss) {
  let awareness = awarenessInstances.get(docName);
  if (!awareness) {
    const doc = getYDoc(docName);
    awareness = new awarenessProtocol.Awareness(doc);
    awarenessInstances.set(docName, awareness);

    awareness.on("update", ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);

      wss.clients.forEach((client) => {
        try {
          if (client.readyState === WebSocket.OPEN && client.room === docName) {
            safeSend(client, buff);
          }
        } catch (err) {
          console.warn("[awareness broadcast] error", err);
        }
      });
    });
  }
  return awareness;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      connections: wss?.clients?.size || 0,
      rooms: docs.size,
    }));
    return;
  }

  if (req.url === "/admin/close-room" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    if (!ADMIN_TOKEN || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        const { documentId } = JSON.parse(body);
        if (!documentId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "documentId required" }));
          return;
        }
        let closedConnections = 0;
        wss.clients.forEach((client) => {
          if (client.room === documentId && client.readyState === WebSocket.OPEN) {
            client.close(1000, "Room closed by admin");
            closedConnections++;
          }
        });

        const doc = docs.get(documentId);
        let snapshotSize = 0;
        if (doc) {
          const snapshot = Y.encodeStateAsUpdate(doc);
          snapshotSize = snapshot.length;
        }

        docs.delete(documentId);
        awarenessInstances.delete(documentId);

        console.log(`[ADMIN] Room closed: ${documentId}, connections: ${closedConnections}, snapshot: ${snapshotSize} bytes`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, documentId, closedConnections, snapshotSize }));
      } catch (error) {
        console.error("[ADMIN] Error closing room:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
    return;
  }

  if (req.url === "/admin/rooms" && req.method === "GET") {
    const authHeader = req.headers.authorization;
    if (!ADMIN_TOKEN || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const rooms = [];
    docs.forEach((doc, docName) => {
      const awareness = awarenessInstances.get(docName);
      const connections = Array.from(wss.clients).filter(
        (client) => client.room === docName && client.readyState === WebSocket.OPEN,
      ).length;

      rooms.push({
        documentId: docName,
        connections,
        awarenessStates: awareness ? awareness.getStates().size : 0,
      });
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rooms, total: rooms.length }));
    return;
  }

  if (req.url === "/admin/broadcast" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    if (!ADMIN_TOKEN || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const { documentId, meta } = payload;
        if (!documentId || typeof documentId !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "documentId required" }));
          return;
        }
        const doc = getYDoc(documentId);
        doc.transact(() => {
          const metaMap = doc.getMap("meta");
          if (meta && typeof meta === "object") {
            Object.keys(meta).forEach((k) => metaMap.set(k, meta[k]));
          }
        });
        const update = Y.encodeStateAsUpdate(doc);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        encoding.writeVarUint8Array(encoder, update);
        const payloadBuf = encoding.toUint8Array(encoder);

        const otherClients = Array.from(wss.clients).filter(
          (client) => client.readyState === WebSocket.OPEN && client.room === documentId,
        );

        otherClients.forEach((client) => safeSend(client, payloadBuf));

        console.log(`[ADMIN/BROADCAST] meta applied for ${documentId}, sent to ${otherClients.length} client(s)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, documentId, sent: otherClients.length }));
      } catch (err) {
        console.error("[ADMIN/BROADCAST] error handling request:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "internal_error" }));
      }
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("y-websocket collaboration server\n");
});

const wss = new WebSocketServer({ server });

console.log("Starting y-websocket server...");

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const docName = url.pathname.substring(1);

  if (!docName) {
    ws.close(1008, "Document ID required");
    return;
  }

  if (!token) {
    ws.close(1008, "Authentication required - No token provided");
    return;
  }

  let tokenPayload = null;
  try {
    tokenPayload = validateToken(token, secret);
    if (!tokenPayload) {
      ws.close(1008, "Authentication failed - Invalid token");
      return;
    }
  } catch (err) {
    ws.close(1008, "Authentication failed");
    return;
  }

  if (tokenPayload.docId && tokenPayload.docId !== docName) {
    ws.close(1008, "Authentication failed - token doc mismatch");
    return;
  }

  const userId = tokenPayload.userId;
  const userEmail = tokenPayload.email;

  try {
    const permissions = await checkDocumentPermission(userId, docName);

    if (!permissions.canView) {
      // Log helpful debug info once per denial (but keep reasonable verbosity)
      const debugRows = await getDebugRows(userId, docName).catch(() => ({ workspaceMembers: [], collaborators: [], workspaceId: null }));
      console.warn(`[WS] Denying access to user ${userId} for doc ${docName}. workspaceId=${debugRows.workspaceId}`);
      console.debug(`[WS][DEBUG] workspaceMembers: ${JSON.stringify(debugRows.workspaceMembers || [], null, 2)}`);
      console.debug(`[WS][DEBUG] collaborators: ${JSON.stringify(debugRows.collaborators || [], null, 2)}`);
      ws.close(1008, "Forbidden - You do not have access to this document");
      return;
    }

    // attach to socket
    ws.userId = userId;
    ws.userEmail = userEmail;
    ws.permissions = permissions;
    ws.room = docName;
    ws.isAlive = true;
    ws.__sendErrorCount = 0;
  } catch (err) {
    console.error(`[WS] Permission check failed for user ${userId}, document ${docName}:`, err);
    ws.close(1008, "Internal error - Permission check failed");
    return;
  }

  const doc = getYDoc(docName);
  const awareness = getAwareness(docName, wss);

  ws.on("message", (message) => {
    try {
      const uint8Array = new Uint8Array(message);
      const decoder = decoding.createDecoder(uint8Array);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === messageSync) {
        const decoderCopy = decoding.createDecoder(uint8Array);
        decoding.readVarUint(decoderCopy); // skip messageType
        const syncMessageType = decoding.readVarUint(decoderCopy);

        const isDocumentUpdate = syncMessageType === 1 || syncMessageType === 2;

        if (isDocumentUpdate && !ws.permissions.canEdit) {
          const errorMsg = JSON.stringify({
            type: "error",
            error: "Forbidden - You have read-only access to this document",
            permissions: ws.permissions,
          });
          try { ws.send(errorMsg); } catch (sendErr) {}
          return;
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        const syncReply = syncProtocol.readSyncMessage(decoder, encoder, doc, ws);

        if (encoding.length(encoder) > 1) safeSend(ws, encoding.toUint8Array(encoder));

        const otherClients = Array.from(wss.clients).filter(
          (client) => client !== ws && client.readyState === WebSocket.OPEN && client.room === docName,
        );

        if (otherClients.length > 0) {
          otherClients.forEach((client) => safeSend(client, uint8Array));
        }
      } else if (messageType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          ws,
        );
      }
    } catch (err) {
      console.error("[WS] Error processing message:", err);
    }
  });

  ws.on("close", () => {
    try {
      const clientID = ws.clientID;
      if (typeof clientID !== "undefined") {
        awarenessProtocol.removeAwarenessStates(awareness, [clientID], "disconnect");
      }
    } catch (e) {}
    setTimeout(() => {
      const hasConnections = Array.from(wss.clients).some(
        (client) => client.room === docName && client.readyState === WebSocket.OPEN,
      );
      if (!hasConnections) {
        docs.delete(docName);
        awarenessInstances.delete(docName);
        console.log(`Cleaned up room: ${docName}`);
      }
    }, 5000);
  });

  ws.on("error", (err) => {
    try { ws.terminate(); } catch (e) {}
  });

  ws.on("pong", () => { ws.isAlive = true; });

  // initial sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  safeSend(ws, encoding.toUint8Array(encoder));

  // initial awareness push
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())),
    );
    safeSend(ws, encoding.toUint8Array(awarenessEncoder));
  }

  console.log(`✅ WebSocket connection established for document: ${docName} (user: ${ws.userId})`);
  console.log(`📊 Active connections: ${wss.clients.size}, Rooms: ${docs.size}`);
});

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);

wss.on("close", () => { clearInterval(pingInterval); });
wss.on("error", (err) => { console.error("WebSocket Server error:", err); });

setInterval(() => {
  const clientCount = wss.clients.size;
  if (clientCount > 0) {
    console.log(`Active connections: ${clientCount}, Rooms: ${docs.size}`);
  }
}, 60000);

server.listen(port, () => {
  console.log(`✅ y-websocket server running on ws://localhost:${port}`);
  console.log(`✅ Health check available at http://localhost:${port}/health`);
  console.log(`✅ Token validation: ${secret ? "enabled" : "disabled"}`);
});

const shutdown = () => {
  clearInterval(pingInterval);
  wss.clients.forEach((client) => client.close(1001, "Server shutting down"));
  docs.clear();
  awarenessInstances.clear();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
