// server/y-websocket-server.js
import http from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const port = process.env.YWS_PORT ? Number(process.env.YWS_PORT) : 1234;
const secret = process.env.NEXTAUTH_SECRET;

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

// Get or create Awareness for a room
function getAwareness(docName) {
  let awareness = awarenessInstances.get(docName);
  if (!awareness) {
    const doc = getYDoc(docName);
    awareness = new awarenessProtocol.Awareness(doc);
    awarenessInstances.set(docName, awareness);

    // Broadcast awareness updates to all clients in the room
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
        if (
          client.readyState === 1 &&
          client.room === docName &&
          client !== awareness
        ) {
          client.send(buff, (err) => {
            if (err) console.error("Error broadcasting awareness:", err);
          });
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
    const adminToken = process.env.YWS_ADMIN_TOKEN;

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
          if (client.room === documentId && client.readyState === 1) {
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
    const adminToken = process.env.YWS_ADMIN_TOKEN;

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
        (client) => client.room === docName && client.readyState === 1,
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

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("y-websocket collaboration server\n");
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

console.log("Starting y-websocket server...");

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const docName = url.pathname.substring(1); // Remove leading '/'

  if (!docName) {
    console.warn("Connection attempt without document ID");
    ws.close(1008, "Document ID required");
    return;
  }

  console.log(`New connection attempt for document: ${docName}`);

  // Token validation (optional in dev)
  if (token) {
    try {
      const decoded = jwt.verify(token, secret);
      console.log(
        `Token verified for user: ${decoded.userId || decoded.email}`,
      );

      if (decoded.docId !== docName) {
        console.warn(`Token docId mismatch: ${decoded.docId} !== ${docName}`);
      }
    } catch (err) {
      console.error("Token verification failed:", err.message);
      console.warn("Allowing connection without valid token (dev mode)");
    }
  } else {
    console.warn("No token provided, allowing connection (dev mode)");
  }

  // Get or create doc and awareness for this room
  const doc = getYDoc(docName);
  const awareness = getAwareness(docName);

  // Store room info on the WebSocket
  ws.room = docName;
  ws.isAlive = true;

  // Handle incoming messages
  ws.on("message", (message) => {
    try {
      const uint8Array = new Uint8Array(message);
      const decoder = decoding.createDecoder(uint8Array);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === messageSync) {
        // Sync protocol message
        encoding.writeVarUint(encoding.createEncoder(), messageSync);
        syncProtocol.readSyncMessage(
          decoder,
          encoding.createEncoder(),
          doc,
          ws,
        );

        // Send sync step 2 if needed
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeSyncStep2(encoder, doc);
        const syncMessage = encoding.toUint8Array(encoder);

        // Broadcast to all other clients in the room
        wss.clients.forEach((client) => {
          if (
            client !== ws &&
            client.readyState === 1 &&
            client.room === docName
          ) {
            client.send(syncMessage, (err) => {
              if (err) console.error("Error broadcasting sync:", err);
            });
          }
        });
      } else if (messageType === messageAwareness) {
        // Awareness protocol message
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          ws,
        );
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  });

  ws.on("close", () => {
    console.log(`WebSocket closed for document: ${docName}`);

    // Remove awareness state for this client
    awarenessProtocol.removeAwarenessStates(
      awareness,
      [doc.clientID],
      "disconnect",
    );

    // Clean up doc if no more connections
    setTimeout(() => {
      const hasConnections = Array.from(wss.clients).some(
        (client) => client.room === docName && client.readyState === 1,
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
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Send initial sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder), (err) => {
    if (err) {
      console.error("Error sending initial sync:", err);
    }
  });

  // Send awareness states
  if (awareness.getStates().size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(awareness.getStates().keys()),
      ),
    );
    ws.send(encoding.toUint8Array(awarenessEncoder));
  }

  console.log(`WebSocket connection established for document: ${docName}`);
  console.log(`Active connections: ${wss.clients.size}`);
});

// Ping clients periodically to keep connections alive
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
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
