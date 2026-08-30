const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const patcher = require('./patcher');
const { vscodeTargets } = require('./targets/registry');

// Once-per-session (per extension-host lifetime) guard so a startup patch never
// pops more than one reload prompt. A window reload starts a fresh host and
// resets this, which is correct: after a reload the target is already patched,
// so the next startup finds nothing changed and stays silent.
let reloadPromptShownThisSession = false;
const SETUP_PROMPT_INSTALL_KEY = 'rastchin.setupPromptInstallation';

function extensionsRootFromContext(context) {
  if (!context || !context.extensionPath) return undefined;
  if (context.extensionMode === vscode.ExtensionMode.Development) return undefined;
  return path.dirname(context.extensionPath);
}

function getPatchOptions(context) {
  const cfg = vscode.workspace.getConfiguration('persianRtlClean');
  const targets = vscodeTargets(vscode);
  return {
    includeClaude: cfg.get('patchClaudeCode', true),
    includeCodex: cfg.get('patchCodex', true),
    patchClaudePlanPreview: cfg.get('patchClaudePlanPreview', true),
    extensionsRoot: extensionsRootFromContext(context),
    // In a real extension host this contains only the versions VS Code resolved
    // as active. Tests and the standalone CLI omit the API and retain the
    // filesystem fallback for deterministic fixtures.
    ...(targets ? { targets } : {}),
  };
}

function getRestoreOptions(context) {
  const options = getPatchOptions(context);
  // An installed RastChin package sits beside all versions of the agent
  // extensions. Restore every patched version, including an inactive version
  // left behind by an update. In Extension Development mode there is no shared
  // installed root, so retain the exact active targets from the API.
  if (options.extensionsRoot) delete options.targets;
  return options;
}

function flag(value) {
  return value ? 'yes' : 'no';
}

function legacyClaudeSummary(legacy) {
  const hits = [];
  if (legacy.css) hits.push('CSS');
  if (legacy.js) hits.push('JS');
  if (legacy.plan) hits.push('Plan');
  return hits.length ? hits.join('+') : 'none';
}

function sidecarSummary(list) {
  return list && list.length ? list.join(', ') : 'none';
}

// When several builds of a target are installed, VS Code only loads the highest
// (marked item.active). Make the diagnostics say, unambiguously, whether THAT
// version carries our patch — and warn loudly in the easy-to-miss case where an
// older build is patched but the active one is not (e.g. right after an update).
function activeVersionLines(items, label) {
  const active = (items || []).find((item) => item.active);
  if (!active) return [];
  if (active.patched) {
    return [`- ACTIVE ${label} version v${active.version} is patched (RTL will load).`];
  }
  const stalePatched = items.some((item) => !item.active && item.patched);
  return [stalePatched
    ? `- WARNING: ACTIVE ${label} version v${active.version} is NOT patched, but an older installed build is. Run "Re-apply Patches" so the version VS Code actually loads gets RTL.`
    : `- NOTE: ACTIVE ${label} version v${active.version} is not patched yet. Run "Re-apply Patches" (or enable patchOnStartup).`];
}

// One line per target comparing the runtime fingerprint actually injected into
// the webview against the runtime this build would generate. This makes a stale
// installed patch (injected code older than the bundled generator) visible
// without a window reload.
function runtimeLine(item, bundledFp) {
  return `    runtime: injected=${item.runtimeFp || 'none'} bundled=${bundledFp} -> ${(item.runtimeState || 'absent').toUpperCase()}`;
}

function compatibilityLine(item) {
  const compatibility = item.compatibility;
  if (!compatibility) return '    compatibility: unknown';
  return `    compatibility: ${compatibility.compatible ? 'SUPPORTED' : 'UNSUPPORTED'} via ${compatibility.adapter}`;
}

// Loud note when the version VS Code actually loads carries an out-of-date or
// pre-fingerprint runtime — the classic "tests pass but the live UI is still
// broken because the old patch is what's running" case.
function staleActiveRuntimeLines(items, label) {
  const active = (items || []).find((item) => item.active);
  if (!active) return [];
  if (active.runtimeState === 'stale') {
    return [`- WARNING: ACTIVE ${label} v${active.version} runs a STALE RTL runtime (injected ${active.runtimeFp} != bundled). Run "Re-apply Patches", then Reload Window.`];
  }
  if (active.runtimeState === 'unfingerprinted') {
    return [`- NOTE: ACTIVE ${label} v${active.version} runs an older (unfingerprinted) RTL runtime. Run "Re-apply Patches" to refresh it.`];
  }
  return [];
}

