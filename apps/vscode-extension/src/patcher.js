const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { atomicWriteFile, runFileTransaction } = require('./fileTransaction');
const { discoverTargets } = require('./targets/registry');

const {
  BACKUP_SUFFIX,
  CLAUDE_PREFIX,
  CODEX_PREFIX,
  FONT_FILES,
  INJECT_DIR,
  LEGACY_BACKUP_SUFFIXES,
  LEGACY_INJECT_DIR,
  LEGACY_MARKERS,
  LEGACY_WORKBENCH_MARKER,
  MARKERS,
  META_SUFFIX,
} = require('./constants');

let EXTENSION_VERSION = '0.0.0';
try {
  EXTENSION_VERSION = require('../package.json').version || EXTENSION_VERSION;
} catch {
  /* package.json is always present in a real install; default keeps tests happy */
}
const {
  buildClaudeCss,
  buildClaudeJs,
  buildClaudePlanCss,
  buildClaudePlanJs,
  buildCodexCss,
  buildCodexJs,
  RUNTIME_FP,
} = require('./injections');

// Matches the fingerprint comment the runtime embeds (see injections.js
// fingerprintComment). Used to read the fingerprint back out of an injected
// webview file so Status can flag a stale patch.
const RUNTIME_FP_RE = /RastChin runtime ([0-9a-f]{8}) v([\d.]+)/;

function defaultExtensionsRoot() {
  return path.join(os.homedir(), '.vscode', 'extensions');
}

function bundledFontsDir() {
  return path.join(__dirname, '..', 'media', 'fonts');
}

function bundledFontPath(fileName) {
  return path.join(bundledFontsDir(), fileName);
}

function copyBundledFonts(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  let changed = false;
  for (const fileName of FONT_FILES) {
    const source = bundledFontPath(fileName);
    const target = path.join(targetDir, fileName);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(source))) continue;
    fs.copyFileSync(source, target);
    changed = true;
  }
  return changed;
}

