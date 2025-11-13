// apps/ws-server/src/ws/doc-manager.ts
import * as Y from 'yjs';
import zlib from 'zlib';
import { getLatestSnapshot, saveSnapshotForDoc, cleanupOldSnapshots } from './persistence';

/**
 * Manages Y.Doc instances with persistence
 */
export class DocManager {
  private docs = new Map<string, Y.Doc>();
  private persistTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Get or create a Y.Doc for the given document name
   * Loads from database if not in memory
   */
  async getDoc(docName: string): Promise<Y.Doc> {
    // Return existing doc if already loaded
    if (this.docs.has(docName)) {
      return this.docs.get(docName)!;
    }

    // Create new doc
    const ydoc = new Y.Doc();

    // Try to load snapshot from database
    const parts = docName.split(':');
    const documentId = parts[parts.length - 1];
    
    try {
      const snapshot = await getLatestSnapshot(documentId);
      if (snapshot) {
        // Decompress and apply
        const decompressed = zlib.gunzipSync(snapshot);
        Y.applyUpdate(ydoc, decompressed);
        console.log(`Loaded snapshot for doc ${docName} (${decompressed.length} bytes)`);
      }
    } catch (err) {
      console.error(`Failed to load snapshot for ${docName}:`, err);
    }

    // Store in memory
    this.docs.set(docName, ydoc);

    // Set up update listener for persistence
    this.setupPersistence(docName, ydoc);

    return ydoc;
  }

  /**
   * Set up automatic persistence for a document
   */
  private setupPersistence(docName: string, ydoc: Y.Doc) {
    // Debounced save on updates
    let saveTimer: NodeJS.Timeout | null = null;

    const onUpdate = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await this.persistDoc(docName, ydoc);
      }, 5000); // Save 5 seconds after last update
    };

    ydoc.on('update', onUpdate);

    // Also set up periodic save
    const periodicTimer = setInterval(async () => {
      await this.persistDoc(docName, ydoc);
    }, 60000); // Every minute

    this.persistTimers.set(docName, periodicTimer);
  }

  /**
   * Persist a document to the database
   */
  async persistDoc(docName: string, ydoc: Y.Doc) {
    try {
      const update = Y.encodeStateAsUpdate(ydoc);
      const compressed = zlib.gzipSync(Buffer.from(update));
      await saveSnapshotForDoc(docName, compressed);
      
      // Clean up old snapshots periodically
      const parts = docName.split(':');
      const documentId = parts[parts.length - 1];
      await cleanupOldSnapshots(documentId, 10);
      
      console.log(`Persisted doc ${docName} (${compressed.length} bytes compressed)`);
    } catch (err) {
      console.error(`Failed to persist doc ${docName}:`, err);
    }
  }

  /**
   * Clean up a document from memory
   */
  cleanup(docName: string) {
    const timer = this.persistTimers.get(docName);
    if (timer) {
      clearInterval(timer);
      this.persistTimers.delete(docName);
    }

    const doc = this.docs.get(docName);
    if (doc) {
      doc.destroy();
      this.docs.delete(docName);
    }
  }

  /**
   * Persist all documents and clean up
   */
  async shutdown() {
    console.log('Shutting down DocManager, persisting all documents...');
    
    for (const [docName, ydoc] of this.docs.entries()) {
      await this.persistDoc(docName, ydoc);
      this.cleanup(docName);
    }
    
    console.log('DocManager shutdown complete');
  }
}

// Singleton instance
export const docManager = new DocManager();