function workbenchStatusLines(workbench) {
  const lines = ['VS Code workbench (app):'];
  if (!workbench.found) {
    lines.push('- workbench.html not located (no read-only check possible).');
    lines.push('- This extension never patches the VS Code app itself.');
    return lines;
  }
  lines.push(`- file: ${workbench.path}`);
  lines.push(`- legacy "Persian RTL Chat" workbench marker: ${workbench.legacy ? 'PRESENT (left untouched)' : 'absent'}`);
  lines.push(`- legacy app-level backup file next to workbench.html: ${workbench.legacyBackup ? 'PRESENT' : 'absent'}`);
  if (workbench.checksumMismatch) {
    lines.push('- WARNING: VS Code integrity checksum MISMATCH for workbench.html.');
    lines.push('  This is almost certainly why VS Code shows "Your Code installation appears to be corrupt."');
    lines.push('  Cause: a legacy app-level patch (old "Persian RTL Chat") changed product.json / workbench.html.');
    lines.push('  Fix: reinstall VS Code. RastChin will NOT modify VS Code app files.');
  } else if (workbench.legacyBackup || workbench.legacy) {
    lines.push('- NOTE: legacy app-level modification detected. The VS Code app was patched by an older extension.');
    lines.push('  If VS Code warns it is corrupt, reinstall VS Code. RastChin does not modify app files.');
  }
  lines.push('- This extension never patches the VS Code app itself.');
  return lines;
}

function formatStatus(current) {
  const lines = [];
  lines.push(`RastChin for VS Code status (extension v${current.version})`);
  lines.push(`Bundled RTL runtime fingerprint: ${current.bundledRuntimeFp || 'unknown'}`);
  lines.push('');

  for (const line of workbenchStatusLines(current.workbench)) lines.push(line);
  lines.push('');

  lines.push(`Claude Code (${current.claude.length} target version(s)):`);
  if (!current.claude.length) lines.push('- not found');
  for (const item of current.claude) {
    lines.push(`- ${item.name} [v${item.version}]${item.active ? '  <-- ACTIVE (loaded by VS Code)' : ''}`);
    lines.push(`    discovery: ${item.discovery || 'filesystem'}`);
    lines.push(compatibilityLine(item));
    for (const issue of (item.compatibility && item.compatibility.issues) || []) lines.push(`      issue: ${issue}`);
    lines.push(`    clean rastchin-vscode markers: CSS=${flag(item.clean.css)}, JS=${flag(item.clean.js)}, Plan=${flag(item.clean.plan)}`);
    lines.push(runtimeLine(item, current.bundledRuntimeFp));
    lines.push(`    legacy Persian RTL Chat markers: ${legacyClaudeSummary(item.legacy)}`);
    lines.push(`    injected assets: clean=${flag(item.injectDir)}, legacy=${flag(item.legacyInjectDir)}`);
    lines.push(`    backups: clean=[${sidecarSummary(item.backups)}], legacy=[${sidecarSummary(item.legacyBackups)}], meta=[${sidecarSummary(item.meta)}]`);
  }
  for (const line of activeVersionLines(current.claude, 'Claude Code')) lines.push(line);
  for (const line of staleActiveRuntimeLines(current.claude, 'Claude Code')) lines.push(line);
  lines.push('');

  lines.push(`Codex / ChatGPT (${current.codex.length} target version(s)):`);
  if (!current.codex.length) lines.push('- not found');
  for (const item of current.codex) {
    lines.push(`- ${item.name} [v${item.version}]${item.active ? '  <-- ACTIVE (loaded by VS Code)' : ''}`);
    lines.push(`    discovery: ${item.discovery || 'filesystem'}`);
    lines.push(compatibilityLine(item));
    for (const issue of (item.compatibility && item.compatibility.issues) || []) lines.push(`      issue: ${issue}`);
    lines.push(`    clean rastchin-vscode marker: ${flag(item.clean)}`);
    lines.push(runtimeLine(item, current.bundledRuntimeFp));
    lines.push(`    legacy Persian RTL Chat marker: ${flag(item.legacy)}`);
    lines.push(`    injected assets: clean=${flag(item.injectDir)}, legacy=${flag(item.legacyInjectDir)}`);
    lines.push(`    backups: clean=[${sidecarSummary(item.backups)}], legacy=[${sidecarSummary(item.legacyBackups)}], meta=[${sidecarSummary(item.meta)}]`);
  }
  for (const line of activeVersionLines(current.codex, 'Codex')) lines.push(line);
  for (const line of staleActiveRuntimeLines(current.codex, 'Codex')) lines.push(line);
  return lines.join('\n');
}

