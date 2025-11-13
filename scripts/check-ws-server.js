#!/usr/bin/env node

/**
 * WebSocket Server Health Check
 * Validates that the y-websocket server is running and accessible
 * Usage: node scripts/check-ws-server.js
 */

import http from 'http';

const WS_PORT = process.env.YWS_PORT || 1234;
const WS_HOST = process.env.YWS_HOST || 'localhost';
const HEALTH_ENDPOINT = `http://${WS_HOST}:${WS_PORT}/health`;
const TIMEOUT_MS = 5000;

console.log('🔍 Checking WebSocket server health...');
console.log(`   Endpoint: ${HEALTH_ENDPOINT}`);
console.log(`   Timeout: ${TIMEOUT_MS}ms\n`);

const checkHealth = () => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Health check timeout after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const req = http.get(HEALTH_ENDPOINT, (res) => {
      clearTimeout(timeout);

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const health = JSON.parse(data);
            resolve(health);
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    req.end();
  });
};

// Main execution
(async () => {
  try {
    const health = await checkHealth();

    console.log('✅ WebSocket server is healthy!\n');
    console.log('Status:', health.status);
    console.log('Uptime:', Math.floor(health.uptime), 'seconds');
    console.log('Active connections:', health.connections || 0);
    console.log('Active rooms:', health.rooms || 0);
    console.log();

    process.exit(0);
  } catch (err) {
    console.error('❌ WebSocket server health check FAILED!\n');
    console.error('Error:', err.message);
    console.error();
    console.error('💡 Troubleshooting:');
    console.error('   1. Make sure the WebSocket server is running:');
    console.error('      npm run yws');
    console.error();
    console.error('   2. Check if port', WS_PORT, 'is available:');
    console.error('      Windows: netstat -an | findstr', WS_PORT);
    console.error('      Mac/Linux: lsof -i :' + WS_PORT);
    console.error();
    console.error('   3. Verify environment variables:');
    console.error('      YWS_PORT (default: 1234)');
    console.error('      YWS_HOST (default: localhost)');
    console.error();

    process.exit(1);
  }
})();
