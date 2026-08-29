const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { BACKUP_SUFFIX, INJECT_DIR, LEGACY_MARKERS, MARKERS, META_SUFFIX } = require('../src/constants');
const patcher = require('../src/patcher');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function count(content, needle) {
  return content.split(needle).length - 1;
}

function makeFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persian-rtl-clean-'));
  const root = path.join(tmp, 'extensions');
  const claude = path.join(root, 'anthropic.claude-code-2.1.170-darwin-arm64');
  const codex = path.join(root, 'openai.chatgpt-26.602.71036-darwin-arm64');

  write(path.join(claude, 'webview', 'index.css'), 'body { color: var(--vscode-foreground); }\n');
  write(path.join(claude, 'webview', 'index.js'), 'console.log("claude webview");\n');
  write(path.join(claude, 'extension.js'), [
    'const html = `',
    '<html>',
    '<head>',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'nonce-{{NONCE}}\'; img-src data:;">',
    '</head>',
    '<body>',
    '<div id="content"></div>',
    '<script nonce="{{NONCE}}">console.log("host");</script>',
    '</body>',
    '</html>',
    '`;',
    '',
  ].join('\n'));

  write(path.join(codex, 'webview', 'index.html'), [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<title>Codex</title>',
    '</head>',
    '<body><div id="root"></div></body>',
    '</html>',
    '',
  ].join('\n'));

  return { tmp, root, claude, codex };
}

function writeClaudeVersion(root, version) {
  const dir = path.join(root, `anthropic.claude-code-${version}-darwin-arm64`);
  write(path.join(dir, 'webview', 'index.css'), 'body { color: var(--vscode-foreground); }\n');
  write(path.join(dir, 'webview', 'index.js'), 'console.log("claude webview");\n');
  return dir;
}

function writeCodexVersion(root, version) {
  const dir = path.join(root, `openai.chatgpt-${version}-darwin-arm64`);
  write(path.join(dir, 'webview', 'index.html'), '<!doctype html>\n<html><head><title>Codex</title></head><body><div id="root"></div></body></html>\n');
  return dir;
}

test('patches and restores Claude/Codex fixtures idempotently', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };

  const first = patcher.patchAll(options);
  assert.equal(first.changed, true);

  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  const jsPath = path.join(fixture.claude, 'webview', 'index.js');
  const planPath = path.join(fixture.claude, 'extension.js');
  const htmlPath = path.join(fixture.codex, 'webview', 'index.html');
  const codexInjectDir = path.join(fixture.codex, 'webview', INJECT_DIR);
  const codexCssPath = path.join(codexInjectDir, 'persian-rtl-clean.css');

  assert.equal(count(read(cssPath), MARKERS.claudeCssStart), 1);
  assert.equal(count(read(jsPath), MARKERS.claudeJsStart), 1);
  assert.equal(count(read(planPath), MARKERS.claudePlanCssStart), 1);
  assert.equal(count(read(planPath), MARKERS.claudePlanJsStart), 1);
  assert.equal(count(read(htmlPath), MARKERS.codexHtmlStart), 1);
  assert.equal(read(cssPath).includes("@font-face"), true);
  assert.equal(read(cssPath).includes("font-family: 'Vazirmatn'"), true);
  assert.equal(read(planPath).includes("data:font/woff2;base64,"), true);
  assert.equal(read(planPath).includes("font-src data:"), true);
  assert.equal(fs.existsSync(cssPath + BACKUP_SUFFIX), true);
  assert.equal(read(cssPath).includes("./persian-rtl-clean/Vazirmatn-Regular.woff2"), true);
  assert.equal(fs.existsSync(path.join(fixture.claude, 'webview', INJECT_DIR, 'Vazirmatn-Regular.woff2')), true);
  assert.equal(fs.existsSync(path.join(fixture.claude, 'webview', INJECT_DIR, 'Vazirmatn-Bold.woff2')), true);
  assert.equal(fs.existsSync(path.join(fixture.codex, 'webview', INJECT_DIR, 'persian-rtl-clean.js')), true);
  assert.equal(fs.existsSync(path.join(fixture.codex, 'webview', INJECT_DIR, 'Vazirmatn-Regular.woff2')), true);
  assert.equal(fs.existsSync(path.join(fixture.codex, 'webview', INJECT_DIR, 'Vazirmatn-Bold.woff2')), true);
  const codexCss = read(codexCssPath);
  const regularFontUrl = codexCss.match(/src:\s*url\('([^']*Vazirmatn-Regular\.woff2)'\)/);
  const boldFontUrl = codexCss.match(/src:\s*url\('([^']*Vazirmatn-Bold\.woff2)'\)/);
  assert.ok(regularFontUrl, 'Codex CSS must declare the bundled regular font');
  assert.ok(boldFontUrl, 'Codex CSS must declare the bundled bold font');
  assert.equal(fs.existsSync(path.resolve(path.dirname(codexCssPath), regularFontUrl[1])), true);
  assert.equal(fs.existsSync(path.resolve(path.dirname(codexCssPath), boldFontUrl[1])), true);

  const status = patcher.status(options);
  assert.deepEqual(status.claude.map((item) => [item.css, item.js, item.plan]), [[true, true, true]]);
  assert.deepEqual(status.codex.map((item) => item.patched), [true]);

  const restored = patcher.restoreAll(options);
  assert.equal(restored.changed, true);
  assert.equal(read(cssPath), 'body { color: var(--vscode-foreground); }\n');
  assert.equal(read(jsPath), 'console.log("claude webview");\n');
  assert.equal(read(htmlPath).includes(MARKERS.codexHtmlStart), false);
  assert.equal(fs.existsSync(path.join(fixture.claude, 'webview', INJECT_DIR)), false);
  assert.equal(fs.existsSync(path.join(fixture.codex, 'webview', INJECT_DIR)), false);
});

