const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { MARKERS } = require('../src/constants');
const patcher = require('../src/patcher');
const uninstall = require('../scripts/uninstall');

test('uninstall hook restores patched agent files from the extensions root', () => {
  const extensionsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rastchin-uninstall-'));
  const codex = path.join(extensionsRoot, 'openai.chatgpt-26.700.1-linux-x64');
  const htmlPath = path.join(codex, 'webview', 'index.html');
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  const original = '<html><head><title>Codex</title></head><body></body></html>\n';
  fs.writeFileSync(htmlPath, original, 'utf8');

  patcher.patchAll({ extensionsRoot, includeClaude: false });
  assert.equal(fs.readFileSync(htmlPath, 'utf8').includes(MARKERS.codexHtmlStart), true);

  uninstall.main({ extensionsRoot, quiet: true });
  assert.equal(fs.readFileSync(htmlPath, 'utf8'), original);
});
