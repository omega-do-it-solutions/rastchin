const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverTargets, vscodeTargets } = require('../src/targets/registry');

function mkdir(filePath) {
  fs.mkdirSync(filePath, { recursive: true });
}

test('vscodeTargets resolves the active extension paths through the official registry', () => {
  const vscode = {
    extensions: {
      getExtension(id) {
        if (id === 'anthropic.claude-code') {
          return { extensionPath: '/active/claude', packageJSON: { version: '2.2.0' } };
        }
        if (id === 'openai.chatgpt') {
          return { extensionPath: '/active/codex', packageJSON: { version: '27.1.0' } };
        }
        return undefined;
      },
    },
  };
  assert.deepEqual(vscodeTargets(vscode), {
    claude: [{ extensionPath: '/active/claude', version: '2.2.0' }],
    codex: [{ extensionPath: '/active/codex', version: '27.1.0' }],
  });
});

test('explicit targets suppress filesystem fallback and keep only the active path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rastchin-registry-'));
  const stale = path.join(root, 'openai.chatgpt-26.1.0-linux-x64');
  const active = path.join(root, 'openai.chatgpt-26.2.0-linux-x64');
  mkdir(stale);
  mkdir(active);

  const targets = discoverTargets('codex', {
    extensionsRoot: root,
    targets: { codex: [{ extensionPath: active, version: '26.2.0' }] },
  }, root);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].extensionPath, active);
  assert.equal(targets[0].active, true);
});

test('filesystem fallback rejects a mismatched extension package manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rastchin-registry-manifest-'));
  const fake = path.join(root, 'openai.chatgpt-99.0.0-linux-x64');
  mkdir(fake);
  fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({
    publisher: 'someone-else',
    name: 'different-extension',
    version: '99.0.0',
  }));

  assert.deepEqual(discoverTargets('codex', { extensionsRoot: root }, root), []);
});
