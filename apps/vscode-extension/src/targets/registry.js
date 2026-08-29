const fs = require('fs');
const path = require('path');

// Agent integrations are deliberately kept as data. The patcher owns the safe
// file operations; this registry owns discovery and the layouts we understand.
// Adding another agent should mean adding another adapter instead of growing a
// collection of unrelated directory-name checks in patcher.js.
const TARGETS = Object.freeze({
  claude: Object.freeze({
    key: 'claude',
    label: 'Claude Code',
    extensionId: 'anthropic.claude-code',
    directoryPrefix: 'anthropic.claude-code-',
    layoutRevision: 1,
    files: Object.freeze({
      css: path.join('webview', 'index.css'),
      js: path.join('webview', 'index.js'),
      plan: 'extension.js',
    }),
  }),
  codex: Object.freeze({
    key: 'codex',
    label: 'Codex / ChatGPT',
    extensionId: 'openai.chatgpt',
    directoryPrefix: 'openai.chatgpt-',
    layoutRevision: 1,
    files: Object.freeze({
      html: path.join('webview', 'index.html'),
    }),
  }),
});

function readPackageJson(extensionPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function versionFromDirectory(name, prefix) {
  const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  return rest.split('-')[0] || rest;
}

function normalizeCandidate(spec, value, source) {
  if (!value) return null;
  const rawPath = typeof value === 'string' ? value : value.extensionPath || value.path;
  if (!rawPath) return null;
  const extensionPath = path.resolve(rawPath);
  if (!fs.existsSync(extensionPath)) return null;

  const manifest = readPackageJson(extensionPath);
  const manifestId = manifest && manifest.publisher && manifest.name
    ? `${manifest.publisher}.${manifest.name}`
    : null;
  // An exact path supplied by VS Code is authoritative. For fallback scanning,
  // a package manifest that identifies a different extension is rejected.
  if (source === 'filesystem' && manifestId && manifestId !== spec.extensionId) return null;

  const givenVersion = typeof value === 'object' && value.version ? String(value.version) : null;
  const version = givenVersion
    || (manifest && manifest.version ? String(manifest.version) : null)
    || versionFromDirectory(path.basename(extensionPath), spec.directoryPrefix);

  const candidate = {
    key: spec.key,
    label: spec.label,
    extensionId: spec.extensionId,
    extensionPath,
    dir: extensionPath,
    name: path.basename(extensionPath),
    version,
    source,
    active: source === 'vscode-api',
    layoutRevision: spec.layoutRevision,
  };
  for (const [name, relativePath] of Object.entries(spec.files)) {
    candidate[`${name}Path`] = path.join(extensionPath, relativePath);
  }
  if (spec.key === 'claude') candidate.extensionJsPath = candidate.planPath;
  if (spec.key === 'codex') candidate.webviewDir = path.dirname(candidate.htmlPath);
  return candidate;
}

function listFallbackCandidates(root, spec) {
  if (!root || !fs.existsSync(root)) return [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(spec.directoryPrefix))
    .map((entry) => normalizeCandidate(spec, path.join(root, entry.name), 'filesystem'))
    .filter(Boolean);
}

function rootsFromOptions(options, defaultRoot) {
  const configured = options.extensionsRoots || options.extensionsRoot || defaultRoot;
  return (Array.isArray(configured) ? configured : [configured]).filter(Boolean);
}

function explicitCandidates(options, key) {
  if (!options.targets || !Object.prototype.hasOwnProperty.call(options.targets, key)) return null;
  const values = Array.isArray(options.targets[key]) ? options.targets[key] : [options.targets[key]];
  return values.filter(Boolean);
}

function discoverTargets(key, options = {}, defaultRoot) {
  const spec = TARGETS[key];
  if (!spec) throw new Error(`Unknown RastChin target adapter: ${key}`);

  const explicit = explicitCandidates(options, key);
  const candidates = explicit === null
    ? rootsFromOptions(options, defaultRoot).flatMap((root) => listFallbackCandidates(root, spec))
    : explicit.map((value) => normalizeCandidate(spec, value, 'vscode-api')).filter(Boolean);

  // Deduplicate paths because multi-root profiles can occasionally point at the
  // same extensions directory through a symlink or repeated configuration.
  const seen = new Set();
  return candidates.filter((candidate) => {
    let identity = candidate.extensionPath;
    try { identity = fs.realpathSync.native(candidate.extensionPath); } catch { /* resolved path is sufficient */ }
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function vscodeTargets(vscode) {
  const targets = { claude: [], codex: [] };
  if (!vscode || !vscode.extensions || typeof vscode.extensions.getExtension !== 'function') return null;
  for (const spec of Object.values(TARGETS)) {
    const installed = vscode.extensions.getExtension(spec.extensionId);
    if (!installed || !installed.extensionPath) continue;
    targets[spec.key].push({
      extensionPath: installed.extensionPath,
      version: installed.packageJSON && installed.packageJSON.version,
    });
  }
  return targets;
}

module.exports = {
  TARGETS,
  discoverTargets,
  readPackageJson,
  versionFromDirectory,
  vscodeTargets,
};
