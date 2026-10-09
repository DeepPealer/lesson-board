const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// Active SSE client connections: clientId -> { res, info }
const sseClients = new Map();
// Active peer states: clientId -> { id, name, role, color, wx, wy, spotlight, ts }
const peerStates = new Map();

// Periodic cleanup of stale peers (no update in 15 seconds)
setInterval(() => {
  const cutoff = Date.now() - 15000;
  for (const [id, state] of peerStates.entries()) {
    if (state.ts < cutoff) {
      peerStates.delete(id);
      broadcast({ type: 'leave', senderId: id });
    }
  }
}, 5000);

function broadcast(packet, exceptClientId = null) {
  const data = `data: ${JSON.stringify(packet)}\n\n`;
  for (const [id, client] of sseClients.entries()) {
    if (id === exceptClientId) continue;
    try {
      client.res.write(data);
    } catch (err) {
      sseClients.delete(id);
    }
  }
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // 1. SSE Stream: GET /api/collab/stream
  if (req.method === 'GET' && pathname === '/api/collab/stream') {
    const clientId = urlObj.searchParams.get('id') || ('client_' + Math.random().toString(36).substring(2, 8));

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');

    sseClients.set(clientId, { res, id: clientId });

    // Send existing peers snapshot to newly connected client
    const existingPeers = Array.from(peerStates.values());
    if (existingPeers.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'peers_snapshot', peers: existingPeers })}\n\n`);
    }

    req.on('close', () => {
      sseClients.delete(clientId);
      peerStates.delete(clientId);
      broadcast({ type: 'leave', senderId: clientId });
    });
    return;
  }

  // 2. Collab Message: POST /api/collab/message
  if (req.method === 'POST' && pathname === '/api/collab/message') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const packet = JSON.parse(body);
        const senderId = packet._senderId || packet.senderId || packet.id;

        // If it's a cursor heartbeat/position update, update in-memory state
        if (packet.type === 'cursor' && senderId) {
          peerStates.set(senderId, {
            id: senderId,
            name: packet.name,
            role: packet.role,
            color: packet.color,
            wx: packet.wx,
            wy: packet.wy,
            spotlight: !!packet.spotlight,
            ts: Date.now()
          });
        }

        if (packet.type === 'leave' && senderId) {
          peerStates.delete(senderId);
        }

        // Broadcast to all other connected tabs / browsers
        broadcast(packet, senderId);

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. Static File Serving with aggressive no-cache headers
  let filePath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for SPA routing if needed
      if (fs.existsSync(path.join(ROOT_DIR, 'index.html'))) {
        filePath = path.join(ROOT_DIR, 'index.html');
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // NEVER cache js/css/html files during live editing/collaboration
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[MiroSQL Server] Running at http://localhost:${PORT}`);
});
