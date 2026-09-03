# Changelog

All notable changes to the RastChin for VS Code extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.14] - 2026-09-01

### Fixed

- Restored the `Re-apply Patches` action in RastChin's Extensions-view context
  menu by matching VS Code's normalized lowercase installed extension ID while
  preserving the existing `OmegaDoITSolutions` Marketplace publisher identity.

## [0.3.13] - 2026-09-01

### Added

- Added a read-only patch-health flow that checks active Codex and Claude Code
  targets on startup, after extension-registry changes, and when the VS Code
  window regains focus.
- Missing or stale compatible patches now offer `Re-apply Now`, `Later`, and
  `View Details`; `Later` snoozes only that exact target problem for 24 hours,
  while a newer agent version is reported immediately.
- Unsupported target layouts now produce a diagnostic-only warning and remain
  fail-closed instead of offering a misleading repair action.

### Changed

- Moved the extension source into the public RastChin pnpm monorepo at
  `apps/vscode-extension` while preserving the Marketplace identity
  `OmegaDoITSolutions.rastchin-vscode`.
- Relicensed RastChin-owned source under Apache-2.0. The complete upstream MIT
  and Vazirmatn OFL terms remain bundled and are documented in
  `THIRD_PARTY_NOTICES.md`.
- Updated development and packaging documentation for Node.js 24 and pnpm.
- Re-apply now performs a second read-only verification after writing before it
  clears the recovery status and notification state.

## [0.3.12] - 2026-08-29

### Changed
- Marketplace metadata and README now describe RastChin's Persian-only language
  scope accurately.

## [0.3.11] - 2026-08-23

### Fixed
- Current Codex Plan-mode `request_user_input` question titles now receive RTL
  direction and Vazirmatn through the card's stable navigation wrapper, even
  though the title is rendered outside the radio group.
- Claude Code `AskUserQuestion` titles and mixed Persian/English option rows now
  render RTL on macOS and other platforms, including moving radio/checkbox
  indicators to the right while leaving English-only choices untouched.
- Card-specific direction and font declarations now resist late host stylesheet
  rules; inline code, commands, paths and URLs retain their protected LTR style.

## [0.3.10] - 2026-08-22

### Fixed
- Installation onboarding is no longer suppressed when an older RastChin build
  already left the agent runtime current or when no agent is installed yet.
- Setup acknowledgement is stored only after the user explicitly chooses
  `Apply RTL Patches` or `Not Now`; a closed/suppressed notification retries on
  the next startup.
- Reinstalling the same VSIX can show onboarding again instead of being hidden
  by preserved VS Code extension state.

## [0.3.9] - 2026-08-19

### Added
- A one-time setup notification offers `Apply RTL Patches` when a compatible
  active agent needs its patch.
- A conditional `RastChin: Apply RTL` status-bar action remains available until
  all compatible active patches are current.
- The existing safe re-apply command is available from RastChin's context menu
  in the Extensions view while remaining available in the Command Palette.

### Changed
- Agent-update notifications now open the same re-apply flow directly.
- Removed the unsupported attempt to style the Extensions Details README;
  RastChin continues to target Markdown Preview and supported agent webviews.

## [0.3.8] - 2026-08-19

### Fixed
- Added support for the current Codex `_MarkdownRoot_*`,
  `data-markdown-animated` and `data-local-conversation-final-assistant`
  response lifecycle hooks.
- Interrupted and already-finalized Persian responses are now scanned even when
  no additional streaming text mutation arrives after the response tree mounts.
- Completed/interrupted lists regain their RTL, Vazirmatn and marker-layout
  hooks after Codex reconciles its own `class`, `dir`, lifecycle attributes and
  late final-render font declarations.

## [0.3.6] - 2026-08-17

### Fixed
- Restores RTL list-item and parent-list font hooks when Codex replaces its
  streaming classes with the completed Markdown renderer's classes.
- Keeps Vazirmatn active on completed Persian list descendants and markers,
  including the short transition while the parent list is being reconciled.
- English-first mixed composer drafts no longer receive the legacy
  `YBYrtlClean` class, which previously overrode `dir="ltr"` with an
  `!important` RTL declaration and scrambled typing after adding Persian text.
- Clears stale LTR/RTL composer classes when the draft direction changes while
  preserving the editor's DOM, selection and caret.

## [0.3.5] - 2026-08-17

### Fixed
- Agent composer direction now follows the draft's first strong character;
  mixed English-first prompts no longer flip RTL merely because they contain
  more Persian later, while prompts beginning with Persian text remain right-aligned.
- Codex contenteditable drafts use paragraph-aware bidi layout without
  replacing editor-owned nodes, preserving typing, paste and caret state.
- Persian list fonts now propagate through arbitrary agent-renderer wrappers,
  while code, commands, paths and explicit LTR fragments remain monospace.

## [0.3.4] - 2026-08-17

### Fixed
- Fixed the Codex font URL regression introduced in `0.3.3`. Codex serves the
  injected stylesheet and Vazirmatn files from the same
  `webview/persian-rtl-clean/` directory, so its `@font-face` URLs must be
  relative sibling paths rather than repeating the directory name.
- Added an installed-layout regression check that resolves every Codex font URL
  relative to the emitted stylesheet and verifies that the target file exists.

## [0.3.3] - 2026-08-17

