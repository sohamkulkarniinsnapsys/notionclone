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
import jwt from "jsonwebtoken";
import { checkDocumentPermission } from "./permissions.js";

dotenv.config();

// Accept Railway / container PORT first, then YWS_PORT, then default 1234
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

// Store Y.Docs and Awareness instances by room name
const docs = new Map();
const awarenessInstances = new Map();

const messageSync = 0;
const messageAwareness = 1;

// Get or create Y.Doc for a room
function getYDoc(docName) {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docName, doc);
    console.log(`Created new Y.Doc for room: ${docName}`);
  }
  return doc;
}

// safeSend helper + slow-client handling
const BUFFERED_AMOUNT_THRESHOLD = 2 * 1024 * 1024; // 2MB
const MAX_SEND_ERRORS = 3;

function safeSend(ws, data) {
  if (!ws) return false;
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  // Skip very slow clients
  const buffered = ws.bufferedAmount || 0;
  if (buffered > BUFFERED_AMOUNT_THRESHOLD) {
    console.warn("[safeSend] skipping slow client, bufferedAmount:", buffered);
    // Optionally terminate if very slow
    // ws.terminate();
    return false;
  }

  try {
    // Use callback to catch send errors
    ws.send(data, (err) => {
      if (err) {
        // Increment a per-socket counter to detect repeated failures
        ws.__sendErrorCount = (ws.__sendErrorCount || 0) + 1;
        console.warn(
          "[safeSend] send error:",
          err && err.code ? err.code : err,
        );

        // If repeated errors, terminate the socket to avoid repeated ECANCELED logs
        if (ws.__sendErrorCount >= MAX_SEND_ERRORS) {
          console.warn("[safeSend] repeated send errors, terminating socket");
          try {
            ws.terminate();
          } catch (e) {
            /* ignore */
          }
        }
      } else {
        // Reset error count on success
        ws.__sendErrorCount = 0;
      }
    });
    return true;
  } catch (err) {
    console.warn(
      "[safeSend] unexpected send error:",
      err && err.code ? err.code : err,
    );
    try {
      ws.terminate();
    } catch (e) {
      /* ignore */
    }
    return false;
  }
}

