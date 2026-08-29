// Primary Persian UI font (bundled). Vazirmatn is SIL OFL 1.1 licensed.
const FONT_FAMILY = 'Vazirmatn';
const FONT_STACK = 'Vazirmatn, Tahoma, Arial, sans-serif';
const CLEAN_CLASS = 'YBYrtlClean';
const FORCE_RTL_CLASS = 'YBY-force-rtl-clean';
const FORCE_LTR_CLASS = 'YBY-force-ltr-clean';
const INJECT_DIR = 'persian-rtl-clean';
const BACKUP_SUFFIX = '.persian-rtl-clean-backup';
const META_SUFFIX = '.persian-rtl-clean-meta.json';
// woff2 files bundled in media/fonts and copied next to patched webviews.
const FONT_FILES = ['Vazirmatn-Regular.woff2', 'Vazirmatn-Bold.woff2'];
// @font-face descriptors: file + weight, both mapped to FONT_FAMILY.
const FONT_FACES = [
  { file: 'Vazirmatn-Regular.woff2', weight: 'normal' },
  { file: 'Vazirmatn-Bold.woff2', weight: 'bold' },
];

// Extension-prefix used to locate target extensions in the VS Code extensions root.
const CLAUDE_PREFIX = 'anthropic.claude-code-';
const CODEX_PREFIX = 'openai.chatgpt-';

// Legacy "Persian RTL Chat" (amirrezanasiri.persian-rtl-chat) artefacts. We only
// detect these for status/diagnostics and the explicit Clean Legacy command. We
// never remove them silently.
const LEGACY_INJECT_DIR = 'persian-rtl';
const LEGACY_BACKUP_SUFFIXES = ['.persian-rtl-backup', '.persian-rtl-plan-backup'];
// Marker the legacy extension writes into the VS Code app workbench.html. Detected
// read-only; this extension never patches the VS Code app itself.
const LEGACY_WORKBENCH_MARKER = '<!-- Persian RTL Chat -->';

const MARKERS = {
  claudeCssStart: '/* Persian RTL Chat Clean - Claude Code CSS Begin */',
  claudeCssEnd: '/* Persian RTL Chat Clean - Claude Code CSS End */',
  claudeJsStart: '/* Persian RTL Chat Clean - Claude Code JS Begin */',
  claudeJsEnd: '/* Persian RTL Chat Clean - Claude Code JS End */',
  claudePlanCssStart: '/* Persian RTL Chat Clean - Claude Plan Preview CSS Begin */',
  claudePlanCssEnd: '/* Persian RTL Chat Clean - Claude Plan Preview CSS End */',
  claudePlanJsStart: '/* Persian RTL Chat Clean - Claude Plan Preview JS Begin */',
  claudePlanJsEnd: '/* Persian RTL Chat Clean - Claude Plan Preview JS End */',
  codexHtmlStart: '<!-- Persian RTL Chat Clean - Codex Begin -->',
  codexHtmlEnd: '<!-- Persian RTL Chat Clean - Codex End -->',
  codexCssStart: '/* Persian RTL Chat Clean - Codex CSS Begin */',
  codexCssEnd: '/* Persian RTL Chat Clean - Codex CSS End */',
  codexJsStart: '/* Persian RTL Chat Clean - Codex JS Begin */',
  codexJsEnd: '/* Persian RTL Chat Clean - Codex JS End */',
};

const LEGACY_MARKERS = {
  claudeCssStart: '/* Persian RTL Chat - Claude Code */',
  claudeCssEnd: '/* End Persian RTL Chat - Claude Code */',
  claudeJsStart: '/* Persian RTL Chat - Claude Code JS */',
  claudeJsEnd: '/* End Persian RTL Chat - Claude Code JS */',
  claudePlanCssStart: '/* Persian RTL Plan Preview CSS */',
  claudePlanCssEnd: '/* End Persian RTL Plan Preview CSS */',
  claudePlanJsStart: '/* Persian RTL Plan Preview JS */',
  claudePlanJsEnd: '/* End Persian RTL Plan Preview JS */',
  codexHtmlStart: '<!-- Persian RTL Chat - Codex Begin -->',
  codexHtmlEnd: '<!-- Persian RTL Chat - Codex End -->',
  yechielCssStart: '/* RTL Text Support for Claude Code VS Code / Cursor / Antigravity Extension - Added by script */',
  yechielCssEnd: '/* End RTL Text Support for Claude Code VS Code / Cursor / Antigravity Extension */',
  yechielJsStart: '/* RTL Toggle Button - Added by script */',
  yechielJsEnd: '/* End RTL Toggle Button */',
};

module.exports = {
  BACKUP_SUFFIX,
  CLAUDE_PREFIX,
  CLEAN_CLASS,
  CODEX_PREFIX,
  FONT_FACES,
  FONT_FAMILY,
  FONT_FILES,
  FONT_STACK,
  FORCE_LTR_CLASS,
  FORCE_RTL_CLASS,
  INJECT_DIR,
  LEGACY_BACKUP_SUFFIXES,
  LEGACY_INJECT_DIR,
  LEGACY_MARKERS,
  LEGACY_WORKBENCH_MARKER,
  MARKERS,
  META_SUFFIX,
};