### Fixed
- Latin-first Persian prose beginning with `Update` is no longer mistaken for
  an SQL statement; code detection now requires actual language/SQL syntax.
- Codex now loads Vazirmatn from the same `persian-rtl-clean` directory where
  the patcher copies the bundled font files.
- RTL Markdown list items, nested list prose and list markers receive explicit
  direction and Vazirmatn rules that override host themes without flipping an
  English-only item inside a mixed list.
- Added regression coverage for the mixed Persian/English acceptance list from
  `BACKLOG.md`.

## [0.3.2] - 2026-08-17

### Fixed
- Agent Markdown lists and nested inline nodes now inherit Vazirmatn through a
  specificity-safe prose rule while code remains monospace.
- Normal Persian prose uses one explicit RTL base direction instead of
  `unicode-bidi: plaintext`, preventing Latin-first lines such as `RastChin ...`
  and `Update ...` from visually reverting to LTR.
- Persian agent and Markdown Preview paragraphs containing an inline URL remain
  RTL; the standalone URL is isolated LTR and rendered in a monospace font.
- Markdown Preview lists, blockquotes and table cells now resist theme overrides,
  while English-only blocks retain their natural direction.

## [0.3.1] - 2026-08-17

### Fixed
- Rich paste into Codex and Claude composers no longer lets the RTL runtime
  replace editor-owned text nodes, preserving the agent's caret, selection and
  contenteditable state.
- Composer mutations are treated as one opaque editor update and coalesced,
  avoiding recursive scans of every pasted HTML node.
- Persian Markdown paragraphs containing inline URLs remain RTL while the URL
  itself stays isolated LTR.
- Vazirmatn and direction rules now win VS Code Markdown-theme specificity and
  propagate through nested emphasis/link content without changing code fonts.
- Markdown `summary`, definition-list and caption content now receives per-block
  RTL detection.

## [0.3.0] - 2026-08-16

### Added
- Active Claude Code and Codex discovery through VS Code's extension registry,
  with filesystem scanning retained only for recovery and standalone tests.
- Version/layout-aware target adapters and a read-only `Inspect Agent Patch Plan`
  command that refuses malformed or unsupported bundles before writing.
- Per-target file transactions, atomic replacements, rollback, target-version
  metadata and backup refresh after in-place agent updates.
- Manual patch confirmation, agent-update detection, and an uninstall restore
  hook.
- Compatibility, discovery source and layout issues in Status output.

### Changed
- Manual patching now touches only the versions VS Code reports as active.
- Disable/Restore scans sibling installed versions so patches left on an older
  agent build are also removed without downgrading newer files.
- Claude Plan Preview can be disabled separately from the main Claude webview.

## [0.2.1] - 2026-06-22

### Fixed
- Reduced Claude Code webview typing latency by removing per-prose-node and
  per-table MutationObservers while preserving streamed text/table reactivity via
  the root observer.
- Narrowed the Claude Code runtime selector scope by dropping the standalone
  `[class*="root_"]` selector that could scan broad non-chat UI wrappers.
- Fixed Latin-first Persian mixed prose in chat lists, such as `stale RTL runtime
  ...` and `language server/file watcher ...`, so list items and parent lists are
  promoted to RTL without flipping code, commands, URLs, or paths.

## [0.2.0] - 2026-06-22

### Changed
- Rebranded from `vscode-rtl` / "Persian RTL for VS Code" to `rastchin-vscode` /
  "RastChin for VS Code": package name, display name, repository, author, icon,
  homepage, and all command/configuration titles. The legacy `persianRtlClean.*`
  command and setting keys are intentionally unchanged for install compatibility.
- Markdown Preview now applies RTL to the body and explicitly marks meaningful
  Latin-first text as LTR (`fa-ltr-clean`), with isolated links.

### Added
- Quiet startup notification: startup stays silent when nothing changed, logs
  without stealing focus, and prompts to reload at most once per session — and
  only when webview content actually changed (asset-only refreshes no longer nag).
- Runtime diagnostics: a bundled runtime fingerprint, per-target runtime state
  (absent / unfingerprinted / stale / current), and workbench corruption
  detection, so a legacy app-level patch is attributed correctly instead of being
  blamed on RastChin.
- Hardened Codex approval-card and Persian text-block RTL injection with
  role-based drift fallbacks.

### Notes
- At the time of the `0.2.0` release, this was a private extension and had not
  been published to a marketplace. This note is historical; current source is
  maintained in the public RastChin monorepo.

The release links below point to the legacy standalone repository that created
versions through `0.3.12`. They are retained as historical provenance; new
source changes and release documentation live in the RastChin monorepo.

[0.3.14]: https://github.com/omega-do-it-solutions/rastchin/releases/tag/vscode-v0.3.14
[0.3.13]: https://github.com/omega-do-it-solutions/rastchin/releases/tag/vscode-v0.3.13
[0.2.1]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.2.1
[0.2.0]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.2.0
[0.3.0]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.0
[0.3.1]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.1
[0.3.2]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.2
[0.3.3]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.3
[0.3.4]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.4
[0.3.5]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.5
[0.3.6]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.6
[0.3.8]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.8
[0.3.9]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.9
[0.3.10]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.10
[0.3.11]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.11
[0.3.12]: https://github.com/omega-do-it-solutions/rastchin-vscode/releases/tag/v0.3.12