function removeBundledFonts(targetDir) {
  for (const fileName of FONT_FILES) {
    const target = path.join(targetDir, fileName);
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function fontDataUris() {
  const dataUris = {};
  for (const file of FONT_FILES) {
    dataUris[file] = `data:font/woff2;base64,${fs.readFileSync(bundledFontPath(file)).toString('base64')}`;
  }
  return { dataUris };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureCspSource(cspTag, directive, source) {
  return cspTag.replace(/content\s*=\s*(["'])([\s\S]*?)\1/i, (attribute, quote, policy) => {
    const directiveRe = new RegExp(`(^|;)\\s*${escapeRegExp(directive)}\\s+([^;]*)`, 'i');
    const match = policy.match(directiveRe);
    let nextPolicy;
    if (match) {
      const values = match[2].trim();
      const tokens = values.match(/'[^']*'|"[^"]*"|\S+/g) || [];
      if (tokens.some((token) => token.toLowerCase() === source.toLowerCase())) return attribute;
      const replacement = `${match[1]} ${directive} ${values}${values ? ' ' : ''}${source}`;
      nextPolicy = policy.replace(match[0], replacement);
    } else {
      const separator = policy.trim().endsWith(';') ? ' ' : '; ';
      nextPolicy = `${policy}${separator}${directive} ${source};`;
    }
    return `content=${quote}${nextPolicy}${quote}`;
  });
}

function ensureFontSrcData(cspTag) {
  return ensureCspSource(cspTag, 'font-src', 'data:');
}

function ensureCodexAssetCsp(cspTag) {
  let next = ensureCspSource(cspTag, 'style-src', "'self'");
  next = ensureCspSource(next, 'script-src', "'self'");
  next = ensureCspSource(next, 'font-src', "'self'");
  return next;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  atomicWriteFile(filePath, content, 'utf8');
}

function writeTextIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && readText(filePath) === content) return false;
  writeText(filePath, content);
  return true;
}

function removeBlock(content, startMarker, endMarker) {
  let output = content;
  for (;;) {
    const start = output.indexOf(startMarker);
    if (start === -1) return output;
    const end = output.indexOf(endMarker, start);
    if (end === -1) return output;
    let from = start;
    let to = end + endMarker.length;
    if (from > 0 && output[from - 1] === '\n') from--;
    if (to < output.length && output[to] === '\n') to++;
    output = output.slice(0, from) + output.slice(to);
  }
}

function removeEnclosingTagBlock(content, startMarker, endMarker, tagName) {
  let output = content;
  for (;;) {
    const start = output.indexOf(startMarker);
    if (start === -1) return output;
    const end = output.indexOf(endMarker, start);
    if (end === -1) return output;
    const open = output.lastIndexOf(`<${tagName}`, start);
    const close = output.indexOf(`</${tagName}>`, end);
    if (open !== -1 && close !== -1 && output.indexOf('>', open) < start) {
      let from = open;
      let to = close + tagName.length + 3;
      if (from > 0 && output[from - 1] === '\n') from--;
      if (to < output.length && output[to] === '\n') to++;
      output = output.slice(0, from) + output.slice(to);
    } else {
      output = removeBlock(output, startMarker, endMarker);
    }
  }
}

function removePlanBlocks(content, markerSet = MARKERS) {
  let next = removeEnclosingTagBlock(content, markerSet.claudePlanCssStart, markerSet.claudePlanCssEnd, 'style');
  next = removeEnclosingTagBlock(next, markerSet.claudePlanJsStart, markerSet.claudePlanJsEnd, 'script');
  return next;
}

function hasBlock(content, startMarker) {
  return content.includes(startMarker);
}

function backupPathFor(filePath) {
  return filePath + BACKUP_SUFFIX;
}

function metaPathFor(filePath) {
  return filePath + META_SUFFIX;
}

function readMeta(filePath) {
  try {
    return JSON.parse(readText(metaPathFor(filePath)));
  } catch {
    return null;
  }
}

function writeMeta(filePath, meta) {
  writeText(metaPathFor(filePath), JSON.stringify(meta, null, 2) + '\n');
}

function removeMeta(filePath) {
  try {
    const meta = metaPathFor(filePath);
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
  } catch {
    /* ignore */
  }
}

function ensureBackup(filePath) {
  const backupPath = backupPathFor(filePath);
  if (!fs.existsSync(backupPath)) fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

// Ensures the backup represents the upstream content on which THIS patch is
// based. This matters when an agent updater edits a file in place while leaving
// our marker block present: retaining the older backup would make Disable later
// downgrade the freshly updated agent. The caller's strip function removes only
// RastChin-owned blocks and preserves all new upstream/user content.
function prepareBackup(filePath, current, strip) {
  const backupPath = backupPathFor(filePath);
  const meta = readMeta(filePath);
  const currentSha = sha256(current);
  const currentIsRecordedPatch = meta && meta.patchedSha && meta.patchedSha === currentSha;
  if (currentIsRecordedPatch && fs.existsSync(backupPath)) return backupPath;

  const pristine = strip(current);
  atomicWriteFile(backupPath, pristine, 'utf8');
  return backupPath;
}

// Records version/hash metadata after a successful write so restore can verify
// the live file is still our patched output and refuse to downgrade an updated
// target extension. originalSha is derived from the pristine backup.
function recordPatch(filePath, patchedContent, context = {}) {
  const existing = readMeta(filePath);
  const backupPath = backupPathFor(filePath);
  let originalSha = existing && existing.originalSha;
  if (!originalSha && fs.existsSync(backupPath)) {
    try { originalSha = sha256(readText(backupPath)); } catch { /* ignore */ }
  }
  writeMeta(filePath, {
    tool: 'rastchin-vscode',
    version: EXTENSION_VERSION,
    target: path.basename(filePath),
    targetExtensionId: context.targetExtensionId || null,
    targetExtensionVersion: context.targetExtensionVersion || null,
    adapter: context.adapter || null,
    surface: context.surface || null,
    originalSha: originalSha || null,
    patchedSha: sha256(patchedContent),
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function cleanupSidecars(filePath) {
  const backupPath = backupPathFor(filePath);
  try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch { /* ignore */ }
  removeMeta(filePath);
}

function appendBlock(filePath, startMarker, endMarker, block, context = {}) {
  const original = readText(filePath);
  const withoutOld = removeBlock(original, startMarker, endMarker).replace(/\s+$/u, '');
  const next = withoutOld + '\n\n' + block + '\n';
  if (next === original) return false;
  prepareBackup(filePath, original, (content) => removeBlock(content, startMarker, endMarker));
  writeText(filePath, next);
  recordPatch(filePath, next, context);
  return true;
}

// Version/hash-aware restore. Returns { changed, action } where action is one of:
//   restored-backup | stripped | noop | missing | skipped-downgrade | strip-untrusted-backup
// Guards against (a) restoring a tampered backup and (b) silently downgrading a
// target extension file that was updated/replaced after we patched it.
// Strips our marker blocks in place (used when there is no usable backup, or the
// backup is untrusted). Surfaces a distinct action if markers somehow remain
// (e.g. a truncated end marker) so restore never falsely reports a clean noop.
function tryStripInPlace(filePath, strip, hasOurMarkers, current, opts) {
  const stripped = strip(current);
  let changed = false;
  if (stripped !== current) {
    try {
      writeText(filePath, stripped);
      changed = true;
    } catch (error) {
      return { changed: false, action: 'restore-failed', error: error.message };
    }
  }
  if (opts.cleanup) cleanupSidecars(filePath);
  else removeMeta(filePath);
  const remaining = hasOurMarkers(changed ? stripped : current);
  if (remaining) return { changed, action: opts.untrusted ? 'strip-untrusted-incomplete' : 'strip-incomplete' };
  if (opts.untrusted) return { changed, action: 'strip-untrusted-backup' };
  return { changed, action: changed ? 'stripped' : 'noop' };
}

function safeRestore(filePath, strip, hasOurMarkers) {
  if (!fs.existsSync(filePath)) {
    cleanupSidecars(filePath);
    return { changed: false, action: 'missing' };
  }
  const backupPath = backupPathFor(filePath);
  const meta = readMeta(filePath);
  let current;
  try {
    current = readText(filePath);
  } catch (error) {
    return { changed: false, action: 'restore-failed', error: error.message };
  }
  const currentHasMarkers = hasOurMarkers(current);

  if (fs.existsSync(backupPath)) {
    let backup;
    try {
      backup = readText(backupPath);
    } catch (error) {
      return { changed: false, action: 'restore-failed', error: error.message };
    }
    // Guard 1: a tampered/mismatched backup must never be written back; strip
    // our markers in place instead.
    if (meta && meta.originalSha && sha256(backup) !== meta.originalSha) {
      return tryStripInPlace(filePath, strip, hasOurMarkers, current, { cleanup: true, untrusted: true });
    }
    // Decide whether the live file is still exactly the output we patched. With
    // metadata, markers alone are not enough: a target extension can be edited or
    // updated while our marker block remains, and restoring the old backup would
    // silently downgrade that newer file. In that case strip our markers in place.
    if (meta && meta.patchedSha && sha256(current) !== meta.patchedSha) {
      if (currentHasMarkers) {
        return tryStripInPlace(filePath, strip, hasOurMarkers, current, { cleanup: true });
      }
      cleanupSidecars(filePath);
      return { changed: false, action: 'skipped-downgrade' };
    }
    // WITHOUT meta (legacy/our pre-meta installs, or a failed meta write) we must
    // still avoid blind restore: only restore if the live file has our markers or
    // is byte-for-byte equal to the backup.
    const liveIsOurs = meta && meta.patchedSha
      ? true
      : (currentHasMarkers || current === backup);
    if (!liveIsOurs) {
      cleanupSidecars(filePath);
      return { changed: false, action: 'skipped-downgrade' };
    }
    try {
      fs.copyFileSync(backupPath, filePath);
      fs.unlinkSync(backupPath);
    } catch (error) {
      return { changed: false, action: 'restore-failed', error: error.message };
    }
    removeMeta(filePath);
    return { changed: true, action: 'restored-backup' };
  }

  // No backup: only strip our own clean markers, never touch anything else.
  return tryStripInPlace(filePath, strip, hasOurMarkers, current, { cleanup: false });
}

function stripPairs(content, markerPairs) {
  let next = content;
  for (const [start, end] of markerPairs) next = removeBlock(next, start, end);
  return next;
}

function hasAnyMarker(content, markerPairs) {
  return markerPairs.some(([start]) => content.includes(start));
}

function restoreOrStrip(filePath, markerPairs) {
  return safeRestore(
    filePath,
    (content) => stripPairs(content, markerPairs),
    (content) => hasAnyMarker(content, markerPairs),
  );
}

function findClaudeCodeExtensions(options = {}) {
  return discoverTargets('claude', options, defaultExtensionsRoot());
}

function findCodexExtensions(options = {}) {
  return discoverTargets('codex', options, defaultExtensionsRoot());
}

function occurrenceCount(content, needle) {
  if (!needle) return 0;
  return String(content).split(needle).length - 1;
}

function checkMarkerPair(content, start, end, label, issues) {
  const starts = occurrenceCount(content, start);
  const ends = occurrenceCount(content, end);
  if (starts !== ends || starts > 1) {
    issues.push(`${label} has malformed or duplicate RastChin markers (${starts} start, ${ends} end).`);
  } else if (starts === 1 && content.indexOf(end) < content.indexOf(start)) {
    issues.push(`${label} has RastChin markers in an invalid order.`);
  }
}

function inspectRequiredFile(filePath, label, issues) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      issues.push(`${label} is not a regular file: ${filePath}`);
      return null;
    }
    // Respect a read-only installation even when tests happen to run as root.
    // Atomic rename could otherwise bypass the file's intended write protection.
    if ((stat.mode & 0o222) === 0) issues.push(`${label} is read-only: ${filePath}`);
    return readText(filePath);
  } catch (error) {
    issues.push(`${label} is unavailable: ${filePath} (${error.code || error.message})`);
    return null;
  }
}

function preflightClaudeExtension(ext, options = {}) {
  const issues = [];
  const warnings = [];
  const css = inspectRequiredFile(ext.cssPath, 'Claude webview CSS', issues);
  const js = inspectRequiredFile(ext.jsPath, 'Claude webview JavaScript', issues);

  if (css !== null) checkMarkerPair(css, MARKERS.claudeCssStart, MARKERS.claudeCssEnd, 'Claude webview CSS', issues);
  if (js !== null) checkMarkerPair(js, MARKERS.claudeJsStart, MARKERS.claudeJsEnd, 'Claude webview JavaScript', issues);

  const includePlan = options.patchClaudePlanPreview !== false;
  let plan = null;
  if (includePlan && ext.planPath && fs.existsSync(ext.planPath)) {
    plan = inspectRequiredFile(ext.planPath, 'Claude Plan Preview bundle', issues);
    if (plan !== null) {
      checkMarkerPair(plan, MARKERS.claudePlanCssStart, MARKERS.claudePlanCssEnd, 'Claude Plan Preview CSS', issues);
      checkMarkerPair(plan, MARKERS.claudePlanJsStart, MARKERS.claudePlanJsEnd, 'Claude Plan Preview JavaScript', issues);
      const clean = removePlanBlocks(plan);
      if (!/<meta[^>]+Content-Security-Policy[^>]*>|<\/head>/i.test(clean)) {
        issues.push('Claude Plan Preview has no supported CSS insertion anchor.');
      }
      if (!/<\/body>/i.test(clean)) issues.push('Claude Plan Preview has no closing body insertion anchor.');
    }
  } else if (includePlan) {
    warnings.push('Claude Plan Preview bundle was not found; the main chat can still be patched.');
  }

  return {
    compatible: issues.length === 0,
    adapter: 'claude-webview-v1',
    layoutRevision: ext.layoutRevision || 1,
    issues,
    warnings,
    surfaces: { chat: css !== null && js !== null, plan: includePlan && plan !== null },
  };
}

function preflightCodexExtension(ext) {
  const issues = [];
  const warnings = [];
  const html = inspectRequiredFile(ext.htmlPath, 'Codex webview HTML', issues);
  if (html !== null) {
    checkMarkerPair(html, MARKERS.codexHtmlStart, MARKERS.codexHtmlEnd, 'Codex webview HTML', issues);
    if (!/<head(?:\s[^>]*)?>/i.test(html) || !/<\/head>/i.test(html)) {
      issues.push('Codex webview HTML has no supported head insertion anchor.');
    }
  }
  return {
    compatible: issues.length === 0,
    adapter: 'codex-webview-v1',
    layoutRevision: ext.layoutRevision || 1,
    issues,
    warnings,
    surfaces: { chat: html !== null },
  };
}

function patchTrackingPaths(ext, targetFiles, assetFiles) {
  const paths = [];
  for (const filePath of targetFiles.filter(Boolean)) {
    paths.push(filePath, backupPathFor(filePath), metaPathFor(filePath));
  }
  paths.push(...assetFiles.filter(Boolean));
  return paths;
}

function patchContext(ext, adapter, surface) {
  return {
    targetExtensionId: ext.extensionId,
    targetExtensionVersion: ext.version,
    adapter,
    surface,
  };
}

function isClaudePatched(ext) {
  const css = ext.cssPath && fs.existsSync(ext.cssPath) ? readText(ext.cssPath) : '';
  const js = ext.jsPath && fs.existsSync(ext.jsPath) ? readText(ext.jsPath) : '';
  const plan = ext.extensionJsPath && fs.existsSync(ext.extensionJsPath) ? readText(ext.extensionJsPath) : '';
  return {
    css: hasBlock(css, MARKERS.claudeCssStart),
    js: ext.jsPath ? hasBlock(js, MARKERS.claudeJsStart) : false,
    plan: ext.extensionJsPath ? hasBlock(plan, MARKERS.claudePlanCssStart) && hasBlock(plan, MARKERS.claudePlanJsStart) : false,
  };
}

function isCodexPatched(ext) {
  const html = fs.existsSync(ext.htmlPath) ? readText(ext.htmlPath) : '';
  return hasBlock(html, MARKERS.codexHtmlStart);
}

// A backtick or ${ in a string that gets spliced INTO a JS template literal
// (the Plan Preview CSS/JS are injected into a literal in Claude's extension.js)
// closes / interpolates that literal early -> SyntaxError -> Claude's ENTIRE
// extension fails to activate (blank panel), not just RTL. Returns the offending
// token name, or null when the string is safe to embed.
function templateLiteralUnsafe(value) {
  if (typeof value !== 'string') return null;
  if (value.includes('`')) return 'backtick';
  if (value.includes('${')) return '${';
  return null;
}

// Fail-safe gate for the Plan Preview payload. The injectionSafety tests assert
// the static builders stay clean; this is the defense-in-depth that refuses to
// WRITE if a backtick/${ ever slips through (e.g. via dynamic font/version data),
// so a bad payload can never brick Claude's extension.js on disk. Returns a
// changed:false WARNING result to short-circuit the patch, or null to proceed.
function guardPlanPayload(css, js, name) {
  const cssToken = templateLiteralUnsafe(css);
  const jsToken = templateLiteralUnsafe(js);
  if (!cssToken && !jsToken) return null;
  const which = cssToken ? `CSS (raw ${cssToken})` : `JS (raw ${jsToken})`;
  return {
    changed: false,
    messages: [`${name}: WARNING — Plan Preview injection aborted; ${which} would break Claude's extension.js activation. Left the file intact.`],
  };
}

function patchClaudePlan(ext, options = {}) {
  if (options.patchClaudePlanPreview === false) {
    return { changed: false, messages: [`${ext.name}: Plan Preview disabled by configuration.`] };
  }
  if (!ext.extensionJsPath) return { changed: false, messages: [`${ext.name}: Plan Preview skipped; extension.js not found.`] };
  if (!fs.existsSync(ext.extensionJsPath)) return { changed: false, messages: [`${ext.name}: Plan Preview skipped; extension.js not found.`] };
  const original = readText(ext.extensionJsPath);
  const css = buildClaudePlanCss(fontDataUris());
  const js = buildClaudePlanJs();

  // Fail-safe: never write a payload that would break Claude's extension.js.
  const guard = guardPlanPayload(css, js, ext.name);
  if (guard) return guard;

  // Idempotency guard: if our EXACT current Plan CSS and JS blocks are already
  // present, do not rewrite. The removePlanBlocks/anchor round-trip is not byte
  // stable (it trims newlines around anchors), so re-writing an unchanged patch
  // drifted the file every startup and made the reload toast fire every launch.
  if (original.includes(css) && original.includes(js)) {
    return { changed: false, messages: [`${ext.name}: Plan Preview already current.`] };
  }

  let next = removePlanBlocks(original);

  const cspMatch = next.match(/<meta[^>]+Content-Security-Policy[^>]*>/i);
  if (cspMatch) {
    const cspTag = ensureFontSrcData(cspMatch[0]);
    next = next.replace(cspMatch[0], () => cspTag + '\n' + css);
  } else if (next.includes('</head>')) {
    next = next.replace('</head>', () => css + '\n</head>');
  } else {
    return { changed: false, messages: [`${ext.name}: Plan Preview CSS anchor not found.`] };
  }

  const bodyMatches = [...next.matchAll(/<\/body>/gi)];
  const bodyMatch = bodyMatches[bodyMatches.length - 1];
  if (!bodyMatch) {
    return { changed: false, messages: [`${ext.name}: Plan Preview body anchor not found.`] };
  }
  const bodyIndex = bodyMatch.index;
  next = next.slice(0, bodyIndex) + js + '\n' + next.slice(bodyIndex);

  if (next !== original) {
    prepareBackup(ext.extensionJsPath, original, (content) => removePlanBlocks(content));
    writeText(ext.extensionJsPath, next);
    recordPatch(ext.extensionJsPath, next, patchContext(ext, 'claude-webview-v1', 'plan-preview'));
    return { changed: true, messages: [`${ext.name}: Plan Preview patched.`] };
  }
  return { changed: false, messages: [`${ext.name}: Plan Preview already current.`] };
}

// Returns { changed, contentChanged, messages }. `changed` is true for ANY write
// (including a font/asset refresh); `contentChanged` is true only when a patched
// webview/extension block was (re)written — i.e. the kind of change that needs a
// window reload to take effect. The startup flow prompts for reload only on
// contentChanged so a routine asset refresh stays silent.
function patchClaudeExtension(ext, options = {}) {
  const injectDir = path.join(path.dirname(ext.cssPath), INJECT_DIR);
  const preflight = preflightClaudeExtension(ext, options);
  if (!preflight.compatible) {
    return {
      changed: false,
      contentChanged: false,
      skipped: true,
      compatibility: preflight,
      messages: [
        `${ext.name} [v${ext.version}]: WARNING — unsupported Claude layout; no files were changed.`,
        ...preflight.issues.map((issue) => `  - ${issue}`),
      ],
    };
  }

  const targetFiles = [ext.cssPath, ext.jsPath];
  if (options.patchClaudePlanPreview !== false && fs.existsSync(ext.extensionJsPath)) targetFiles.push(ext.extensionJsPath);
  const assets = FONT_FILES.map((fileName) => path.join(injectDir, fileName));
  const tracked = patchTrackingPaths(ext, targetFiles, assets);

  try {
    const result = runFileTransaction(tracked, () => {
      const messages = preflight.warnings.map((warning) => `${ext.name}: NOTE — ${warning}`);
      let changed = false;
      let contentChanged = false;

      if (copyBundledFonts(injectDir)) {
        changed = true;
        messages.push(`${ext.name}: Vazirmatn fonts copied.`);
      }
      if (appendBlock(
        ext.cssPath,
        MARKERS.claudeCssStart,
        MARKERS.claudeCssEnd,
        buildClaudeCss(),
        patchContext(ext, preflight.adapter, 'chat-css'),
      )) {
        changed = true;
        contentChanged = true;
        messages.push(`${ext.name}: CSS patched.`);
      }
      if (appendBlock(
        ext.jsPath,
        MARKERS.claudeJsStart,
        MARKERS.claudeJsEnd,
        buildClaudeJs(),
        patchContext(ext, preflight.adapter, 'chat-runtime'),
      )) {
        changed = true;
        contentChanged = true;
        messages.push(`${ext.name}: JS patched.`);
      }

      const plan = patchClaudePlan(ext, options);
      changed = changed || plan.changed;
      contentChanged = contentChanged || plan.changed;
      messages.push(...plan.messages);
      return { changed, contentChanged, messages, compatibility: preflight };
    });
    return result;
  } catch (error) {
    try {
      if (fs.existsSync(injectDir) && fs.readdirSync(injectDir).length === 0) fs.rmdirSync(injectDir);
    } catch { /* best effort after rollback */ }
    return {
      changed: false,
      contentChanged: false,
      skipped: true,
      compatibility: preflight,
      messages: [`${ext.name}: WARNING — transactional patch failed: ${error.message}`],
    };
  }
}

function patchClaude(options = {}) {
  const exts = findClaudeCodeExtensions(options);
  const messages = [];
  let changed = false;
  let contentChanged = false;
  for (const ext of exts) {
    try {
      const result = patchClaudeExtension(ext, options);
      changed = changed || result.changed;
      contentChanged = contentChanged || result.contentChanged;
      messages.push(...result.messages);
    } catch (error) {
      messages.push(`${ext.name}: WARNING — patch orchestration failed: ${error.message}`);
    }
  }
  if (exts.length === 0) messages.push('Claude Code extension not found.');
  return { found: exts.length > 0, changed, contentChanged, messages, count: exts.length };
}

function removeInjectDir(injectDir) {
  try {
    removeBundledFonts(injectDir);
    if (fs.existsSync(injectDir)) fs.rmSync(injectDir, { recursive: true, force: true });
    return null;
  } catch (error) {
    return error.message;
  }
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
    }
  };
  try { visit(directory); } catch { return files; }
  return files;
}

// Translates a restore action into a user-facing warning, or null when the
// restore was clean. Keeps the disable/restore command honest about partial
// results (downgrade skipped, write failed, markers not fully removed).
function restoreWarning(name, parts) {
  for (const part of parts) {
    if (part.action === 'skipped-downgrade') {
      return `${name}: WARNING — a target file changed since patching; left it intact to avoid downgrade. Remove manually if needed.`;
    }
    if (part.action === 'restore-failed') {
      return `${name}: WARNING — restore failed (${part.error || 'write error'}); the file may still be patched.`;
    }
    if (part.action === 'strip-incomplete' || part.action === 'strip-untrusted-incomplete') {
      return `${name}: WARNING — could not fully remove our patch markers (corrupt block?); please check manually.`;
    }
  }
  return null;
}

function restoreClaude(options = {}) {
  const exts = findClaudeCodeExtensions(options);
  const messages = [];
  let changed = false;
  for (const ext of exts) {
    const injectDir = path.join(path.dirname(ext.cssPath), INJECT_DIR);
    const hadAssets = fs.existsSync(injectDir);
    const targetFiles = [ext.cssPath, ext.jsPath, ext.extensionJsPath].filter(Boolean);
    const tracked = patchTrackingPaths(ext, targetFiles, filesUnder(injectDir));
    try {
      const result = runFileTransaction(tracked, () => {
        const css = restoreOrStrip(ext.cssPath, [[MARKERS.claudeCssStart, MARKERS.claudeCssEnd]]);
        const js = ext.jsPath ? restoreOrStrip(ext.jsPath, [[MARKERS.claudeJsStart, MARKERS.claudeJsEnd]]) : { changed: false, action: 'absent' };
        const plan = ext.extensionJsPath ? restorePlan(ext.extensionJsPath) : { changed: false, action: 'absent' };
        const parts = [css, js, plan];
        const failed = parts.find((part) => ['restore-failed', 'strip-incomplete', 'strip-untrusted-incomplete'].includes(part.action));
        if (failed) throw new Error(failed.error || failed.action);
        const cleanupErr = removeInjectDir(injectDir);
        if (cleanupErr) throw new Error(`injected asset cleanup failed: ${cleanupErr}`);
        return { css, js, plan, changed: hadAssets || parts.some((part) => part.changed) };
      });
      changed = changed || result.changed;
      messages.push(`${ext.name}: restored CSS=${result.css.action}, JS=${result.js.action}, Plan=${result.plan.action}.`);
      const warn = restoreWarning(ext.name, [result.css, result.js, result.plan]);
      if (warn) messages.push(warn);
    } catch (error) {
      messages.push(`${ext.name}: WARNING — transactional restore failed: ${error.message}`);
    }
  }
  if (exts.length === 0) messages.push('Claude Code extension not found.');
  return { found: exts.length > 0, changed, messages, count: exts.length };
}

function patchCodexExtension(ext) {
  const preflight = preflightCodexExtension(ext);
  if (!preflight.compatible) {
    return {
      changed: false,
      contentChanged: false,
      skipped: true,
      compatibility: preflight,
      messages: [
        `${ext.name} [v${ext.version}]: WARNING — unsupported Codex layout; no files were changed.`,
        ...preflight.issues.map((issue) => `  - ${issue}`),
      ],
    };
  }

  const injectDir = path.join(ext.webviewDir, INJECT_DIR);
  const cssPath = path.join(injectDir, 'persian-rtl-clean.css');
  const jsPath = path.join(injectDir, 'persian-rtl-clean.js');
  const assets = [cssPath, jsPath, ...FONT_FILES.map((fileName) => path.join(injectDir, fileName))];
  const tracked = patchTrackingPaths(ext, [ext.htmlPath], assets);

  try {
    return runFileTransaction(tracked, () => {
      fs.mkdirSync(injectDir, { recursive: true });
      // The injected runtime JS/CSS are separate files referenced by the HTML; a
      // change to either is a content change that needs a reload, even when the
      // HTML wrapper is unchanged. A font refresh is asset-only.
      const cssChanged = writeTextIfChanged(cssPath, buildCodexCss());
      const jsChanged = writeTextIfChanged(jsPath, buildCodexJs());
      const fontsChanged = copyBundledFonts(injectDir);
      const assetChanged = cssChanged || jsChanged || fontsChanged;
      const runtimeChanged = cssChanged || jsChanged;

      const original = readText(ext.htmlPath);
      const injection = codexInjectionBlock();

      let html = original.replace(/<meta[^>]+Content-Security-Policy[^>]*>/i, (tag) => ensureCodexAssetCsp(tag));
      if (!html.includes(injection)) {
        html = removeBlock(html, MARKERS.codexHtmlStart, MARKERS.codexHtmlEnd);
        html = html.replace(/<\/head>/i, () => injection + '\n  </head>');
      }

      const htmlChanged = html !== original;
      if (htmlChanged) {
        prepareBackup(
          ext.htmlPath,
          original,
          (content) => removeBlock(content, MARKERS.codexHtmlStart, MARKERS.codexHtmlEnd),
        );
        writeText(ext.htmlPath, html);
        recordPatch(ext.htmlPath, html, patchContext(ext, preflight.adapter, 'webview-loader'));
      }

      const changed = htmlChanged || assetChanged;
      const contentChanged = htmlChanged || runtimeChanged;
      const detail = htmlChanged ? 'patched' : runtimeChanged ? 'runtime updated' : assetChanged ? 'assets refreshed' : 'already current';
      return {
        changed,
        contentChanged,
        compatibility: preflight,
        messages: [`${ext.name}: Codex webview ${detail}.`],
      };
    });
  } catch (error) {
    try {
      if (fs.existsSync(injectDir) && fs.readdirSync(injectDir).length === 0) fs.rmdirSync(injectDir);
    } catch { /* best effort after rollback */ }
    return {
      changed: false,
      contentChanged: false,
      skipped: true,
      compatibility: preflight,
      messages: [`${ext.name}: WARNING — transactional patch failed: ${error.message}`],
    };
  }
}

function patchCodex(options = {}) {
  const exts = findCodexExtensions(options);
  const messages = [];
  let changed = false;
  let contentChanged = false;
  for (const ext of exts) {
    try {
      const result = patchCodexExtension(ext);
      changed = changed || result.changed;
      contentChanged = contentChanged || result.contentChanged;
      messages.push(...result.messages);
    } catch (error) {
      messages.push(`${ext.name}: WARNING — patch orchestration failed: ${error.message}`);
    }
  }
  if (exts.length === 0) messages.push('Codex / ChatGPT extension not found.');
  return { found: exts.length > 0, changed, contentChanged, messages, count: exts.length };
}

function restoreCodex(options = {}) {
  const exts = findCodexExtensions(options);
  const messages = [];
  let changed = false;
  for (const ext of exts) {
    const injectDir = path.join(ext.webviewDir, INJECT_DIR);
    const hadAssets = fs.existsSync(injectDir);
    const tracked = patchTrackingPaths(ext, [ext.htmlPath], filesUnder(injectDir));
    try {
      const result = runFileTransaction(tracked, () => {
        const html = restoreOrStrip(ext.htmlPath, [[MARKERS.codexHtmlStart, MARKERS.codexHtmlEnd]]);
        if (['restore-failed', 'strip-incomplete', 'strip-untrusted-incomplete'].includes(html.action)) {
          throw new Error(html.error || html.action);
        }
        const cleanupErr = removeInjectDir(injectDir);
        if (cleanupErr) throw new Error(`injected asset cleanup failed: ${cleanupErr}`);
        return { ...html, changed: html.changed || hadAssets };
      });
      changed = changed || result.changed;
      messages.push(`${ext.name}: restored HTML=${result.action}.`);
      const warn = restoreWarning(ext.name, [result]);
      if (warn) messages.push(warn);
    } catch (error) {
      messages.push(`${ext.name}: WARNING — transactional restore failed: ${error.message}`);
    }
  }
  if (exts.length === 0) messages.push('Codex / ChatGPT extension not found.');
  return { found: exts.length > 0, changed, messages, count: exts.length };
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readIf(filePath) {
  try {
    return filePath && fs.existsSync(filePath) ? readText(filePath) : '';
  } catch {
    return '';
  }
}

function versionFromName(name, prefix) {
  const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  // names look like "2.1.183-darwin-arm64"; the version is the first dash-group.
  return rest.split('-')[0] || rest;
}

// Numeric, segment-wise version compare. A lexical sort would rank 2.1.9 above
// 2.1.10 and mis-order Codex build ids like 26.616.51431 vs 26.616.41845, so the
// "which version is active" detection must compare each dotted segment as a
// number. Returns -1 / 0 / 1.
function compareVersions(a, b) {
  const pa = String(a == null ? '' : a).split(/[.+-]/);
  const pb = String(b == null ? '' : b).split(/[.+-]/);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = parseInt(pa[i], 10) || 0;
    const db = parseInt(pb[i], 10) || 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

// Flags the highest-semver entry as the version VS Code actually activates when
// several builds of the same extension are installed side by side (e.g. an old
// version left behind after an update). DETECTION ONLY — it never changes which
// versions patchAll/restoreAll touch; those still cover every installed version.
function markActive(items) {
  if (!items.length) return items;
  const suppliedActive = items.filter((item) => item.active);
  if (suppliedActive.length === 1) return items;
  let activeIdx = 0;
  for (let i = 1; i < items.length; i++) {
    if (compareVersions(items[i].version, items[activeIdx].version) > 0) activeIdx = i;
  }
  return items.map((item, i) => Object.assign({}, item, { active: i === activeIdx }));
}

function dirExists(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// Returns the legacy/our backup + meta sidecar files that exist next to any of the
// given target files (so the user can see exactly what is on disk).
function sidecarsFor(targetPaths) {
  const ours = [];
  const legacy = [];
  const meta = [];
  for (const target of targetPaths) {
    if (!target) continue;
    if (fs.existsSync(target + BACKUP_SUFFIX)) ours.push(path.basename(target + BACKUP_SUFFIX));
    if (fs.existsSync(target + META_SUFFIX)) meta.push(path.basename(target + META_SUFFIX));
    for (const suffix of LEGACY_BACKUP_SUFFIXES) {
      if (fs.existsSync(target + suffix)) legacy.push(path.basename(target + suffix));
    }
  }
  return { ours, legacy, meta };
}

function claudeTargetPaths(ext) {
  return [ext.cssPath, ext.jsPath, ext.extensionJsPath].filter(Boolean);
}

function hasLegacyClaude(ext) {
  const css = readIf(ext.cssPath);
  const js = readIf(ext.jsPath);
  const plan = readIf(ext.extensionJsPath);
  return {
    css: css.includes(LEGACY_MARKERS.claudeCssStart) || css.includes(LEGACY_MARKERS.yechielCssStart),
    js: js.includes(LEGACY_MARKERS.claudeJsStart) || js.includes(LEGACY_MARKERS.yechielJsStart),
    plan: plan.includes(LEGACY_MARKERS.claudePlanCssStart) || plan.includes(LEGACY_MARKERS.claudePlanJsStart),
  };
}

function hasLegacyCodex(ext) {
  return readIf(ext.htmlPath).includes(LEGACY_MARKERS.codexHtmlStart);
}

// Best-effort, READ-ONLY detection of the legacy extension's workbench.html patch.
// This extension never writes to the VS Code app; we only report what we find.
function workbenchCandidates() {
  const candidates = [];
  const appRoots = [];
  if (process.platform === 'darwin') {
    appRoots.push('/Applications/Visual Studio Code.app/Contents/Resources/app');
    appRoots.push('/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app');
    appRoots.push(path.join(os.homedir(), 'Applications', 'Visual Studio Code.app', 'Contents', 'Resources', 'app'));
  } else if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) appRoots.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'resources', 'app'));
    if (process.env.ProgramFiles) appRoots.push(path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'resources', 'app'));
  } else {
    appRoots.push('/usr/share/code/resources/app');
    appRoots.push('/usr/lib/code/resources/app');
    appRoots.push('/opt/visual-studio-code/resources/app');
  }
  const inner = ['electron-sandbox', 'electron-browser'];
  for (const root of appRoots) {
    for (const env of inner) {
      candidates.push(path.join(root, 'out', 'vs', 'code', env, 'workbench', 'workbench.html'));
    }
  }
  return candidates;
}

