const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const EXT_PATH = require.resolve('../src/extension');

// Loads src/extension.js with `vscode` and `./patcher` replaced by stubs, so the
// startup-notification decision logic can be exercised without a real VS Code
// host or touching real installed extensions. The reloadPromptShownThisSession
// guard is module-scoped, so each loadExtension() call gets a fresh session.
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

function makeVscode(config, infoChoice) {
  const calls = { info: [], warn: [], error: [], reload: 0, executed: [], statusVisible: false };
  const vscode = {
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    workspace: {
      getConfiguration: () => ({ get: (key, def) => (key in config ? config[key] : def) }),
    },
    window: {
      createOutputChannel: () => ({
        lines: [],
        clear() {},
        appendLine(line) { this.lines.push(line); },
        show() {},
        dispose() {},
      }),
      createStatusBarItem: () => ({
        show() { calls.statusVisible = true; },
        hide() { calls.statusVisible = false; },
        dispose() {},
      }),
      showInformationMessage: (msg) => { calls.info.push(msg); return Promise.resolve(infoChoice); },
      showWarningMessage: (msg) => { calls.warn.push(msg); return Promise.resolve(undefined); },
      showErrorMessage: (msg) => { calls.error.push(msg); return Promise.resolve(undefined); },
    },
    commands: {
      registerCommand: () => ({ dispose() {} }),
      executeCommand: (cmd) => {
        calls.executed.push(cmd);
        if (cmd === 'workbench.action.reloadWindow') calls.reload++;
        return Promise.resolve();
      },
    },
  };
  return { vscode, calls };
}

function makePatcher(patchResult, planResult = { changed: false, actionableCount: 0, incompatibleCount: 0, targets: [], messages: [] }) {
  return {
    patchAll: () => patchResult,
    planAll: () => planResult,
    status: () => ({ version: '0', bundledRuntimeFp: '00000000', workbench: { found: false }, claude: [], codex: [] }),
    restoreAll: () => ({ changed: false, messages: [] }),
    cleanLegacy: () => ({ changed: false, messages: [] }),
  };
}

const fakeContext = (store = new Map()) => ({
  extensionMode: 2 /* Development */,
  extensionPath: '/fake/ext',
  extension: { packageJSON: { version: '0.3.9' } },
  globalState: {
    get: (key) => store.get(key),
    update: (key, value) => { store.set(key, value); return Promise.resolve(); },
  },
  subscriptions: [],
});

// Activates the extension, capturing the startup setTimeout callback so the test
// can run it deterministically (and more than once for the once-per-session check).
async function activateCapturingStartup(ext, context) {
  const originalSetTimeout = global.setTimeout;
  let startup = null;
  global.setTimeout = (fn) => { startup = fn; return 0; };
  try {
    await ext.activate(context);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  return startup;
}

test('patchOnStartup: nothing changed -> no reload prompt, no reload', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: true });
  const patcher = makePatcher({ changed: false, contentChanged: false, messages: [] });
  const ext = loadExtension(vscode, patcher);

  const startup = await activateCapturingStartup(ext, fakeContext());
  assert.ok(typeof startup === 'function', 'startup callback must be scheduled when patchOnStartup is on');
  await startup();

  assert.equal(calls.info.length, 0, 'no notification when nothing changed');
  assert.equal(calls.reload, 0);
});

test('patchOnStartup: content changed -> reload prompt shown exactly once', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: true });
  const patcher = makePatcher({ changed: true, contentChanged: true, messages: ['x: CSS patched.'] });
  const ext = loadExtension(vscode, patcher);

  const startup = await activateCapturingStartup(ext, fakeContext());
  await startup();

  const reloadPrompts = calls.info.filter((m) => /Reload the window/i.test(m));
  assert.equal(reloadPrompts.length, 1, 'one reload prompt on content change');
});

test('patchOnStartup: content change re-detected in the same session prompts only once', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: true });
  // Even if patchAll keeps reporting a content change, the session guard prevents
  // a second prompt within the same extension-host lifetime.
  const patcher = makePatcher({ changed: true, contentChanged: true, messages: ['x: CSS patched.'] });
  const ext = loadExtension(vscode, patcher);

  const startup = await activateCapturingStartup(ext, fakeContext());
  await startup();
  await startup();

  const reloadPrompts = calls.info.filter((m) => /Reload the window/i.test(m));
  assert.equal(reloadPrompts.length, 1, 'prompt must not repeat within one session');
});

