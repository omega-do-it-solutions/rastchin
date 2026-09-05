'use strict';

// Local browser regression fixture. Only the allowlisted test/source assets are
// served; ProseMirror is a dev dependency and never enters extension packages.
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
    const source = fs.readFileSync(esm, 'utf8');
    for (const match of source.matchAll(/from ['"]([^.'"][^'"]*)['"]/g)) {
        register(match[1], createRequire(entry));
    }
}
['prosemirror-model', 'prosemirror-state', 'prosemirror-view'].forEach(name => register(name));
const imports = Object.fromEntries([...modules.keys()].map(name => [name, `/modules/${name}`]));
const assets = new Map([
    ['/font.ttf', path.join(app, 'src/assets/fonts/Vazirmatn[wght].ttf')],
    ['/test.js', path.join(__dirname, 'linear-editor.js')],
    ['/engine.js', path.join(app, 'src/core/rtl-engine.js')],
    ['/recipe.js', path.join(app, 'src/core/recipe-runner.js')],
    ['/linear.js', process.argv[2] ? path.resolve(process.argv[2]) : path.join(app, 'src/platforms/linear-rtl.js')],
    ...[...modules].map(([name, file]) => [`/modules/${name}`, file])
]);
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/') {
        const html = fs.readFileSync(path.join(__dirname, 'linear-editor.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(html.replace('IMPORT_MAP', JSON.stringify({ imports })));
    } else if (assets.has(url.pathname)) {
        res.writeHead(200, { 'Content-Type': url.pathname === '/font.ttf' ? 'font/ttf' : 'text/javascript', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(assets.get(url.pathname)));
    } else { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => {
    console.log(`Linear editor regression fixture: http://127.0.0.1:${server.address().port}`);
});
