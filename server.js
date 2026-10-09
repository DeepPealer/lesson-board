'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const MAX_PAYLOAD = 8 * 1024 * 1024;
const roomStates = new Map();
const peerStates = new Map();
const connections = new Map();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function safeId(raw, fallback = 'default') {
  return String(raw || fallback).slice(0, 100).replace(/[^a-zA-Z0-9_-]/g, '') || fallback;
}

function send(socket, packet) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet));
}

function broadcast(room, packet, sender = null) {
  for (const socket of wss.clients) {
    if (socket !== sender && socket.room === room) send(socket, packet);
  }
}

function patchRoomState(room, packet) {
  const state = roomStates.get(room) || {};
  if (packet.type === 'pages_sync' && Array.isArray(packet.pages)) {
    state.pages = packet.pages;
  } else if (packet.type === 'db_sync' && packet.tables && typeof packet.tables === 'object') {
    state.tables = packet.tables;
    state.tableSchemas = packet.tableSchemas || {};
  } else if (Array.isArray(state.pages)) {
    const page = state.pages.find(p => p.id === packet.pageId);
    if (page) {
      if (!Array.isArray(page.items)) page.items = [];
      const index = page.items.findIndex(i => i.id === packet.id);
      const item = index >= 0 ? page.items[index] : null;
      switch (packet.type) {
        case 'item_create':
          if (packet.item && packet.item.id && !page.items.some(i => i.id === packet.item.id)) {
            page.items.push(packet.item);
          }
          break;
        case 'item_text':
          if (item && typeof packet.field === 'string') item[packet.field] = packet.value;
          break;
        case 'item_move':
          if (item) {
            for (const field of ['x', 'y', 'width', 'height']) {
              if (Number.isFinite(packet[field])) item[field] = packet[field];
            }
          }
          break;
        case 'item_lock':
          if (item) item.isLocked = !!packet.isLocked;
          break;
        case 'item_update':
          if (item && packet.data && typeof packet.data === 'object') Object.assign(item, packet.data);
          break;
        case 'item_delete':
          if (index !== -1) page.items.splice(index, 1);
          break;
        case 'stroke_add':
          if (packet.stroke && packet.stroke.id) {
            if (!Array.isArray(page.strokes)) page.strokes = [];
            if (!page.strokes.some(s => s.id === packet.stroke.id)) page.strokes.push(packet.stroke);
          }
          break;
        default:
          break;
      }
    }
  }
  roomStates.set(room, state);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const filePath = path.resolve(ROOT_DIR, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filePath.startsWith(ROOT_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filePath).pipe(res);
  });
});

server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/collab/ws') throw new Error('Unknown WebSocket endpoint');
    // Block cross-origin browser requests; Cloudflare forwards the public Host header.
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      throw new Error('Cross-origin WebSocket request');
    }
  } catch {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const room = safeId(url.searchParams.get('room'));
  const clientId = safeId(url.searchParams.get('id'), crypto.randomUUID());
  wss.handleUpgrade(req, socket, head, ws => {
    ws.room = room;
    ws.clientId = clientId;
    wss.emit('connection', ws);
  });
});

wss.on('connection', socket => {
  const room = socket.room;
  const clientId = socket.clientId;
  const previous = connections.get(clientId);
  if (previous) previous.close(1000, 'Reconnected');
  connections.set(clientId, socket);

  const peers = [...peerStates.values()].filter(peer => peer.room === room && peer.id !== clientId);
  send(socket, { type: 'peers_snapshot', room, peers });
  const state = roomStates.get(room) || {};
  send(socket, {
    type: 'room_snapshot', room,
    pages: state.pages || null,
    tables: state.tables || null,
    tableSchemas: state.tableSchemas || null
  });

  socket.on('message', raw => {
    let packet;
    try {
      packet = JSON.parse(raw.toString());
      if (!packet || typeof packet.type !== 'string') return;
    } catch {
      return;
    }

    packet._senderId = clientId;
    packet.room = room;

    if (packet.type === 'cursor') {
      peerStates.set(clientId, {
        id: clientId, room, name: packet.name, color: packet.color,
        role: packet.role, wx: packet.wx, wy: packet.wy,
        spotlight: !!packet.spotlight, ts: Date.now()
      });
    } else if (packet.type === 'leave') {
      peerStates.delete(clientId);
    } else {
      patchRoomState(room, packet);
    }

    broadcast(room, packet, socket);
  });

  socket.on('close', () => {
    if (connections.get(clientId) !== socket) return;
    connections.delete(clientId);
    peerStates.delete(clientId);
    broadcast(room, { type: 'leave', room, senderId: clientId }, socket);
  });
});

const keepAlive = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.ping();
  }
  const expiry = Date.now() - 15000;
  for (const [id, peer] of peerStates) {
    if (peer.ts < expiry) {
      peerStates.delete(id);
      broadcast(peer.room, { type: 'leave', room: peer.room, senderId: id });
    }
  }
}, 5000);
keepAlive.unref();

server.listen(PORT, () => {
  console.log('[MiroSQL] http://localhost:' + server.address().port);
});

module.exports = server;
