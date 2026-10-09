'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');

const port = 31000 + Math.floor(Math.random() * 10000);
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit']
});

const connections = [];
function connect(id, room) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/api/collab/ws?id=' + id + '&room=' + room);
    connections.push(socket);
    let packets = [];
    socket.on('message', data => {
      const packet = JSON.parse(data.toString());
      packets.push(packet);
      if (packet.type === 'room_snapshot') resolve({ socket, packets });
    });
    socket.on('error', reject);
  });
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async () => {
  await delay(500);
  const a = await connect('alice', 'lesson-a');
  a.socket.send(JSON.stringify({
    type: 'pages_sync', pages: [{ id: 'p1', items: [{ id: 'note1', type: 'sticky', content: 'before', width: 200, height: 150 }] }]
  }));
  await delay(50);
  a.socket.send(JSON.stringify({ type: 'item_text', pageId: 'p1', id: 'note1', field: 'content', value: 'after' }));
  a.socket.send(JSON.stringify({ type: 'item_move', pageId: 'p1', id: 'note1', x: 15, y: 22, width: 450, height: 360 }));
  await delay(100);
  const b = await connect('bob', 'lesson-a');
  const snap = b.packets.find(p => p.type === 'room_snapshot');
  assert.equal(snap.pages[0].items[0].content, 'after');
  assert.equal(snap.pages[0].items[0].width, 450);
  assert.equal(snap.pages[0].items[0].height, 360);
  const isolated = await connect('carol', 'lesson-b');
  const separate = isolated.packets.find(p => p.type === 'room_snapshot');
  assert.equal(separate.pages, null);
  console.log('WebSocket room snapshot, text and resize sync checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  connections.forEach(c => c.close());
  server.kill();
});
