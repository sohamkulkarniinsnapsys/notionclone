// apps/ws-server/src/ws/server.ts
import { Server } from 'ws';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { IncomingMessage } from 'http';
import { getLatestSnapshot, saveSnapshotForDoc, cleanupOldSnapshots } from './persistence';
import * as Y from 'yjs';
import zlib from 'zlib';
import jwt from 'jsonwebtoken';

// Track docs and their persistence
const docMap = new Map<string, Y.Doc>();
const persistTimers = new Map<string, NodeJS.Timeout>();
const loadedDocs = new Set<string>();

/**
 * Load snapshot from database for a document
 * This should be called before y-websocket creates the doc
 */
async function loadSnapshotForDoc(docName: string) {
  const parts = docName.split(':');
  const documentId = parts[parts.length - 1];

  try {
    const snapshot = await getLatestSnapshot(documentId);
    if (snapshot) {
      // Note: y-websocket manages docs internally, so we can't directly apply the snapshot here
      // The snapshot will be loaded by clients via the API endpoint
      // This function is here for future enhancement when we fork y-websocket
      console.log(`Snapshot available for ${docName} (${snapshot.length} bytes)`);
    }
  } catch (err) {
    console.error(`Failed to load snapshot for ${docName}:`, err);
  }
}

export function startYWebsocketServer(httpServer: any) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (conn, req: IncomingMessage) => {
    // parse doc name and token from query params
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const docName = url.searchParams.get('doc') || url.pathname.replace('/', '') || 'default';
    const token = url.searchParams.get('token');

    // Verify JWT token if provided
    const secret = process.env.NEXTAUTH_SECRET;
    if (secret && token) {
      try {
        const decoded = jwt.verify(token, secret) as any;
        console.log('WS connection authenticated:', decoded.userId, 'for doc:', docName);
        
        // Optionally verify docId matches
        if (decoded.docId && decoded.docId !== docName) {
          console.warn('Token docId mismatch:', decoded.docId, 'vs', docName);
          conn.close(1008, 'Invalid token for this document');
          return;
        }
      } catch (err) {
        console.error('Token verification failed:', err);
        conn.close(1008, 'Invalid or expired token');
        return;
      }
    } else if (secret) {
      // Token required but not provided
      console.warn('WS connection without token rejected');
      conn.close(1008, 'Authentication required');
      return;
    }
    // If no secret configured, allow unauthenticated (dev mode)

    // Load snapshot from DB if this is the first connection to this doc
    if (!loadedDocs.has(docName)) {
      loadedDocs.add(docName);
      loadSnapshotForDoc(docName).catch((err: Error) => {
        console.error('Failed to load snapshot:', err);
      });
    }

    // call the library helper to handle messages
    // setupWSConnection will create or use a Y.Doc in its internal map.
    // We use it but also track docs by listening to the createdDoc instance inside setupWSConnection
    setupWSConnection(conn, req, { docName });

    // Attempt to get doc reference via y-websocket internal API:
    // The utils.js of y-websocket keeps a docs map on the server side — but it's not exported.
    // So we maintain our own doc reference via the 'sync' messages — simpler approach:
    // schedule a periodic persist for this doc on connection
    schedulePersist(docName);
  });

  // Periodic flush: every minute persist all known docs
  setInterval(() => {
    for (const [docName, ydoc] of docMap.entries()) {
      persistNow(docName, ydoc);
    }
  }, 60_000);

  // expose simple API for other modules to register doc instances
  // NOTE: due to y-websocket's internal management, proper hooking requires
  // forking/modifying y-websocket server to call our hook when docs are created.
  // For now, we'll rely on clients saving snapshots via API endpoint, or
  // later we can fork y-websocket to integrate tightly.
}

function schedulePersist(docName: string) {
  // dummy placeholder
  // If we had a Y.Doc instance in docMap we'd debounce save
  if (persistTimers.has(docName)) return;
  const timer = setInterval(async () => {
    const ydoc = docMap.get(docName);
    if (ydoc) {
      await persistNow(docName, ydoc);
    }
  }, 10_000);
  persistTimers.set(docName, timer);
}

async function persistNow(docName: string, ydoc: Y.Doc) {
  try {
    // encode state as update
    const update = Y.encodeStateAsUpdate(ydoc);
    // compress
    const compressed = zlib.gzipSync(Buffer.from(update));
    await saveSnapshotForDoc(docName, compressed);
    
    // Clean up old snapshots
    const parts = docName.split(':');
    const documentId = parts[parts.length - 1];
    await cleanupOldSnapshots(documentId, 10);
    
    console.log('persisted snapshot for', docName);
  } catch (err) {
    console.error('persist error', err);
  }
}