test('adds the minimum self sources needed by Codex injected assets when CSP exists', () => {
  const fixture = makeFixture();
  const htmlPath = path.join(fixture.codex, 'webview', 'index.html');
  write(htmlPath, [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\';">',
    '<title>Codex</title>',
    '</head>',
    '<body><div id="root"></div></body>',
    '</html>',
    '',
  ].join('\n'));

  patcher.patchCodex({ extensionsRoot: fixture.root });
  assert.equal(read(htmlPath).includes("font-src 'self';"), true);
  assert.equal(read(htmlPath).includes("style-src 'self';"), true);
  assert.equal(read(htmlPath).includes("script-src 'self';"), true);
  assert.equal(count(read(htmlPath), MARKERS.codexHtmlStart), 1);
});

test('cleans only legacy Claude/Codex markers from fixtures', () => {
  const fixture = makeFixture();
  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  const jsPath = path.join(fixture.claude, 'webview', 'index.js');
  const planPath = path.join(fixture.claude, 'extension.js');
  const htmlPath = path.join(fixture.codex, 'webview', 'index.html');

  write(cssPath, `base\n${LEGACY_MARKERS.claudeCssStart}\nlegacy css\n${LEGACY_MARKERS.claudeCssEnd}\n`);
  write(jsPath, `base\n${LEGACY_MARKERS.claudeJsStart}\nlegacy js\n${LEGACY_MARKERS.claudeJsEnd}\n`);
  write(planPath, [
    '<html><head>',
    `<style>${LEGACY_MARKERS.claudePlanCssStart}\nlegacy plan css\n${LEGACY_MARKERS.claudePlanCssEnd}</style>`,
    '</head><body>',
    `<script nonce="{{NONCE}}">${LEGACY_MARKERS.claudePlanJsStart}\nlegacy plan js\n${LEGACY_MARKERS.claudePlanJsEnd}</script>`,
    '</body></html>',
  ].join('\n'));
  write(htmlPath, `<html><head>\n${LEGACY_MARKERS.codexHtmlStart}\nlegacy codex\n${LEGACY_MARKERS.codexHtmlEnd}\n</head><body></body></html>\n`);

  const result = patcher.cleanLegacy({ extensionsRoot: fixture.root });
  assert.equal(result.changed, true);
  assert.equal(read(cssPath).includes(LEGACY_MARKERS.claudeCssStart), false);
  assert.equal(read(jsPath).includes(LEGACY_MARKERS.claudeJsStart), false);
  assert.equal(read(planPath).includes(LEGACY_MARKERS.claudePlanCssStart), false);
  assert.equal(read(planPath).includes('<style>'), false);
  assert.equal(read(htmlPath).includes(LEGACY_MARKERS.codexHtmlStart), false);
  assert.equal(read(htmlPath).includes('/Applications/Visual Studio Code.app'), false);
});