function showDetailedResult(channel, title, result) {
  channel.clear();
  channel.appendLine(title);
  channel.appendLine('');
  for (const message of result.messages || []) channel.appendLine(message);
  channel.show(true);
}

// Like showDetailedResult but never reveals the panel — used on startup so the
// log is available in Output without interrupting the user.
function logResult(channel, title, result) {
  channel.appendLine(title);
  channel.appendLine('');
  for (const message of result.messages || []) channel.appendLine(message);
}

function showPatchPlan(channel, plan) {
  showDetailedResult(channel, 'RastChin patch plan (read-only)', plan);
}

async function approvePatchPlan(plan) {
  if (!plan.changed) return false;
  const cfg = vscode.workspace.getConfiguration('persianRtlClean');
  if (!cfg.get('confirmBeforePatching', true)) return true;
  const targetWord = plan.actionableCount === 1 ? 'agent extension' : 'agent extensions';
  const choice = await vscode.window.showWarningMessage(
    `RastChin will modify ${plan.actionableCount} installed ${targetWord}. Versioned backups and recovery metadata will be created first.`,
    {
      modal: true,
      detail: 'Only the active Claude Code and/or Codex webview files listed in the RastChin Output plan will be changed. Agent updates can overwrite these patches.',
    },
    'Apply Patches',
  );
  return choice === 'Apply Patches';
}

function targetsSignature(options) {
  if (!options.targets) return '';
  const fileState = (filePath) => {
    try {
      const stat = fs.statSync(filePath);
      return `${stat.size}:${stat.mtimeMs}`;
    } catch {
      return 'missing';
    }
  };
  return ['claude', 'codex'].flatMap((key) => (
    (options.targets[key] || []).map((item) => {
      const relativeFiles = key === 'claude'
        ? ['webview/index.css', 'webview/index.js', 'extension.js']
        : ['webview/index.html'];
      const bundleState = relativeFiles
        .map((relative) => fileState(path.join(item.extensionPath, relative)))
        .join(',');
      return `${key}:${item.extensionPath}:${item.version || ''}:${bundleState}`;
    })
  )).sort().join('|');
}

