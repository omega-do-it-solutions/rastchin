'use strict';
// Loopback-only, allowlisted assets. No accounts, chat sending or external data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname, '../..');
const assets = new Map([
    ['/', [path.join(__dirname, 'streaming.html'), 'text/html']],
    ['/test.js', [path.join(__dirname, 'streaming.js'), 'text/javascript']],
    ['/font.ttf', [path.join(app, 'src/assets/fonts/Vazirmatn[wght].ttf'), 'font/ttf']],
    ...['core/rtl-engine.js', 'core/recipe-runner.js', 'core/streaming-text.js',
        'platforms/twitch-rtl.js', 'platforms/kick-rtl.js'].map(file => [`/${file}`, [path.join(app, 'src', file), 'text/javascript']])
]);
const server = http.createServer((req, res) => {
    const asset = assets.get(new URL(req.url, 'http://localhost').pathname);
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (!asset) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(asset[0]));
});
server.listen(0, '127.0.0.1', () => console.log(`Streaming RTL regression: http://127.0.0.1:${server.address().port}`));