test('status() reports versions, clean + legacy markers, backups and inject dirs', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };

  // Seed legacy "Persian RTL Chat" artefacts that must be detected but not touched.
  const claudeCss = path.join(fixture.claude, 'webview', 'index.css');
  write(claudeCss, `base\n${LEGACY_MARKERS.claudeCssStart}\nx\n${LEGACY_MARKERS.claudeCssEnd}\n`);
  const codexHtml = path.join(fixture.codex, 'webview', 'index.html');
  write(codexHtml, `<html><head>\n${LEGACY_MARKERS.codexHtmlStart}\nx\n${LEGACY_MARKERS.codexHtmlEnd}\n</head><body><div id="root"></div></body></html>\n`);
  write(codexHtml + '.persian-rtl-backup', 'legacy original\n');
  fs.mkdirSync(path.join(fixture.codex, 'webview', 'persian-rtl'), { recursive: true });
  const workbench = path.join(fixture.tmp, 'workbench.html');
  write(workbench, 'head <!-- Persian RTL Chat --> tail');

  // Apply our clean patches on top of the legacy ones.
  patcher.patchAll(options);

  const s = patcher.status({ ...options, workbenchCandidates: [workbench] });
  assert.equal(typeof s.version, 'string');
  assert.equal(s.workbench.found, true);
  assert.equal(s.workbench.legacy, true);

  const claude = s.claude[0];
  assert.equal(claude.version, '2.1.170');
  assert.equal(claude.clean.css, true);
  assert.equal(claude.legacy.css, true);
  assert.equal(claude.injectDir, true);
  assert.equal(claude.backups.length >= 1, true);
  assert.equal(claude.meta.length >= 1, true);

  const codex = s.codex[0];
  assert.equal(codex.version, '26.602.71036');
  assert.equal(codex.clean, true);
  assert.equal(codex.legacy, true);
  assert.equal(codex.legacyInjectDir, true);
  assert.equal(codex.legacyBackups.includes('index.html.persian-rtl-backup'), true);
});

test('restoreAll refuses to downgrade a target file changed after patching', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  // Simulate the extension being updated/replaced after we patched it.
  write(cssPath, 'UPDATED_BY_EXTENSION_UPDATE{}\n');

  const result = patcher.restoreAll(options);
  assert.equal(read(cssPath), 'UPDATED_BY_EXTENSION_UPDATE{}\n');
  assert.equal(fs.existsSync(cssPath + BACKUP_SUFFIX), false);
  assert.equal(result.messages.some((m) => m.includes('skipped-downgrade') || m.toLowerCase().includes('downgrade')), true);
});

test('restore strips clean markers instead of restoring stale backup when patched file changed', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  const changedWithMarkers = read(cssPath).replace(
    'body { color: var(--vscode-foreground); }',
    'body { color: var(--vscode-foreground); }\n.new-upstream-rule { color: red; }',
  );
  write(cssPath, changedWithMarkers);

  const result = patcher.restoreAll(options);
  const restored = read(cssPath);
  assert.equal(restored.includes(MARKERS.claudeCssStart), false);
  assert.equal(restored.includes('.new-upstream-rule { color: red; }'), true);
  assert.equal(restored.includes('body { color: var(--vscode-foreground); }'), true);
  assert.equal(fs.existsSync(cssPath + BACKUP_SUFFIX), false);
  assert.equal(result.messages.some((m) => m.includes('stripped')), true);
});

test('re-apply refreshes an outdated backup before restoring an in-place upstream update', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  const updatedWithOldPatch = read(cssPath).replace(
    'body { color: var(--vscode-foreground); }',
    'body { color: var(--vscode-foreground); }\n.upstream-v2 { color: green; }',
  );
  write(cssPath, updatedWithOldPatch);

  patcher.patchAll(options);
  patcher.restoreAll(options);
  const restored = read(cssPath);
  assert.equal(restored.includes(MARKERS.claudeCssStart), false);
  assert.equal(restored.includes('.upstream-v2 { color: green; }'), true, 'restore must preserve the in-place upstream update');
});

test('restore strips clean markers in place when the backup is missing', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  fs.unlinkSync(cssPath + BACKUP_SUFFIX);
  assert.equal(read(cssPath).includes(MARKERS.claudeCssStart), true);

  patcher.restoreAll(options);
  assert.equal(read(cssPath).includes(MARKERS.claudeCssStart), false);
});

