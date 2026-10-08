'use strict';
// Loopback-only regression page, with real ProseMirror and allowlisted sources.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const app = path.resolve(__dirname, '../..');
const appRequire = createRequire(path.join(app, 'package.json'));
const modules = new Map();
function register(name, resolveFrom = appRequire) {
    if (modules.has(name)) return;
    const entry = resolveFrom.resolve(name);
    const esm = path.join(path.dirname(entry), 'index.js');
    modules.set(name, esm);
    for (const match of fs.readFileSync(esm, 'utf8').matchAll(/from ['"]([^.'"][^'"]*)['"]/g)) register(match[1], createRequire(entry));
}
['prosemirror-model', 'prosemirror-state', 'prosemirror-view'].forEach(name => register(name));
const imports = Object.fromEntries([...modules.keys()].map(name => [name, `/modules/${name}`]));
const sources = new Set(['core/rtl-engine.js', 'core/bidi-isolate.js', 'core/recipe-runner.js', 'core/font-inject.js', 'core/auto-direction.js', 'platforms/chatgpt-rtl.js']);
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let file;
    let type = 'text/javascript';
    let source = null;
    if (url.pathname === '/') {
        type = 'text/html';
        source = fs.readFileSync(path.join(__dirname, 'chatgpt-performance.html'), 'utf8').replace('IMPORT_MAP', JSON.stringify({ imports }));
    } else if (url.pathname === '/test.js') file = path.join(__dirname, 'chatgpt-performance.js');
    else if (url.pathname === '/font.ttf') { file = path.join(app, 'src/assets/fonts/Vazirmatn[wght].ttf'); type = 'font/ttf'; }
    else if (url.pathname.startsWith('/modules/')) file = modules.get(url.pathname.slice('/modules/'.length));
    else {
        const baseline = url.pathname.startsWith('/baseline/');
        const name = url.pathname.slice(baseline ? '/baseline/'.length : 1);
        if (sources.has(name)) {
            const root = baseline && process.argv[2] ? path.resolve(process.argv[2]) : path.join(app, 'src');
            file = path.join(root, name);
            // Exercise hostname policies locally, without accounts or network.
            if (name === 'core/font-inject.js' || name === 'core/auto-direction.js') source = fs.readFileSync(file, 'utf8').replaceAll('chatgpt.com', '127.0.0.1');
        }
    }
    if (source === null && (!file || !fs.existsSync(file))) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(source === null ? fs.readFileSync(file) : source);
});
server.listen(0, '127.0.0.1', () => console.log(`ChatGPT performance regression: http://127.0.0.1:${server.address().port}`));