// STRICTLY READ-ONLY integrity diagnostics for the VS Code app. The legacy
// "Persian RTL Chat" extension patched workbench.html and rewrote the matching
// checksum in product.json; if it later restored workbench.html from its backup
// but left product.json's checksum changed, VS Code's own integrity check fails
// and shows "Your Code installation appears to be corrupt." We reproduce that
// check (and look for the orphan legacy backup) so Status can EXPLAIN the warning.
// This function never writes anything.
function appIntegrityStatus(workbenchPath) {
  const result = {
    legacyBackup: false,
    productPath: null,
    checksumKey: null,
    checksumMismatch: false,
  };
  try {
    for (const suffix of LEGACY_BACKUP_SUFFIXES) {
      if (fs.existsSync(workbenchPath + suffix)) { result.legacyBackup = true; break; }
    }
  } catch { /* read-only best effort */ }
  try {
    // <app>/out/vs/code/<env>/workbench/workbench.html -> <app>/product.json
    const productPath = path.resolve(path.dirname(workbenchPath), '..', '..', '..', '..', '..', 'product.json');
    if (fs.existsSync(productPath)) {
      result.productPath = productPath;
      const product = JSON.parse(readText(productPath));
      const keyMatch = workbenchPath.replace(/\\/g, '/').match(/(vs\/code\/[^/]+\/workbench\/workbench\.html)$/);
      const key = keyMatch ? keyMatch[1] : null;
      result.checksumKey = key;
      if (product && product.checksums && key && Object.prototype.hasOwnProperty.call(product.checksums, key)) {
        const expected = product.checksums[key];
        // VS Code stores base64 sha256 with trailing '=' padding stripped.
        const actual = crypto.createHash('sha256').update(fs.readFileSync(workbenchPath)).digest('base64').replace(/=+$/, '');
        result.checksumMismatch = expected !== actual;
      }
    }
  } catch { /* read-only best effort; never block status on app inspection */ }
  return result;
}