test('restore does not downgrade a meta-less (legacy) backup when target was updated', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  // Simulate a pre-meta (legacy) install: drop the meta sidecar, keep the backup.
  fs.unlinkSync(cssPath + META_SUFFIX);
  // Upstream updated the extension after we patched it (our markers gone).
  write(cssPath, 'UPSTREAM_UPDATE_NO_META{}\n');

  const result = patcher.restoreAll(options);
  assert.equal(read(cssPath), 'UPSTREAM_UPDATE_NO_META{}\n');
  assert.equal(fs.existsSync(cssPath + BACKUP_SUFFIX), false);
  assert.equal(result.messages.some((m) => m.toLowerCase().includes('downgrade')), true);
});

test('restore still restores a meta-less backup when the live file is still ours', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  // Meta-less, but our markers are still present (a normal patched-then-restore).
  fs.unlinkSync(cssPath + META_SUFFIX);

  patcher.restoreAll(options);
  assert.equal(read(cssPath), 'body { color: var(--vscode-foreground); }\n');
  assert.equal(fs.existsSync(cssPath + BACKUP_SUFFIX), false);
});

test('patchAll reports contentChanged on first patch and not on an idempotent re-run', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };

  const first = patcher.patchAll(options);
  assert.equal(first.changed, true);
  assert.equal(first.contentChanged, true, 'first patch writes content -> needs reload');

  const second = patcher.patchAll(options);
  assert.equal(second.changed, false, 'idempotent re-run writes nothing');
  assert.equal(second.contentChanged, false, 'no content change -> startup must stay silent');
});

test('status() reports runtime fingerprint state: current, stale, then unfingerprinted', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  patcher.patchAll(options);

  // Fresh patch: the injected runtime matches the bundled generator.
  let s = patcher.status(options);
  assert.equal(typeof s.bundledRuntimeFp, 'string');
  assert.equal(s.bundledRuntimeFp.length, 8);
  assert.equal(s.codex[0].runtimeState, 'current');
  assert.equal(s.codex[0].runtimeFp, s.bundledRuntimeFp);
  assert.equal(s.claude[0].runtimeState, 'current');
  assert.equal(s.claude[0].runtimeFp, s.bundledRuntimeFp);

  // Simulate a STALE installed Codex runtime: older injected JS, html marker intact.
  const codexJs = path.join(fixture.codex, 'webview', INJECT_DIR, 'persian-rtl-clean.js');
  write(codexJs, '/* RastChin runtime deadbeef v0.0.1 */\n(function(){}());\n');
  s = patcher.status(options);
  assert.equal(s.codex[0].patched, true, 'still patched (html marker present)');
  assert.equal(s.codex[0].runtimeState, 'stale');
  assert.equal(s.codex[0].runtimeFp, 'deadbeef');

  // Simulate a pre-fingerprint patch (no fingerprint comment at all).
  write(codexJs, '(function(){ /* legacy runtime, no fingerprint */ }());\n');
  s = patcher.status(options);
  assert.equal(s.codex[0].runtimeState, 'unfingerprinted');
  assert.equal(s.codex[0].runtimeFp, null);
});

test('workbench status flags legacy app-level corruption (orphan backup + product.json checksum mismatch), read-only', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persian-rtl-clean-app-'));
  const appRoot = path.join(tmp, 'Visual Studio Code.app', 'Contents', 'Resources', 'app');
  const wbDir = path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench');
  const wbPath = path.join(wbDir, 'workbench.html');
  const content = '<html><!-- pristine workbench restored from backup --></html>\n';
  write(wbPath, content);
  // Orphan legacy backup left behind by the old Persian RTL Chat extension.
  write(wbPath + '.persian-rtl-backup', content);
  // product.json carries a checksum that does NOT match the on-disk workbench.html
  // (the legacy extension wrote the patched-workbench checksum, then restored the
  // workbench but never reverted product.json) -> VS Code reports "corrupt".
  write(path.join(appRoot, 'product.json'), JSON.stringify({
    nameShort: 'Code',
    checksums: { 'vs/code/electron-sandbox/workbench/workbench.html': 'definitely-not-the-real-hash' },
  }));

  const s = patcher.status({ extensionsRoot: path.join(tmp, 'no-extensions'), workbenchCandidates: [wbPath] });
  assert.equal(s.workbench.found, true);
  assert.equal(s.workbench.legacyBackup, true, 'orphan legacy backup must be detected');
  assert.equal(s.workbench.checksumMismatch, true, 'integrity mismatch must be detected');
  assert.equal(s.workbench.corruptionLikely, true);
  // STRICTLY read-only: nothing under the fake app may be written/removed.
  assert.equal(fs.readFileSync(wbPath, 'utf8'), content, 'workbench.html must be untouched');
  assert.equal(fs.existsSync(wbPath + '.persian-rtl-backup'), true, 'backup must not be removed');
});