// Get or create Awareness for a room (and wire broadcast using safeSend)
function getAwareness(docName, wss) {
  let awareness = awarenessInstances.get(docName);
  if (!awareness) {
    const doc = getYDoc(docName);
    awareness = new awarenessProtocol.Awareness(doc);
    awarenessInstances.set(docName, awareness);

    // Broadcast awareness updates to all clients in the room using safeSend
    awareness.on("update", ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);

      // Broadcast to all connected clients in this room
      wss.clients.forEach((client) => {
        try {
          if (client.readyState === WebSocket.OPEN && client.room === docName) {
            safeSend(client, buff);
          }
        } catch (err) {
          // safeSend handles most errors, but log unexpected ones
          console.warn("[awareness broadcast] unexpected error", err);
        }
      });
    });
  }
  return awareness;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        connections: wss?.clients?.size || 0,
        rooms: docs.size,
      }),
    );
    return;
  }

  // Admin endpoint: close room
  if (req.url === "/admin/close-room" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    const adminToken = ADMIN_TOKEN;

    // Verify admin token
    if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Parse request body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const { documentId } = JSON.parse(body);

        if (!documentId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "documentId required" }));
          return;
        }

        // Close all connections for this room
        let closedConnections = 0;
        wss.clients.forEach((client) => {
          if (
            client.room === documentId &&
            client.readyState === WebSocket.OPEN
          ) {
            client.close(1000, "Room closed by admin");
            closedConnections++;
          }
        });

        // Get final snapshot before cleanup
        const doc = docs.get(documentId);
        let snapshotSize = 0;
        if (doc) {
          const snapshot = Y.encodeStateAsUpdate(doc);
          snapshotSize = snapshot.length;
        }

        // Clean up room data
        docs.delete(documentId);
        awarenessInstances.delete(documentId);

        console.log(
          `[ADMIN] Room closed: ${documentId}, connections: ${closedConnections}, snapshot: ${snapshotSize} bytes`,
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            documentId,
            closedConnections,
            snapshotSize,
          }),
        );
      } catch (error) {
        console.error("[ADMIN] Error closing room:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });

    return;
  }

  // Admin endpoint: get room info
  if (req.url === "/admin/rooms" && req.method === "GET") {
    const authHeader = req.headers.authorization;
    const adminToken = ADMIN_TOKEN;

    // Verify admin token
    if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const rooms = [];
    docs.forEach((doc, docName) => {
      const awareness = awarenessInstances.get(docName);
      const connections = Array.from(wss.clients).filter(
        (client) =>
          client.room === docName && client.readyState === WebSocket.OPEN,
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

  // New admin endpoint: broadcast meta update into document's Y.Doc
  if (req.url === "/admin/broadcast" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    const adminToken = ADMIN_TOKEN;

    if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // parse incoming body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const { documentId, meta } = payload;

        if (!documentId || typeof documentId !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "documentId required" }));
          return;
        }

        // Apply meta to Y.Doc and broadcast update
        const doc = getYDoc(documentId);
        if (!doc) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "document not found" }));
          return;
        }

        // Apply meta fields inside a transaction
        try {
          doc.transact(() => {
            const metaMap = doc.getMap("meta");
            if (meta && typeof meta === "object") {
              Object.keys(meta).forEach((k) => {
                metaMap.set(k, meta[k]);
              });
            }
          });
        } catch (err) {
          console.error("[ADMIN/BROADCAST] apply meta error:", err);
        }

        // Build an update for clients: encode state update (delta)
        const update = Y.encodeStateAsUpdate(doc);

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        encoding.writeVarUint8Array(encoder, update);
        const payloadBuf = encoding.toUint8Array(encoder);

        // Broadcast to all clients in room
        const otherClients = Array.from(wss.clients).filter(
          (client) =>
            client.readyState === WebSocket.OPEN && client.room === documentId,
        );

        otherClients.forEach((client) => {
          safeSend(client, payloadBuf);
        });

        console.log(
          `[ADMIN/BROADCAST] meta applied for ${documentId}, sent to ${otherClients.length} client(s)`,
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            documentId,
            sent: otherClients.length,
          }),
        );
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

// Create WebSocket server
const wss = new WebSocketServer({ server });