test('patchOnStartup: asset-only refresh (changed but not contentChanged) does not prompt for reload', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: true });
  const patcher = makePatcher({ changed: true, contentChanged: false, messages: ['x: assets refreshed.'] });
  const ext = loadExtension(vscode, patcher);

  const startup = await activateCapturingStartup(ext, fakeContext());
  await startup();

  const reloadPrompts = calls.info.filter((m) => /Reload the window/i.test(m));
  assert.equal(reloadPrompts.length, 0, 'an asset-only refresh must not prompt for reload');
});

test('patchOnStartup disabled: setup action is offered without writing', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: false }, 'Apply RTL Patches');
  const patcher = makePatcher(
    { changed: true, contentChanged: true, messages: ['must not run'] },
    { changed: true, actionableCount: 1, incompatibleCount: 0, targets: [{}], messages: ['Codex needs a patch'] },
  );
  const ext = loadExtension(vscode, patcher);

  const startup = await activateCapturingStartup(ext, fakeContext());
  assert.ok(typeof startup === 'function', 'the delayed read-only setup check must be scheduled');
  await startup();

  assert.equal(calls.statusVisible, true, 'missing patches expose the status-bar action');
  assert.equal(calls.info.some((message) => /needs RTL setup/.test(message)), true);
  assert.equal(calls.executed.includes('persianRtlClean.reapply'), true, 'notification action dispatches the existing command');
  assert.equal(calls.executed.includes('workbench.action.reloadWindow'), false, 'the setup offer itself does not reload or patch');
});

test('initial setup notification is shown once per installation after explicit dismissal', async () => {
  const store = new Map();
  const plan = { changed: true, actionableCount: 1, incompatibleCount: 0, targets: [{}], messages: ['Codex needs a patch'] };
  const first = makeVscode({ patchOnStartup: false }, 'Not Now');
  const firstExt = loadExtension(first.vscode, makePatcher({ changed: false, messages: [] }, plan));
  const firstStartup = await activateCapturingStartup(firstExt, fakeContext(store));
  await firstStartup();

  const second = makeVscode({ patchOnStartup: false });
  const secondExt = loadExtension(second.vscode, makePatcher({ changed: false, messages: [] }, plan));
  const secondStartup = await activateCapturingStartup(secondExt, fakeContext(store));
  await secondStartup();

  assert.equal(first.calls.info.some((message) => /needs RTL setup/.test(message)), true);
  assert.equal(second.calls.info.some((message) => /needs RTL setup/.test(message)), false, 'dismissed setup prompt must not repeat every reload');
  assert.equal(second.calls.statusVisible, true, 'the persistent status action remains available after dismissal');
});

test('installation onboarding still appears when an older build left patches current', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: false }, 'Apply RTL Patches');
  const currentPlan = {
    changed: false,
    actionableCount: 0,
    incompatibleCount: 0,
    targets: [{ current: true }],
    messages: ['Codex is already current'],
  };
  const ext = loadExtension(vscode, makePatcher({ changed: false, messages: [] }, currentPlan));

  const startup = await activateCapturingStartup(ext, fakeContext());
  await startup();

  assert.equal(calls.info.some((message) => /patches appear current/.test(message)), true);
  assert.equal(calls.executed.includes('persianRtlClean.reapply'), true, 'current patches can still be verified from onboarding');
  assert.equal(calls.statusVisible, false, 'current patches do not leave a warning action in the status bar');
});

test('installation onboarding appears even before an agent extension is installed', async () => {
  const { vscode, calls } = makeVscode({ patchOnStartup: false }, 'Not Now');
  const ext = loadExtension(vscode, makePatcher({ changed: false, messages: [] }));

  const startup = await activateCapturingStartup(ext, fakeContext());
  await startup();

  assert.equal(calls.info.some((message) => /is installed\. Apply or verify RTL patches/.test(message)), true);
  assert.equal(calls.statusVisible, false);
});

test('suppressed or closed onboarding notification retries next startup', async () => {
  const store = new Map();
  const plan = { changed: true, actionableCount: 1, incompatibleCount: 0, targets: [{}], messages: ['Codex needs a patch'] };
  const first = makeVscode({ patchOnStartup: false });
  const firstExt = loadExtension(first.vscode, makePatcher({ changed: false, messages: [] }, plan));
  const firstStartup = await activateCapturingStartup(firstExt, fakeContext(store));
  await firstStartup();

  const second = makeVscode({ patchOnStartup: false });
  const secondExt = loadExtension(second.vscode, makePatcher({ changed: false, messages: [] }, plan));
  const secondStartup = await activateCapturingStartup(secondExt, fakeContext(store));
  await secondStartup();

  assert.equal(first.calls.info.some((message) => /needs RTL setup/.test(message)), true);
  assert.equal(second.calls.info.some((message) => /needs RTL setup/.test(message)), true, 'closing the toast without a choice must not permanently suppress setup');
});