test('workbench status does NOT flag corruption when checksum matches and no legacy backup', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persian-rtl-clean-app2-'));
  const appRoot = path.join(tmp, 'Visual Studio Code.app', 'Contents', 'Resources', 'app');
  const wbDir = path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench');
  const wbPath = path.join(wbDir, 'workbench.html');
  const content = '<html><!-- pristine signed workbench --></html>\n';
  write(wbPath, content);
  const good = crypto.createHash('sha256').update(Buffer.from(content)).digest('base64').replace(/=+$/, '');
  write(path.join(appRoot, 'product.json'), JSON.stringify({
    nameShort: 'Code',
    checksums: { 'vs/code/electron-sandbox/workbench/workbench.html': good },
  }));

  const s = patcher.status({ extensionsRoot: path.join(tmp, 'no-extensions'), workbenchCandidates: [wbPath] });
  assert.equal(s.workbench.found, true);
  assert.equal(s.workbench.legacy, false);
  assert.equal(s.workbench.legacyBackup, false);
  assert.equal(s.workbench.checksumMismatch, false);
  assert.equal(s.workbench.corruptionLikely, false);
});

test('compareVersions orders versions numerically, not lexically', () => {
  assert.equal(patcher.compareVersions('2.1.10', '2.1.9'), 1);
  assert.equal(patcher.compareVersions('2.1.9', '2.1.10'), -1);
  assert.equal(patcher.compareVersions('2.1.185', '2.1.183'), 1);
  assert.equal(patcher.compareVersions('26.616.51431', '26.616.41845'), 1);
  assert.equal(patcher.compareVersions('2.1.185', '2.1.185'), 0);
});

test('status marks the active (highest-semver) version and flags it when only a stale build is patched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persian-rtl-clean-multi-'));
  const stale = path.join(tmp, 'stale');
  const active = path.join(tmp, 'active');
  writeClaudeVersion(stale, '2.1.183');
  writeCodexVersion(stale, '26.616.41845');
  writeClaudeVersion(active, '2.1.185');
  writeCodexVersion(active, '26.616.51431');

  // Patch ONLY the older build — simulates an extension update that left a newer,
  // unpatched ACTIVE version behind.
  patcher.patchAll({ extensionsRoot: stale });

  const s = patcher.status({ extensionsRoots: [stale, active] });

  const claudeActive = s.claude.find((i) => i.active);
  const claudeStale = s.claude.find((i) => !i.active);
  assert.equal(claudeActive.version, '2.1.185', 'highest claude version must be active');
  assert.equal(claudeStale.version, '2.1.183');
  assert.equal(claudeActive.patched, false, 'active claude build is unpatched (must be flagged)');
  assert.equal(claudeStale.patched, true, 'stale claude build is patched');

  const codexActive = s.codex.find((i) => i.active);
  const codexStale = s.codex.find((i) => !i.active);
  assert.equal(codexActive.version, '26.616.51431', 'highest codex version must be active');
  assert.equal(codexActive.patched, false);
  assert.equal(codexStale.patched, true);

  // Exactly one active per surface.
  assert.equal(s.claude.filter((i) => i.active).length, 1);
  assert.equal(s.codex.filter((i) => i.active).length, 1);

  // Re-apply across BOTH roots must patch ALL versions (the active one included);
  // active-version detection must never narrow patch scope.
  patcher.patchAll({ extensionsRoots: [stale, active] });
  const s2 = patcher.status({ extensionsRoots: [stale, active] });
  assert.equal(s2.claude.find((i) => i.active).patched, true, 'active claude build patched after re-apply');
  assert.equal(s2.codex.find((i) => i.active).patched, true, 'active codex build patched after re-apply');
  assert.equal(s2.claude.every((i) => i.patched), true, 'all claude builds patched after re-apply');
  assert.equal(s2.codex.every((i) => i.patched), true, 'all codex builds patched after re-apply');
});

