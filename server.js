// HEJNO — realtime relay server
// Telefony posílají join/dir/ping/leave -> server je předá projekci.
// Projekce posílá state (souznění, počet hráčů) -> server ho předá telefonům.
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(__dirname + '/public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const TO_PROJ = new Set(['join', 'dir', 'ping', 'leave']);

wss.on('connection', (ws) => {
  ws.role = 'phone';
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'hello') { ws.role = m.role === 'proj' ? 'proj' : 'phone'; return; }
    const str = JSON.stringify(m);
    for (const c of wss.clients) {
      if (c === ws || c.readyState !== 1) continue;
      if (TO_PROJ.has(m.t) && c.role === 'proj') c.send(str);
      else if (m.t === 'state' && c.role === 'phone') c.send(str);
    }
  });
});

// úklid mrtvých spojení
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('HEJNO běží na http://localhost:' + PORT));
