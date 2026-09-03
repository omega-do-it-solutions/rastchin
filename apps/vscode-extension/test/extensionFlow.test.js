const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const EXT_PATH = require.resolve('../src/extension');

function loadExtension(vscodeStub, patcherStub) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeStub;
    if (request === './patcher' && parent && parent.filename === EXT_PATH) return patcherStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[EXT_PATH];
    return require('../src/extension');
  } finally {
    Module._load = originalLoad;
  }
}

function harness({ approval = 'Apply Patches', planChanged = true } = {}) {
  const handlers = new Map();
  const calls = { patch: 0, plan: 0, warnings: [], info: [], statusVisible: false };
  const config = { patchOnStartup: false, confirmBeforePatching: true };
  const vscode = {
    ExtensionMode: { Production: 1, Development: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => (key in config ? config[key] : fallback) }),
    },
    window: {
      createOutputChannel: () => ({ clear() {}, appendLine() {}, show() {}, dispose() {} }),
      createStatusBarItem: () => ({
        show() { calls.statusVisible = true; },
        hide() { calls.statusVisible = false; },
        dispose() {},
      }),
      showWarningMessage: (message) => {
        calls.warnings.push(message);
        return Promise.resolve(approval);
      },
      showInformationMessage: (message) => {
        calls.info.push(message);
        return Promise.resolve(undefined);
      },
      showErrorMessage: () => Promise.resolve(undefined),
    },
    commands: {
      registerCommand: (id, handler) => {
        handlers.set(id, handler);
        return { dispose() {} };
      },
      executeCommand: () => Promise.resolve(),
    },
  };
  const patcher = {
    planAll: () => {
      calls.plan++;
      const needsPatch = planChanged && calls.patch === 0;
      return {
        changed: needsPatch,
        actionableCount: needsPatch ? 1 : 0,
        incompatibleCount: 0,
        targets: [{
          key: 'claude',
          label: 'Claude Code',
          version: '2',
          adapter: 'claude-webview-v1',
          compatible: true,
          current: !needsPatch,
          actions: needsPatch ? ['update chat runtime'] : [],
          issues: [],
        }],
        messages: [needsPatch ? 'Claude Code v2: update chat runtime.' : 'Claude Code v2: already current.'],
      };
    },
    patchAll: () => {
      calls.patch++;
      return { changed: true, contentChanged: true, messages: ['patched'] };
    },
    restoreAll: () => ({ changed: false, messages: [] }),
    cleanLegacy: () => ({ changed: false, messages: [] }),
    status: () => ({
      version: '0.3.0',
      bundledRuntimeFp: '00000000',
      workbench: { found: false },
      claude: [],
      codex: [],
    }),
  };
  const context = {
    extensionMode: 2,
    extensionPath: '/fake/rastchin',
    extension: { packageJSON: { version: '0.3.9' } },
    globalState: { get: () => undefined, update: () => Promise.resolve() },
    subscriptions: [],
  };
  return { calls, context, handlers, vscode, patcher };
}

async function activateWithoutStartupTimer(extension, context) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    await extension.activate(context);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

test('manual re-apply reviews the plan, asks for consent, then patches', async () => {
  const h = harness();
  const extension = loadExtension(h.vscode, h.patcher);
  await activateWithoutStartupTimer(extension, h.context);
  await h.handlers.get('persianRtlClean.reapply')();

  assert.equal(h.calls.plan, 2, 'the post-write plan verifies that the repair is now current');
  assert.equal(h.calls.patch, 1);
  assert.equal(h.calls.warnings.some((message) => /will modify 1 installed agent extension/.test(message)), true);
  assert.equal(h.calls.statusVisible, false, 'successful patch hides the status-bar action');
});

test('manual re-apply cancellation performs no writes', async () => {
  const h = harness({ approval: null });
  const extension = loadExtension(h.vscode, h.patcher);
  await activateWithoutStartupTimer(extension, h.context);
  await h.handlers.get('persianRtlClean.reapply')();

  assert.equal(h.calls.plan, 1);
  assert.equal(h.calls.patch, 0);
  assert.equal(h.calls.statusVisible, true, 'cancelled patch remains available from the status bar');
});

test('manual re-apply skips confirmation and writes when the patch is current', async () => {
  const h = harness({ planChanged: false });
  const extension = loadExtension(h.vscode, h.patcher);
  await activateWithoutStartupTimer(extension, h.context);
  await h.handlers.get('persianRtlClean.reapply')();

  assert.equal(h.calls.plan, 1);
  assert.equal(h.calls.patch, 0);
  assert.equal(h.calls.warnings.length, 0);
  assert.equal(h.calls.info.some((message) => /already current/.test(message)), true);
  assert.equal(h.calls.statusVisible, false);
});

test('manifest keeps Command Palette commands and adds the RastChin Extensions context action', () => {
  const manifest = require('../package.json');
  const commands = manifest.contributes.commands.map((item) => item.command);
  const extensionMenu = manifest.contributes.menus['extension/context'];
  const marketplaceExtensionId = 'omegadoitsolutions.rastchin-vscode';

  assert.equal(commands.includes('persianRtlClean.reapply'), true, 're-apply remains a contributed Command Palette command');
  assert.equal(
    `${manifest.publisher}.${manifest.name}`.toLowerCase(),
    marketplaceExtensionId,
    'the menu condition tracks VS Code\'s normalized installed extension ID',
  );
  assert.equal(
    extensionMenu.some((item) => (
      item.command === 'persianRtlClean.reapply'
      && item.when === `extension == ${marketplaceExtensionId} && extensionStatus == installed`
    )),
    true,
    'right-clicking RastChin in Extensions exposes the same safe re-apply command',
  );
});

test('manifest presents RastChin as Persian-only', () => {
  const manifest = require('../package.json');

  assert.match(manifest.description, /\bPersian\b/i);
  assert.doesNotMatch(manifest.description, /\bArabic\b/i);
  assert.equal(manifest.keywords.includes('arabic'), false);
});