test('a read-only target fails preflight and leaves every Claude surface unchanged', () => {
  const fixture = makeFixture();
  const cssPath = path.join(fixture.root, 'anthropic.claude-code-2.1.170-darwin-arm64', 'webview', 'index.css');
  fs.chmodSync(cssPath, 0o444); // force the CSS write to fail (read-only target)
  try {
    let result;
    assert.doesNotThrow(() => {
      result = patcher.patchClaude({ extensionsRoot: fixture.root });
    }, 'one read-only target must not crash the whole patch run');
    assert.ok(
      result.messages.some((m) => /WARNING — unsupported Claude layout/.test(m)),
      'the failed preflight must surface an honest WARNING',
    );
    assert.equal(
      read(cssPath).includes(MARKERS.claudeCssStart),
      false,
      'a failed CSS write must not leave a partial/patched marker behind',
    );
    const jsPath = path.join(fixture.root, 'anthropic.claude-code-2.1.170-darwin-arm64', 'webview', 'index.js');
    assert.equal(
      read(jsPath).includes(MARKERS.claudeJsStart),
      false,
      'the target transaction is all-or-nothing; JS must not patch when CSS preflight fails',
    );
  } finally {
    fs.chmodSync(cssPath, 0o644);
  }
});

test('planAll is read-only and reports exact actions before and after patching', () => {
  const fixture = makeFixture();
  const options = { extensionsRoot: fixture.root };
  const cssPath = path.join(fixture.claude, 'webview', 'index.css');
  const before = read(cssPath);

  const first = patcher.planAll(options);
  assert.equal(first.changed, true);
  assert.equal(first.actionableCount, 2);
  assert.equal(first.incompatibleCount, 0);
  assert.equal(first.targets.every((target) => target.compatible), true);
  assert.equal(first.targets.every((target) => target.actions.length > 0), true);
  assert.equal(read(cssPath), before, 'planning must not write a target or backup');
  assert.equal(fs.existsSync(cssPath + BACKUP_SUFFIX), false);

  patcher.patchAll(options);
  const current = patcher.planAll(options);
  assert.equal(current.changed, false);
  assert.equal(current.actionableCount, 0);
  assert.equal(current.targets.every((target) => target.current), true);
});

test('exact VS Code target paths patch only the active extension version', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rastchin-exact-target-'));
  const root = path.join(tmp, 'extensions');
  const staleClaude = writeClaudeVersion(root, '2.1.183');
  const activeClaude = writeClaudeVersion(root, '2.1.185');
  const staleCodex = writeCodexVersion(root, '26.616.41845');
  const activeCodex = writeCodexVersion(root, '26.616.51431');

  const result = patcher.patchAll({
    extensionsRoot: root,
    patchClaudePlanPreview: false,
    targets: {
      claude: [{ extensionPath: activeClaude, version: '2.1.185' }],
      codex: [{ extensionPath: activeCodex, version: '26.616.51431' }],
    },
  });
  assert.equal(result.changed, true);
  assert.equal(read(path.join(activeClaude, 'webview', 'index.css')).includes(MARKERS.claudeCssStart), true);
  assert.equal(read(path.join(staleClaude, 'webview', 'index.css')).includes(MARKERS.claudeCssStart), false);
  assert.equal(read(path.join(activeCodex, 'webview', 'index.html')).includes(MARKERS.codexHtmlStart), true);
  assert.equal(read(path.join(staleCodex, 'webview', 'index.html')).includes(MARKERS.codexHtmlStart), false);
});

test('unsupported Codex layout is refused before backups or assets are created', () => {
  const fixture = makeFixture();
  const htmlPath = path.join(fixture.codex, 'webview', 'index.html');
  write(htmlPath, '<html><body><div id="root"></div></body></html>\n');

  const plan = patcher.planAll({ extensionsRoot: fixture.root, includeClaude: false });
  assert.equal(plan.changed, false);
  assert.equal(plan.incompatibleCount, 1);
  assert.match(plan.targets[0].issues.join(' '), /head insertion anchor/i);

  const result = patcher.patchCodex({ extensionsRoot: fixture.root });
  assert.equal(result.changed, false);
  assert.equal(read(htmlPath), '<html><body><div id="root"></div></body></html>\n');
  assert.equal(fs.existsSync(htmlPath + BACKUP_SUFFIX), false);
  assert.equal(fs.existsSync(path.join(fixture.codex, 'webview', INJECT_DIR)), false);
});

test('patch metadata records agent identity, version, adapter and surface', () => {
  const fixture = makeFixture();
  patcher.patchAll({ extensionsRoot: fixture.root });
  const htmlPath = path.join(fixture.codex, 'webview', 'index.html');
  const meta = JSON.parse(read(htmlPath + META_SUFFIX));
  assert.equal(meta.targetExtensionId, 'openai.chatgpt');
  assert.equal(meta.targetExtensionVersion, '26.602.71036');
  assert.equal(meta.adapter, 'codex-webview-v1');
  assert.equal(meta.surface, 'webview-loader');
});