function workbenchStatus(options = {}) {
  const candidates = options.workbenchCandidates || workbenchCandidates();
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const html = readIf(filePath);
    const integrity = appIntegrityStatus(filePath);
    return {
      found: true,
      path: filePath,
      legacy: html.includes(LEGACY_WORKBENCH_MARKER),
      legacyBackup: integrity.legacyBackup,
      productPath: integrity.productPath,
      checksumMismatch: integrity.checksumMismatch,
      // A legacy app-level patch is the likely cause of the corrupt warning when
      // either an orphan legacy backup sits next to workbench.html or the stored
      // integrity checksum no longer matches the on-disk workbench.html.
      corruptionLikely: html.includes(LEGACY_WORKBENCH_MARKER) || integrity.legacyBackup || integrity.checksumMismatch,
    };
  }
  return { found: false, path: null, legacy: false, legacyBackup: false, productPath: null, checksumMismatch: false, corruptionLikely: false };
}

// Reads the embedded runtime fingerprint back out of an injected file (Claude
// index.js, or the standalone Codex persian-rtl-clean.js). Returns null when no
// fingerprint comment is present (an older, pre-fingerprint patch).
function readRuntimeFp(filePath) {
  const m = readIf(filePath).match(RUNTIME_FP_RE);
  return m ? { fp: m[1], version: m[2] } : null;
}