async function maybeReload(message) {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

function resultHasWarnings(result) {
  return (result.messages || []).some((message) => /\bWARNING\b|failed|anchor not found/i.test(message));
}

function extensionVersion(context) {
  return String((context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || 'unknown');
}

function extensionInstallSignature(context) {
  let installedAt = 'unknown';
  try {
    installedAt = String(fs.statSync(context.extensionPath).mtimeMs);
  } catch { /* the version + path remain a stable fallback in tests/unusual hosts */ }
  return `${extensionVersion(context)}:${context.extensionPath || 'unknown'}:${installedAt}`;
}

async function activate(context) {
  const channel = vscode.window.createOutputChannel('RastChin for VS Code');
  context.subscriptions.push(channel);

  // A compact, native entry point for users who do not know the Command
  // Palette. It is deliberately visible only while at least one compatible
  // active agent has a missing/stale patch, so it does not permanently consume
  // status-bar space after setup succeeds.
  const patchAction = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  patchAction.name = 'RastChin RTL patches';
  patchAction.text = '$(tools) RastChin: Apply RTL';
  patchAction.tooltip = 'Apply or refresh RTL patches for the active Codex and Claude Code extensions.';
  patchAction.command = 'persianRtlClean.reapply';
  patchAction.hide();
  context.subscriptions.push(patchAction);

  function updatePatchAction(plan) {
    if (plan && plan.changed && plan.actionableCount > 0) patchAction.show();
    else patchAction.hide();
  }

  function refreshPatchAction(options = getPatchOptions(context)) {
    try {
      const plan = patcher.planAll(options);
      updatePatchAction(plan);
      return plan;
    } catch (error) {
      patchAction.hide();
      logResult(channel, 'Patch status refresh failed', { messages: [error.message] });
      return null;
    }
  }

  async function offerInitialPatchAction() {
    const plan = refreshPatchAction();

    // This is installation onboarding, not merely a stale-patch warning. v0.3.9
    // incorrectly returned when an older RastChin build had already installed
    // the same current runtime, so reinstall/update appeared to do nothing.
    // Include the extension directory mtime so reinstalling the same VSIX can
    // offer setup again even though VS Code preserves globalState.
    const installSignature = extensionInstallSignature(context);
    const state = context.globalState;
    if (state && state.get(SETUP_PROMPT_INSTALL_KEY) === installSignature) return;

    let message = 'RastChin for VS Code is installed. Apply or verify RTL patches for Codex and Claude Code.';
    if (plan && plan.changed && plan.actionableCount > 0) {
      const targetWord = plan.actionableCount === 1 ? 'agent extension needs' : 'agent extensions need';
      message = `RastChin for VS Code: ${plan.actionableCount} compatible ${targetWord} RTL setup.`;
    } else if (plan && plan.targets.length > 0 && plan.incompatibleCount === 0) {
      message = 'RastChin for VS Code is installed. Agent RTL patches appear current; you can verify or re-apply them now.';
    }
    const choice = await vscode.window.showInformationMessage(
      message,
      'Apply RTL Patches',
      'Not Now',
    );

    // Record only an explicit user choice. If notifications were suppressed or
    // the window closed before the prompt resolved, retry on the next startup.
    if (state && (choice === 'Apply RTL Patches' || choice === 'Not Now')) {
      await state.update(SETUP_PROMPT_INSTALL_KEY, installSignature);
    }
    if (choice === 'Apply RTL Patches') {
      await vscode.commands.executeCommand('persianRtlClean.reapply');
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('persianRtlClean.status', () => {
      const current = patcher.status(getPatchOptions(context));
      const text = formatStatus(current);
      channel.clear();
      channel.appendLine(text);
      channel.show(true);
      const legacyDetected = current.workbench.legacy
        || current.claude.some((item) => item.legacy.css || item.legacy.js || item.legacy.plan || item.legacyInjectDir)
        || current.codex.some((item) => item.legacy || item.legacyInjectDir);
      const legacyNote = legacyDetected ? ' Legacy Persian RTL Chat markers detected (left untouched).' : '';
      const corruptNote = current.workbench.corruptionLikely
        ? ' Likely legacy app-level VS Code modification detected — see Output for the "corrupt installation" explanation (RastChin does not modify app files).'
        : '';
      vscode.window.showInformationMessage(`RastChin for VS Code: Claude ${current.claude.length}, Codex ${current.codex.length}. Details opened in Output.${legacyNote}${corruptNote}`);
    }),

    vscode.commands.registerCommand('persianRtlClean.preview', () => {
      try {
        const plan = patcher.planAll(getPatchOptions(context));
        showPatchPlan(channel, plan);
        if (!plan.targets.length) {
          vscode.window.showInformationMessage('RastChin for VS Code: no enabled Claude Code or Codex extension was found.');
        } else if (plan.incompatibleCount) {
          vscode.window.showWarningMessage('RastChin for VS Code: one or more agent layouts are unsupported. No unsupported target will be modified.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`RastChin for VS Code: patch inspection failed: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand('persianRtlClean.reapply', async () => {
      try {
        const options = getPatchOptions(context);
        const plan = patcher.planAll(options);
        updatePatchAction(plan);
        showPatchPlan(channel, plan);
        if (!plan.changed) {
          if (plan.incompatibleCount) {
            vscode.window.showWarningMessage('RastChin for VS Code: enabled agent layouts are unsupported. Nothing was changed; see Output.');
          } else if (!plan.targets.length) {
            vscode.window.showInformationMessage('RastChin for VS Code: no enabled Claude Code or Codex extension was found.');
          } else {
            vscode.window.showInformationMessage('RastChin for VS Code: active agent patches are already current.');
          }
          return;
        }
        if (!(await approvePatchPlan(plan))) {
          channel.appendLine('');
          channel.appendLine('Cancelled by user; no files were changed.');
          return;
        }
        const result = patcher.patchAll(options);
        showDetailedResult(channel, 'Re-apply patches', result);
        if (resultHasWarnings(result)) {
          vscode.window.showWarningMessage('RastChin for VS Code: some targets could not be patched cleanly. See Output for details.');
          refreshPatchAction(options);
        } else if (result.changed) {
          patchAction.hide();
        }
        if (result.changed) {
          await maybeReload('RastChin for VS Code: patches were applied. Reload the window to load patched webviews.');
        } else {
          vscode.window.showInformationMessage('RastChin for VS Code: no patch changes were needed.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`RastChin for VS Code: re-apply failed: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand('persianRtlClean.disable', async () => {
      try {
        const options = getRestoreOptions(context);
        const result = patcher.restoreAll(options);
        showDetailedResult(channel, 'Disable / restore patches', result);
        if (resultHasWarnings(result)) {
          vscode.window.showWarningMessage('RastChin for VS Code: restore finished with warnings (a target may have changed or be locked). See Output for details.');
        }
        if (result.changed) {
          await maybeReload('RastChin for VS Code: patches were restored. Reload the window to unload patched webviews.');
        } else {
          vscode.window.showInformationMessage('RastChin for VS Code: no clean patches were present.');
        }
        refreshPatchAction(getPatchOptions(context));
      } catch (error) {
        vscode.window.showErrorMessage(`RastChin for VS Code: restore failed: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand('persianRtlClean.cleanLegacy', async () => {
      const choice = await vscode.window.showWarningMessage(
        'This removes legacy Persian RTL Chat markers from Claude Code and Codex extension files only. It will not touch the VS Code app. Continue?',
        { modal: true },
        'Clean Legacy Patches'
      );
      if (choice !== 'Clean Legacy Patches') return;
      try {
        const options = getRestoreOptions(context);
        const result = patcher.cleanLegacy(options);
        showDetailedResult(channel, 'Clean legacy extension patches', result);
        if (result.changed) {
          await maybeReload('RastChin for VS Code: legacy Claude/Codex patches were removed. Reload the window to refresh webviews.');
        } else {
          vscode.window.showInformationMessage('RastChin for VS Code: no legacy Claude/Codex patch markers were found.');
        }
        refreshPatchAction(getPatchOptions(context));
      } catch (error) {
        vscode.window.showErrorMessage(`RastChin for VS Code: clean legacy failed: ${error.message}`);
      }
    })
  );

  const cfg = vscode.workspace.getConfiguration('persianRtlClean');
  const startupTimer = setTimeout(async () => {
    if (!cfg.get('patchOnStartup', false)) {
      await offerInitialPatchAction();
      return;
    }
    try {
      const result = patcher.patchAll(getPatchOptions(context));
      // Nothing was written: keep the status accurate and stay silent.
      if (!result.changed) {
        if (resultHasWarnings(result)) logResult(channel, 'Startup patch preflight warnings', result);
        refreshPatchAction();
        return;
      }
      // Log what happened to the Output channel WITHOUT stealing focus or
      // popping the panel — startup must be quiet.
      logResult(channel, 'Startup patch apply', result);
      if (resultHasWarnings(result)) refreshPatchAction();
      else patchAction.hide();
      // Only a content change (a (re)written webview/extension block) needs a
      // reload, and we prompt at most once per session. A routine font/asset
      // refresh changes nothing visible until reload-worthy content does, so it
      // never prompts.
      if (result.contentChanged && !reloadPromptShownThisSession) {
        reloadPromptShownThisSession = true;
        await maybeReload('RastChin for VS Code: patched webviews changed. Reload the window to load them.');
      }
    } catch (error) {
      patchAction.hide();
      vscode.window.showErrorMessage(`RastChin for VS Code: startup patch failed: ${error.message}`);
    }
  }, 1000);
  context.subscriptions.push({ dispose: () => clearTimeout(startupTimer) });

  if (cfg.get('experimentalWorkbenchPatch', false)) {
    vscode.window.showWarningMessage('RastChin for VS Code: experimentalWorkbenchPatch is reserved. This build does not patch workbench.html or product.json.');
  }

  // Agent updates replace their webview bundles and therefore remove our patch.
  // Listen to the official extension registry, but never rewrite on the user's
  // behalf: offer the normal review-and-confirm command instead.
  if (vscode.extensions && typeof vscode.extensions.onDidChange === 'function') {
    let previousSignature = targetsSignature(getPatchOptions(context));
    let updateTimer;
    const listener = vscode.extensions.onDidChange(() => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(async () => {
        const options = getPatchOptions(context);
        const nextSignature = targetsSignature(options);
        if (!nextSignature || nextSignature === previousSignature) return;
        previousSignature = nextSignature;
        const plan = patcher.planAll(options);
        updatePatchAction(plan);
        if (!plan.changed) return;
        logResult(channel, 'Agent extension update detected — patch review required', plan);
        const choice = await vscode.window.showInformationMessage(
          'RastChin for VS Code: Claude Code or Codex changed and its RTL patch needs to be refreshed.',
          'Apply RTL Patches',
        );
        if (choice === 'Apply RTL Patches') {
          await vscode.commands.executeCommand('persianRtlClean.reapply');
        }
      }, 1500);
    });
    context.subscriptions.push(listener, { dispose: () => { if (updateTimer) clearTimeout(updateTimer); } });
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