console.log("Starting y-websocket server...");

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const docName = url.pathname.substring(1);

  if (!docName) {
    console.warn("[WS] Connection attempt without document ID");
    ws.close(1008, "Document ID required");
    return;
  }

  console.log(`[WS] New connection attempt for document: ${docName}`);

  // SECURITY: Token validation is REQUIRED
  let userId = null;
  let userEmail = null;

  if (!token) {
    console.error(`[WS] No token provided for document: ${docName}`);
    ws.close(1008, "Authentication required - No token provided");
    return;
  }

  try {
    const decoded = jwt.verify(token, secret);
    userId = decoded.userId || decoded.sub;
    userEmail = decoded.email;
    console.log(`[WS] Token verified for user: ${userId} (${userEmail})`);

    if (decoded.docId && decoded.docId !== docName) {
      console.warn(
        `[WS] Token docId mismatch: ${decoded.docId} !== ${docName}`,
      );
    }
  } catch (err) {
    console.error(
      `[WS] Token verification failed for ${docName}:`,
      err.message,
    );
    ws.close(1008, "Authentication failed - Invalid token");
    return;
  }

  // SECURITY: Check document permissions BEFORE allowing connection
  try {
    const permissions = await checkDocumentPermission(userId, docName);

    if (!permissions.canView) {
      console.warn(
        `[WS] User ${userId} denied access to document ${docName} - no view permission`,
      );
      ws.close(1008, "Forbidden - You do not have access to this document");
      return;
    }

    console.log(
      `[WS] User ${userId} granted access to ${docName} (canEdit: ${permissions.canEdit})`,
    );

    // Store user info and permissions on the WebSocket
    ws.userId = userId;
    ws.userEmail = userEmail;
    ws.permissions = permissions;
    ws.room = docName;
    ws.isAlive = true;
    ws.__sendErrorCount = 0;
  } catch (err) {
    console.error(
      `[WS] Permission check failed for user ${userId}, document ${docName}:`,
      err,
    );
    ws.close(1008, "Internal error - Permission check failed");
    return;
  }

  // Get or create doc and awareness for this room
  const doc = getYDoc(docName);
  const awareness = getAwareness(docName, wss);

  // When a new socket attaches, if there is a server-side meta map we should send it as part
  // of the initial sync step1 (syncProtocol.writeSyncStep1 covers that).
  // Handle incoming messages
  ws.on("message", (message) => {
    try {
      const uint8Array = new Uint8Array(message);
      const decoder = decoding.createDecoder(uint8Array);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === messageSync) {
        // SECURITY: Check if this is a document update (Step 2)
        // Step 1 = server sends state, Step 2 = client sends updates
        // We need to check if the message contains updates that modify the document
        const decoderCopy = decoding.createDecoder(uint8Array);
        decoding.readVarUint(decoderCopy); // skip messageType
        const syncMessageType = decoding.readVarUint(decoderCopy);

        // syncMessageType: 0 = SyncStep1, 1 = SyncStep2, 2 = Update
        const isDocumentUpdate = syncMessageType === 1 || syncMessageType === 2;

        if (isDocumentUpdate && !ws.permissions.canEdit) {
          console.warn(
            `[WS] User ${ws.userId} attempted to edit document ${docName} without permission`,
          );

          // Send error message back to client
          const errorMsg = JSON.stringify({
            type: "error",
            error: "Forbidden - You have read-only access to this document",
            permissions: ws.permissions,
          });

          try {
            ws.send(errorMsg);
          } catch (sendErr) {
            console.error("[WS] Failed to send error message:", sendErr);
          }

          // Drop the update - do not process or broadcast
          return;
        }

        // Sync protocol message - handle it and get response
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        const syncReply = syncProtocol.readSyncMessage(
          decoder,
          encoder,
          doc,
          ws,
        );

        // Send reply back to sender if there is one
        if (encoding.length(encoder) > 1) {
          safeSend(ws, encoding.toUint8Array(encoder));
        }

        // Broadcast the update to all other clients in the room
        // Forward the original bytes so other clients apply the same update
        const otherClients = Array.from(wss.clients).filter(
          (client) =>
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            client.room === docName,
        );

        if (otherClients.length > 0) {
          // forward original bytes
          otherClients.forEach((client) => {
            safeSend(client, uint8Array);
          });
        }
      } else if (messageType === messageAwareness) {
        // Awareness protocol message - allowed for all users (view presence)
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
    console.log(
      `[WS] WebSocket closed for document: ${docName}, user: ${ws.userId}`,
    );

    // Remove awareness state for this client
    try {
      const clientID = ws.clientID;
      if (typeof clientID !== "undefined") {
        awarenessProtocol.removeAwarenessStates(
          awareness,
          [clientID],
          "disconnect",
        );
      }
    } catch (e) {
      // best-effort
    }

    // Clean up doc if no more connections
    setTimeout(() => {
      const hasConnections = Array.from(wss.clients).some(
        (client) =>
          client.room === docName && client.readyState === WebSocket.OPEN,
      );

      if (!hasConnections) {
        docs.delete(docName);
        awarenessInstances.delete(docName);
        console.log(`Cleaned up room: ${docName}`);
      }
    }, 5000);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for document ${docName}:`, err);
    try {
      ws.terminate();
    } catch (e) {}
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Send initial sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  safeSend(ws, encoding.toUint8Array(encoder));

  // Send awareness states (if any)
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(awarenessStates.keys()),
      ),
    );
    safeSend(ws, encoding.toUint8Array(awarenessEncoder));
  }

  console.log(`✅ WebSocket connection established for document: ${docName}`);
  console.log(
    `📊 Active connections: ${wss.clients.size}, Rooms: ${docs.size}`,
  );
});

// Ping clients periodically to keep connections alive
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      // ignore
    }
  });
}, 30000);

wss.on("close", () => {
  clearInterval(pingInterval);
});

wss.on("error", (err) => {
  console.error("WebSocket Server error:", err);
});

// Log active connections periodically
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

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down gracefully...");

  clearInterval(pingInterval);

  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });

  docs.clear();
  awarenessInstances.clear();

  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown");
    process.exit(1);
  }, 5000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