// Classifies a target against the bundled runtime so Status can call out a stale
// patch without a window reload:
//   absent          - not patched
//   unfingerprinted - patched, but by a build before fingerprints existed
//   stale           - patched, fingerprint differs from the bundled runtime
//   current         - patched, fingerprint matches the bundled runtime
function runtimeStateFrom(patched, fpInfo) {
  if (!patched) return 'absent';
  if (!fpInfo) return 'unfingerprinted';
  return fpInfo.fp === RUNTIME_FP ? 'current' : 'stale';
}

function claudeDiagnostics(ext, options = {}) {
  const clean = isClaudePatched(ext);
  const injectDir = path.join(path.dirname(ext.cssPath), INJECT_DIR);
  const legacyDir = path.join(path.dirname(ext.cssPath), LEGACY_INJECT_DIR);
  const sidecars = sidecarsFor(claudeTargetPaths(ext));
  const patched = clean.css && clean.js;
  const fpInfo = readRuntimeFp(ext.jsPath);
  return {
    name: ext.name,
    version: ext.version || versionFromName(ext.name, CLAUDE_PREFIX),
    extensionId: ext.extensionId || 'anthropic.claude-code',
    discovery: ext.source || 'filesystem',
    active: !!ext.active,
    compatibility: preflightClaudeExtension(ext, options),
    // Back-compat flat fields (consumed by existing callers/tests).
    css: clean.css,
    js: clean.js,
    plan: clean.plan,
    // Webview RTL is fully applied when both CSS and JS carry our markers; Plan
    // Preview is a separate, secondary surface and not part of this signal.
    patched,
    clean,
    legacy: hasLegacyClaude(ext),
    injectDir: dirExists(injectDir),
    legacyInjectDir: dirExists(legacyDir),
    backups: sidecars.ours,
    legacyBackups: sidecars.legacy,
    meta: sidecars.meta,
    runtimeFp: fpInfo ? fpInfo.fp : null,
    runtimeState: runtimeStateFrom(patched, fpInfo),
  };
}

