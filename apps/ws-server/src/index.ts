// apps/ws-server/src/index.ts
import http from 'http';
import { startYWebsocketServer } from './ws/server';
import dotenv from 'dotenv';
dotenv.config();

const port = process.env.WS_PORT ? Number(process.env.WS_PORT) : 1234;

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'ws-server',
    }));
    return;
  }

  // Default response
  res.writeHead(200);
  res.end('y-websocket server');
});

startYWebsocketServer(server);

server.listen(port, () => {
  console.log(`ws-server listening on ws://localhost:${port}`);
});