function codexDiagnostics(ext) {
  const injectDir = path.join(ext.webviewDir, INJECT_DIR);
  const legacyDir = path.join(ext.webviewDir, LEGACY_INJECT_DIR);
  const sidecars = sidecarsFor([ext.htmlPath]);
  const patched = isCodexPatched(ext);
  const fpInfo = readRuntimeFp(path.join(injectDir, 'persian-rtl-clean.js'));
  return {
    name: ext.name,
    version: ext.version || versionFromName(ext.name, CODEX_PREFIX),
    extensionId: ext.extensionId || 'openai.chatgpt',
    discovery: ext.source || 'filesystem',
    active: !!ext.active,
    compatibility: preflightCodexExtension(ext),
    // Back-compat flat field.
    patched,
    clean: patched,
    legacy: hasLegacyCodex(ext),
    injectDir: dirExists(injectDir),
    legacyInjectDir: dirExists(legacyDir),
    backups: sidecars.ours,
    legacyBackups: sidecars.legacy,
    meta: sidecars.meta,
    runtimeFp: fpInfo ? fpInfo.fp : null,
    runtimeState: runtimeStateFrom(patched, fpInfo),
  };
}

function status(options = {}) {
  const claude = markActive(findClaudeCodeExtensions(options).map((ext) => claudeDiagnostics(ext, options)));
  const codex = markActive(findCodexExtensions(options).map(codexDiagnostics));
  return {
    version: EXTENSION_VERSION,
    bundledRuntimeFp: RUNTIME_FP,
    workbench: workbenchStatus(options),
    claude,
    codex,
  };
}

function sameFileContent(filePath, expected) {
  try {
    return fs.existsSync(filePath) && fs.readFileSync(filePath).equals(Buffer.isBuffer(expected) ? expected : Buffer.from(expected));
  } catch {
    return false;
  }
}

function fontsCurrent(injectDir) {
  return FONT_FILES.every((fileName) => sameFileContent(path.join(injectDir, fileName), fs.readFileSync(bundledFontPath(fileName))));
}

function planClaudeTarget(ext, options = {}) {
  const compatibility = preflightClaudeExtension(ext, options);
  const item = {
    key: 'claude',
    label: 'Claude Code',
    name: ext.name,
    version: ext.version || versionFromName(ext.name, CLAUDE_PREFIX),
    extensionPath: ext.dir,
    files: [ext.cssPath, ext.jsPath, ...(compatibility.surfaces.plan ? [ext.extensionJsPath] : [])],
    adapter: compatibility.adapter,
    compatible: compatibility.compatible,
    issues: compatibility.issues,
    warnings: compatibility.warnings,
    actions: [],
  };
  if (!item.compatible) return item;

  const css = readText(ext.cssPath);
  const js = readText(ext.jsPath);
  if (!css.includes(buildClaudeCss())) item.actions.push('update chat CSS');
  if (!js.includes(buildClaudeJs())) item.actions.push('update chat runtime');
  const injectDir = path.join(path.dirname(ext.cssPath), INJECT_DIR);
  if (!fontsCurrent(injectDir)) item.actions.push('refresh Vazirmatn fonts');
  if (compatibility.surfaces.plan) {
    const plan = readText(ext.extensionJsPath);
    if (!plan.includes(buildClaudePlanCss(fontDataUris())) || !plan.includes(buildClaudePlanJs())) {
      item.actions.push('update Plan Preview RTL');
    }
  }
  item.current = item.actions.length === 0;
  return item;
}

function codexInjectionBlock() {
  return [
    MARKERS.codexHtmlStart,
    `    <link rel="stylesheet" href="./${INJECT_DIR}/persian-rtl-clean.css">`,
    `    <script defer src="./${INJECT_DIR}/persian-rtl-clean.js"></script>`,
    `    ${MARKERS.codexHtmlEnd}`,
  ].join('\n');
}

function planCodexTarget(ext) {
  const compatibility = preflightCodexExtension(ext);
  const item = {
    key: 'codex',
    label: 'Codex / ChatGPT',
    name: ext.name,
    version: ext.version || versionFromName(ext.name, CODEX_PREFIX),
    extensionPath: ext.dir,
    files: [ext.htmlPath],
    adapter: compatibility.adapter,
    compatible: compatibility.compatible,
    issues: compatibility.issues,
    warnings: compatibility.warnings,
    actions: [],
  };
  if (!item.compatible) return item;

  const html = readText(ext.htmlPath);
  if (!html.includes(codexInjectionBlock())) item.actions.push('install webview loader');
  const cspMatch = html.match(/<meta[^>]+Content-Security-Policy[^>]*>/i);
  if (cspMatch && ensureCodexAssetCsp(cspMatch[0]) !== cspMatch[0]) item.actions.push('allow injected assets in CSP');
  const injectDir = ext.webviewDir && path.join(ext.webviewDir, INJECT_DIR);
  if (!sameFileContent(path.join(injectDir, 'persian-rtl-clean.css'), buildCodexCss())) item.actions.push('update chat CSS');
  if (!sameFileContent(path.join(injectDir, 'persian-rtl-clean.js'), buildCodexJs())) item.actions.push('update chat runtime');
  if (!fontsCurrent(injectDir)) item.actions.push('refresh Vazirmatn fonts');
  item.current = item.actions.length === 0;
  return item;
}

// Read-only patch plan used by the command confirmation UI. It runs the same
// layout checks as the writers, so the user sees unsupported targets before any
// installed extension file is touched.
function planAll(options = {}) {
  const targets = [];
  if (options.includeClaude !== false) {
    targets.push(...findClaudeCodeExtensions(options).map((ext) => planClaudeTarget(ext, options)));
  }
  if (options.includeCodex !== false) {
    targets.push(...findCodexExtensions(options).map(planCodexTarget));
  }
  const actionable = targets.filter((target) => target.compatible && target.actions.length > 0);
  const incompatible = targets.filter((target) => !target.compatible);
  const messages = [];
  for (const target of targets) {
    const prefix = `${target.label} v${target.version} (${target.adapter})`;
    if (!target.compatible) {
      messages.push(`${prefix}: UNSUPPORTED — no files will be changed.`);
      messages.push(...target.issues.map((issue) => `  - ${issue}`));
    } else if (target.actions.length) {
      messages.push(`${prefix}: ${target.actions.join('; ')}.`);
    } else {
      messages.push(`${prefix}: already current.`);
    }
    messages.push(`  path: ${target.extensionPath}`);
    messages.push(...target.warnings.map((warning) => `  NOTE: ${warning}`));
  }
  if (!targets.length) messages.push('No enabled Claude Code or Codex target was found.');
  return {
    changed: actionable.length > 0,
    actionableCount: actionable.length,
    incompatibleCount: incompatible.length,
    targets,
    messages,
  };
}

function stripLegacyBlocks(filePath, pairs) {
  if (!fs.existsSync(filePath)) return false;
  ensureBackup(filePath);
  const original = readText(filePath);
  let next = original;
  for (const [start, end] of pairs) next = removeBlock(next, start, end);
  if (next !== original) {
    writeText(filePath, next);
    return true;
  }
  return false;
}

function restorePlan(filePath) {
  return safeRestore(
    filePath,
    (content) => removePlanBlocks(content),
    (content) => content.includes(MARKERS.claudePlanCssStart) || content.includes(MARKERS.claudePlanJsStart),
  );
}

function stripLegacyPlan(filePath) {
  if (!fs.existsSync(filePath)) return false;
  ensureBackup(filePath);
  const original = readText(filePath);
  const next = removePlanBlocks(original, LEGACY_MARKERS);
  if (next !== original) {
    writeText(filePath, next);
    return true;
  }
  return false;
}

function cleanLegacy(options = {}) {
  const messages = [];
  let changed = false;

  for (const ext of findClaudeCodeExtensions(options)) {
    const cssChanged = stripLegacyBlocks(ext.cssPath, [
      [LEGACY_MARKERS.claudeCssStart, LEGACY_MARKERS.claudeCssEnd],
      [LEGACY_MARKERS.yechielCssStart, LEGACY_MARKERS.yechielCssEnd],
    ]);
    const jsChanged = ext.jsPath ? stripLegacyBlocks(ext.jsPath, [
      [LEGACY_MARKERS.claudeJsStart, LEGACY_MARKERS.claudeJsEnd],
      [LEGACY_MARKERS.yechielJsStart, LEGACY_MARKERS.yechielJsEnd],
    ]) : false;
    const planChanged = ext.extensionJsPath ? stripLegacyPlan(ext.extensionJsPath) : false;
    changed = changed || cssChanged || jsChanged || planChanged;
    messages.push(`${ext.name}: legacy Claude blocks removed CSS=${cssChanged}, JS=${jsChanged}, Plan=${planChanged}.`);
  }

  for (const ext of findCodexExtensions(options)) {
    const htmlChanged = stripLegacyBlocks(ext.htmlPath, [[LEGACY_MARKERS.codexHtmlStart, LEGACY_MARKERS.codexHtmlEnd]]);
    const legacyDir = path.join(ext.webviewDir, 'persian-rtl');
    if (htmlChanged && fs.existsSync(legacyDir)) fs.rmSync(legacyDir, { recursive: true, force: true });
    changed = changed || htmlChanged;
    messages.push(`${ext.name}: legacy Codex block removed HTML=${htmlChanged}.`);
  }

  if (!messages.length) messages.push('No Claude Code or Codex extension found.');
  return { changed, messages };
}

function patchAll(options = {}) {
  const messages = [];
  let changed = false;
  let contentChanged = false;
  if (options.includeClaude !== false) {
    const result = patchClaude(options);
    changed = changed || result.changed;
    contentChanged = contentChanged || result.contentChanged;
    messages.push(...result.messages);
  }
  if (options.includeCodex !== false) {
    const result = patchCodex(options);
    changed = changed || result.changed;
    contentChanged = contentChanged || result.contentChanged;
    messages.push(...result.messages);
  }
  return { changed, contentChanged, messages };
}

function restoreAll(options = {}) {
  const messages = [];
  let changed = false;
  if (options.includeClaude !== false) {
    const result = restoreClaude(options);
    changed = changed || result.changed;
    messages.push(...result.messages);
  }
  if (options.includeCodex !== false) {
    const result = restoreCodex(options);
    changed = changed || result.changed;
    messages.push(...result.messages);
  }
  return { changed, messages };
}

module.exports = {
  cleanLegacy,
  compareVersions,
  defaultExtensionsRoot,
  EXTENSION_VERSION,
  findClaudeCodeExtensions,
  findCodexExtensions,
  planAll,
  patchAll,
  patchClaude,
  patchCodex,
  copyBundledFonts,
  fontDataUris,
  removeEnclosingTagBlock,
  removeBlock,
  removePlanBlocks,
  templateLiteralUnsafe,
  guardPlanPayload,
  preflightClaudeExtension,
  preflightCodexExtension,
  restoreAll,
  restoreClaude,
  restoreCodex,
  sha256,
  status,
  versionFromName,
  workbenchStatus,
};
