const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// =============================================
// Workbench patching (VS Code chat, Copilot, etc.)
// =============================================
const SCRIPT_TAG = '\t<!-- Persian RTL Chat -->\n\t<script src="./persian-rtl.js"></script>';
const MARKER = '<!-- Persian RTL Chat -->';

// =============================================
// Claude Code webview patching
// =============================================
const CC_CSS_MARKER = '/* Persian RTL Chat - Claude Code */';
const CC_CSS_END_MARKER = '/* End Persian RTL Chat - Claude Code */';
const CC_JS_MARKER = '/* Persian RTL Chat - Claude Code JS */';
const CC_JS_END_MARKER = '/* End Persian RTL Chat - Claude Code JS */';

// Plan-mode preview webview (separate webview inside Claude Code's extension.js)
const CC_PLAN_CSS_MARKER = '/* Persian RTL Plan Preview CSS */';
const CC_PLAN_CSS_END_MARKER = '/* End Persian RTL Plan Preview CSS */';
const CC_PLAN_JS_MARKER = '/* Persian RTL Plan Preview JS */';
const CC_PLAN_JS_END_MARKER = '/* End Persian RTL Plan Preview JS */';
const CC_PLAN_CSP_OLD = `content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{{NONCE}}'; img-src data:;"`;
const CC_PLAN_CSP_NEW = `content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{{NONCE}}'; img-src data:; font-src data:;"`;

// Codex (ChatGPT for VS Code) webview patching
const CODEX_HTML_MARKER = '<!-- Persian RTL Chat - Codex Begin -->';
const CODEX_HTML_END_MARKER = '<!-- Persian RTL Chat - Codex End -->';
const CODEX_INJECT_DIR = 'persian-rtl';

/**
 * v8.0.2 — Single source of truth for arrow-mirroring detection + wrapping.
 *
 * Returns a JS source-string that defines, in the host webview's scope:
 *   - PERSIAN regex, ARROWS list, ARROW_RE, ARROW_CHARS_RE
 *   - CODE_SEL, UNIT_SEL, MAX_ATTEMPTS, FLIP_ATTEMPTS WeakMap
 *   - WRAP_STATS (per-page counters; window-exposed if exposeStats:true)
 *   - Helpers: _isProtected, _stripArrows, _closestUnit, _hasPersianProse,
 *     _collectParts, _hasContent, _nearestNeighbor, _shouldFlip
 *   - wrapArrows(root): the public entry point
 *
 * Decision rule: an arrow flips iff its closest block-unit (p/li/td/th/...)
 * contains Persian prose outside <code>, AND its two nearest semantic
 * neighbors are NOT both <code>. This means:
 *   - "cmd" → "out"   (both neighbors code) → no flip   [code-flow]
 *   - "مرحله ۱ → ۲"  (both neighbors prose) → flip       [Persian prose]
 *   - "دستور `git` → بعدش..." (one code, one prose, unit has Persian prose) → flip
 *
 * Tables NEVER reverse column order — that's handled by per-cell `dir`
 * in the caller's applyDir/applyRtl, not here.
 *
 * Options:
 *   - maxAttempts:   per-parent re-wrap budget (default 10) before bailing
 *   - exposeStats:   if true, WRAP_STATS lives on window (Claude Code)
 *   - inlineCodeSel: extra CSS selector to treat as <code>-equivalent
 *                    (Codex needs this for its inline-markdown chips)
 */
function buildArrowMirrorJS(options) {
    options = options || {};
    var maxAttempts = options.maxAttempts || 10;
    var exposeStats = options.exposeStats === true;
    var inlineCodeSel = options.inlineCodeSel || '';
    var codeSel = inlineCodeSel
        ? "'pre, code, kbd, samp, textarea, input, " + inlineCodeSel + "'"
        : "'pre, code, kbd, samp, textarea, input'";
    var statsDecl = exposeStats
        ? "var WRAP_STATS = window.__persianRtlArrowStats = window.__persianRtlArrowStats || { calls: 0, wrapped: 0, skipped: 0 };"
        : "var WRAP_STATS = { calls: 0, wrapped: 0, skipped: 0 };";
    return [
        "var PERSIAN = /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;",
        "var ARROWS = ['\\u2192','\\u2190','\\u27F6','\\u27F5','\\u21D2','\\u21D0','\\u279C','\\u2794','\\u27A4','\\u279E'];",
        "var ARROW_RE = new RegExp('(' + ARROWS.join('|') + ')', 'g');",
        "var ARROW_CHARS_RE = new RegExp('[' + ARROWS.join('') + ']', 'g');",
        "var CODE_SEL = " + codeSel + ";",
        "var UNIT_SEL = 'p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6';",
        "var MAX_ATTEMPTS = " + maxAttempts + ";",
        "var FLIP_ATTEMPTS = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;",
        "setInterval(function() { if (FLIP_ATTEMPTS) FLIP_ATTEMPTS = new WeakMap(); }, 30000);",
        statsDecl,
        "function _isProtected(el) { return !!(el && el.closest && el.closest(CODE_SEL)); }",
        "function _stripArrows(t) { return (t || '').replace(ARROW_CHARS_RE, ''); }",
        "function _closestUnit(node, root) { var p = node && node.parentElement; return (p && p.closest && p.closest(UNIT_SEL)) || root; }",
        "function _hasPersianProse(unit) {",
        "    if (!unit) return false;",
        "    var wk = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT, { acceptNode: function(n) {",
        "        var p = n.parentElement;",
        "        if (!p || _isProtected(p)) return NodeFilter.FILTER_REJECT;",
        "        if (p.classList && p.classList.contains('bidi-arrow-mirror')) return NodeFilter.FILTER_REJECT;",
        "        return NodeFilter.FILTER_ACCEPT;",
        "    }});",
        "    var n; while ((n = wk.nextNode())) { if (PERSIAN.test(_stripArrows(n.nodeValue))) return true; }",
        "    return false;",
        "}",
        "function _collectParts(unit) {",
        "    var parts = [];",
        "    function walk(node) {",
        "        if (!node) return;",
        "        if (node.nodeType === 1) {",
        "            if (node.classList && node.classList.contains('bidi-arrow-mirror')) return;",
        "            if (node.matches && node.matches(CODE_SEL)) {",
        "                if (/\\S/.test(node.textContent || '')) parts.push({ kind: 'code', node: node, text: node.textContent || '' });",
        "                return;",
        "            }",
        "            for (var c = node.firstChild; c; c = c.nextSibling) walk(c);",
        "        } else if (node.nodeType === 3) {",
        "            parts.push({ kind: 'text', node: node, text: node.nodeValue || '' });",
        "        }",
        "    }",
        "    walk(unit);",
        "    return parts;",
        "}",
        "function _hasContent(text) { return /\\S/.test(_stripArrows(text)); }",
        "function _nearestNeighbor(parts, pi, offset, dir) {",
        "    var part = parts[pi]; if (!part) return null;",
        "    if (dir < 0) {",
        "        if (_hasContent(part.text.slice(0, offset))) return { kind: 'prose' };",
        "        for (var i = pi - 1; i >= 0; i--) {",
        "            if (parts[i].kind === 'code') return { kind: 'code' };",
        "            if (_hasContent(parts[i].text)) return { kind: 'prose' };",
        "        }",
        "    } else {",
        "        if (_hasContent(part.text.slice(offset + 1))) return { kind: 'prose' };",
        "        for (var j = pi + 1; j < parts.length; j++) {",
        "            if (parts[j].kind === 'code') return { kind: 'code' };",
        "            if (_hasContent(parts[j].text)) return { kind: 'prose' };",
        "        }",
        "    }",
        "    return null;",
        "}",
        "function _shouldFlip(node, offset, root) {",
        "    var unit = _closestUnit(node, root);",
        "    if (!_hasPersianProse(unit)) return false;",
        "    var parts = _collectParts(unit);",
        "    var pi = -1; for (var k = 0; k < parts.length; k++) { if (parts[k].node === node) { pi = k; break; } }",
        "    if (pi === -1) return false;",
        "    var left = _nearestNeighbor(parts, pi, offset, -1);",
        "    var right = _nearestNeighbor(parts, pi, offset, 1);",
        "    return !(left && right && left.kind === 'code' && right.kind === 'code');",
        "}",
        "function wrapArrows(root) {",
        "    if (!root || !root.querySelectorAll) return;",
        "    WRAP_STATS.calls++;",
        "    try {",
        "        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function(node) {",
        "            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;",
        "            ARROW_RE.lastIndex = 0;",
        "            if (!ARROW_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;",
        "            ARROW_RE.lastIndex = 0;",
        "            var p = node.parentElement;",
        "            if (!p) return NodeFilter.FILTER_REJECT;",
        "            if (p.classList && p.classList.contains('bidi-arrow-mirror')) return NodeFilter.FILTER_REJECT;",
        "            if (_isProtected(p)) return NodeFilter.FILTER_REJECT;",
        "            if (FLIP_ATTEMPTS && (FLIP_ATTEMPTS.get(p) || 0) >= MAX_ATTEMPTS) { WRAP_STATS.skipped++; return NodeFilter.FILTER_REJECT; }",
        "            return NodeFilter.FILTER_ACCEPT;",
        "        }});",
        "        var todo = [], n;",
        "        while ((n = walker.nextNode())) todo.push(n);",
        "        for (var i = 0; i < todo.length; i++) {",
        "            var node = todo[i], text = node.nodeValue, parent = node.parentElement;",
        "            var frag = document.createDocumentFragment();",
        "            var changed = false, last = 0, m;",
        "            ARROW_RE.lastIndex = 0;",
        "            while ((m = ARROW_RE.exec(text))) {",
        "                if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));",
        "                if (_shouldFlip(node, m.index, root)) {",
        "                    var span = document.createElement('span');",
        "                    span.className = 'bidi-arrow-mirror';",
        "                    span.textContent = m[1];",
        "                    frag.appendChild(span);",
        "                    WRAP_STATS.wrapped++;",
        "                    changed = true;",
        "                } else {",
        "                    frag.appendChild(document.createTextNode(m[1]));",
        "                }",
        "                last = m.index + m[1].length;",
        "            }",
        "            if (!changed) continue;",
        "            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));",
        "            if (FLIP_ATTEMPTS && parent) FLIP_ATTEMPTS.set(parent, (FLIP_ATTEMPTS.get(parent) || 0) + 1);",
        "            if (node.parentNode) node.parentNode.replaceChild(frag, node);",
        "        }",
        "    } catch (e) { /* never break the host over decoration */ }",
        "}",
    ].join('\n');
}

/**
 * Build the RTL injection JS with embedded fonts (base64 data URIs).
 * Used for VS Code workbench patching.
 */
function buildPersianRtlJS(extensionPath) {
    const fontsDir = path.join(extensionPath, 'fonts');
    const regularB64 = fs.readFileSync(path.join(fontsDir, 'IRANYekanWebRegular.woff2')).toString('base64');
    const boldB64 = fs.readFileSync(path.join(fontsDir, 'IRANYekanWebBold.woff2')).toString('base64');

    return `(() => {
  // v7.2.32 — outer try/catch defensively so any future bug here never
  // crashes VS Code's workbench (which renders Copilot Chat, VS Code's
  // built-in Chat, and any extension that uses .rendered-markdown).
  try {
  const apply = () => {
    const ATTR = 'data-persian-rtl';
    if (document.querySelector('[' + ATTR + ']')) return;
    const style = document.createElement('style');
    style.setAttribute(ATTR, 'true');
    style.textContent = \`
      @font-face { font-family: 'IRANYekan'; font-style: normal; font-weight: normal; src: url('data:font/woff2;base64,${regularB64}') format('woff2'); }
      @font-face { font-family: 'IRANYekan'; font-style: normal; font-weight: bold; src: url('data:font/woff2;base64,${boldB64}') format('woff2'); }
      .rendered-markdown pre { direction: ltr !important; text-align: left !important; unicode-bidi: bidi-override !important; }
      .rendered-markdown pre code { direction: ltr !important; text-align: left !important; unicode-bidi: bidi-override !important; }
      .rendered-markdown [dir="rtl"] ul, .rendered-markdown [dir="rtl"] ol { padding-right: 1.5em; padding-left: 0; list-style-position: outside !important; }
      .rendered-markdown [dir="ltr"] ul, .rendered-markdown [dir="ltr"] ol { padding-left: 1.5em; padding-right: 0; list-style-position: outside !important; }
      /* v8.0.2 — Tables never reverse column order; per-cell direction is set by applyDir(). */
      .rendered-markdown table { direction: ltr; }
      .rendered-markdown th[dir="rtl"], .rendered-markdown td[dir="rtl"] { direction: rtl; text-align: right; }
      .rendered-markdown th[dir="ltr"], .rendered-markdown td[dir="ltr"] { direction: ltr; text-align: left; }
      /* v7.2.32 — arrow flip in RTL paragraphs (Copilot Chat, VS Code Chat, any .rendered-markdown surface) */
      .rendered-markdown [dir="rtl"] .bidi-arrow-mirror {
        display: inline-block;
        transform: scaleX(-1);
        unicode-bidi: isolate;
      }
    \`;
    document.head.appendChild(style);
    const isPersian = t => /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/.test(t);
    // v8.0.2 — Arrow wrapper + classifier (single source of truth — see
    // buildArrowMirrorJS in src/extension.js). Decides per-arrow whether
    // to mirror based on the closest block-unit's content + neighbors.
    ${buildArrowMirrorJS({ maxAttempts: 10 })}
    const applyDir = () => {
      document.querySelectorAll('.rendered-markdown p, .rendered-markdown li, .rendered-markdown h1, .rendered-markdown h2, .rendered-markdown h3, .rendered-markdown td, .rendered-markdown th').forEach(el => {
        if (el.closest('pre')) return;
        const persian = isPersian(el.textContent);
        el.setAttribute('dir', persian ? 'rtl' : 'ltr');
        el.style.fontFamily = persian ? "'IRANYekan', sans-serif" : '';
        if (persian) wrapArrows(el);
      });
      document.querySelectorAll('.rendered-markdown ul, .rendered-markdown ol').forEach(list => {
        if (list.closest('pre')) return;
        list.setAttribute('dir', [...list.querySelectorAll('li')].some(li => isPersian(li.textContent)) ? 'rtl' : 'ltr');
      });
    };
    applyDir();
    // Throttle with requestAnimationFrame — VS Code workbench DOM churns
    // constantly (hover tooltips, editor redraw, ...). Running applyDir on
    // every single mutation would burn CPU; batching per frame coalesces
    // bursts into at most one full scan per paint.
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; applyDir(); });
    };
    if (window.__persianRtlObserver) window.__persianRtlObserver.disconnect();
    window.__persianRtlObserver = new MutationObserver(schedule);
    window.__persianRtlObserver.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'complete') { setTimeout(apply, 1500); }
  else { window.addEventListener('load', () => setTimeout(apply, 1500)); }
  } catch (e) { try { console.error('[persian-rtl workbench]', e); } catch(_){} }
})();
`;
}

/**
 * Build the CSS to inject into Claude Code's webview/index.css
 */
function buildClaudeCodeCSS() {
    return `
${CC_CSS_MARKER}

@font-face {
    font-family: 'IRANYekan';
    font-style: normal;
    font-weight: normal;
    src: url('./IRANYekanWebRegular.woff2') format('woff2');
}
@font-face {
    font-family: 'IRANYekan';
    font-style: normal;
    font-weight: bold;
    src: url('./IRANYekanWebBold.woff2') format('woff2');
}

/* Auto-detected Persian/RTL bubbles get .YBYrtl class via JS */

.YBYrtl[class*="userMessage_"],
.YBYrtl[class*="userMessageContainer_"] {
    direction: rtl;
    unicode-bidi: isolate;
    text-align: right !important;
    align-items: flex-end !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    font-family: 'IRANYekan', sans-serif;
}

.YBYrtl [class*="content_"][class*="xGDvVg"],
.YBYrtl [class*="content_"] > span {
    unicode-bidi: isolate;
    font-family: 'IRANYekan', sans-serif;
}

.YBYrtl [class*="root_"]:not([class*="thinkingContent_"] [class*="root_"]) {
    direction: rtl;
    unicode-bidi: isolate;
    font-family: 'IRANYekan', sans-serif;
}

.YBYrtl [class*="root_"]:not([class*="thinkingContent_"] [class*="root_"]) > :is(p, ul, ol, h1, h2, h3, h4, blockquote),
.YBYrtl [class*="root_"]:not([class*="thinkingContent_"] [class*="root_"]) > :is(ul, ol) li {
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
}

.YBYrtl [class*="root_"]:not([class*="thinkingContent_"] [class*="root_"]) a {
    unicode-bidi: isolate;
}

.YBYrtl [class*="questionBlock_"],
.YBYrtl [class*="questionHeader_"],
.YBYrtl [class*="questionText"],
.YBYrtl [class*="answerText_"],
.YBYrtl [class*="optionText_"],
.YBYrtl [class*="optionContent_"],
.YBYrtl [class*="optionLabel_"],
.YBYrtl [class*="optionDescription_"],
.YBYrtl [class*="optionsContainer_"],
.YBYrtl [class*="option_"]:not([class*="optionCheckbox_"]) {
    direction: rtl;
    unicode-bidi: isolate;
    font-family: 'IRANYekan', sans-serif;
    text-align: right;
}

/* Permission-request dialog (Plan Mode question cards) */
.YBYrtl[class*="permissionRequestContainer_"],
.YBYrtl[class*="permissionsContainer_"],
.YBYrtl [class*="permissionRequestContainer_"],
.YBYrtl [class*="permissionRequestContent_"],
.YBYrtl [class*="permissionsContainer_"],
.YBYrtl [class*="questionsContainer_"],
.YBYrtl [class*="navigationBar_"],
.YBYrtl [class*="navTab_"]:not([class*="navTabActive_"] ~ *),
.YBYrtl [class*="navTabLabel_"],
.YBYrtl [class*="buttonContainer_"] {
    direction: rtl;
    unicode-bidi: isolate;
    font-family: 'IRANYekan', sans-serif;
}

/* Keep the radio circle / checkbox icon anchored next to its label */
.YBYrtl [class*="optionCheckbox_"],
.YBYrtl [class*="radio_"] {
    direction: ltr;
}

/* v8.0.2 — Tables never reverse column order; per-cell dir from JS. */
.YBYrtl table {
    direction: ltr !important;
}
.YBYrtl th[dir="rtl"],
.YBYrtl td[dir="rtl"] {
    direction: rtl;
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
}
.YBYrtl th[dir="ltr"],
.YBYrtl td[dir="ltr"] {
    direction: ltr;
    text-align: left;
}

/* Keyboard hints (e.g. "Esc to cancel") contain English tokens — let
   unicode-bidi handle mixed text inside an RTL container */
.YBYrtl [class*="keyboardHints_"] {
    direction: rtl;
    unicode-bidi: isolate;
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
}

/* Session titles — the active thread title button in the header
   (titleTextInner_...) and each item in the session history list
   (sessionName_...). */
.YBYrtl[class*="titleTextInner_"],
.YBYrtl[class*="sessionName_"] {
    direction: rtl;
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

#root [class*="messageInputContainer_"] > * {
    unicode-bidi: isolate;
    text-align: start;
}

/* Message composer (contenteditable textbox) AND its mention-mirror
   overlay — the composer itself is rendered transparent; what the user
   visually sees is the aria-hidden mirror sibling that duplicates the
   same text. Both must be flipped to RTL + IRANYekan. Dynamic: the
   class is toggled in JS on every keystroke. The #root prefix + the
   !important flag guarantee we win the cascade. */
#root [class*="messageInput_"].YBYrtl,
#root [class*="mentionMirror_"].YBYrtl {
    direction: rtl !important;
    text-align: right !important;
    font-family: 'IRANYekan', sans-serif !important;
    unicode-bidi: isolate !important;
}

/* LTR overrides — code blocks, tools, thinking */

.YBYrtl pre,
.YBYrtl code,
.YBYrtl [class*="codeBlockWrapper_"] {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    text-align: left !important;
}

.YBYrtl [class*="toolUse_"],
.YBYrtl [class*="toolSummary_"],
.YBYrtl [class*="toolBody_"],
.YBYrtl [class*="toolBodyGrid_"],
.YBYrtl [class*="toolBodyRow_"],
.YBYrtl [class*="toolBodyRowContent_"],
.YBYrtl [class*="toolBodyRowLabel_"],
.YBYrtl [class*="toolResult_"],
.YBYrtl [class*="toolNameText_"],
.YBYrtl [class*="toolReference_"] {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    text-align: left !important;
}

.YBYrtl [class*="thinking_"],
.YBYrtl [class*="thinkingContent_"],
.YBYrtl [class*="thinkingContainer_"],
.YBYrtl [class*="thinkingHeader_"],
.YBYrtl [class*="spinnerRow_"],
.YBYrtl [class*="timelineMessage_"]:has([class*="thinking_"]) {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    text-align: left !important;
}

.YBYrtl [class*="thinkingContent_"] [class*="root_"] :is(ul, ol, li) {
    direction: ltr !important;
    text-align: left !important;
}

/* Manual direction override for the composer only — Ctrl + Right-Shift
   toggles force-rtl, Ctrl + Left-Shift toggles force-ltr on the focused
   messageInput_ (and its mention-mirror sibling). The force-rtl path
   reuses the existing YBYrtl rules through watchBubble; force-ltr needs
   an explicit LTR rule because the default bidi would still auto-detect. */
#root [class*="messageInput_"].YBY-force-ltr,
#root [class*="mentionMirror_"].YBY-force-ltr {
    direction: ltr !important;
    text-align: left !important;
    font-family: var(--vscode-font-family, inherit) !important;
    unicode-bidi: isolate !important;
}

.YBYrtl [class*="slashCommandMessage_"],
.YBYrtl [class*="slashCommandResultMessage_"],
.YBYrtl [class*="header_"][class*="aqhumA"],
.YBYrtl [class*="sessionsButtonText_"],
.YBYrtl [class*="dotSuccess_"],
.YBYrtl [class*="dotFailure_"],
.YBYrtl [class*="dotProgress_"],
.YBYrtl [class*="dotWarning_"],
.YBYrtl [class*="progressContent_"],
.YBYrtl [class*="inputContainer_"][class*="cKsPxg"],
.YBYrtl [class*="inputWrapper_"],
.YBYrtl [class*="iconButton_"],
.YBYrtl [class*="copyButton_"],
.YBYrtl [class*="actionButton_"],
.YBYrtl [class*="selectionAttachment_"],
.YBYrtl [class*="attachmentInfo_"],
.YBYrtl [class*="attachmentText_"],
.YBYrtl [class*="errorMessage_"],
.YBYrtl [class*="secondaryLine_"],
.YBYrtl [class*="todoListContainer_"],
.YBYrtl [class*="todoList_"],
.YBYrtl [class*="todoItem_"],
.YBYrtl [class*="auth_"],
.YBYrtl [class*="authUrl"] {
    direction: ltr !important;
}

/* v7.2.30 — mirror directional arrows inside Persian (YBYrtl) text in
 * the regular Claude Code chat panel. The wrapping span is added by the
 * YBYrtl JS observer (buildClaudeCodeJS). Logical Unicode char preserved
 * (copy-paste, screen reader); only the rendered glyph mirrors. Excludes
 * code blocks and inputs (handled by the JS walker). */
.YBYrtl .bidi-arrow-mirror {
    display: inline-block;
    transform: scaleX(-1);
    unicode-bidi: isolate;
}

${CC_CSS_END_MARKER}
`;
}

/**
 * Build the JS to inject into Claude Code's webview/index.js.
 * Auto-detects Persian bubbles and applies RTL + IRANYekan font.
 */
function buildClaudeCodeJS() {
    return `
${CC_JS_MARKER}
(function() {
    var RTL = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    var CLS = 'YBYrtl';
    // v7.2.30 — outer try/catch defensively wraps ALL code so any future
    // bug here never crashes the Claude Code chat surface.
    try {
    // v8.0.2 — Arrow wrapper + classifier. Single source of truth lives in
    // buildArrowMirrorJS in src/extension.js. WRAP_TIMERS + debounced
    // entry point stay site-local (only Claude Code chat needs the 300ms
    // settle window for React streaming).
    var WRAP_TIMERS = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    var WRAP_DEBOUNCE_MS = 300;
    ${buildArrowMirrorJS({ maxAttempts: 10, exposeStats: true })}
    function wrapArrowsDebounced(el) {
        if (!WRAP_TIMERS) return wrapArrows(el);
        var t = WRAP_TIMERS.get(el);
        if (t) clearTimeout(t);
        t = setTimeout(function () { WRAP_TIMERS.delete(el); wrapArrows(el); }, WRAP_DEBOUNCE_MS);
        WRAP_TIMERS.set(el, t);
    }
    // Static surfaces — once Persian is detected, YBYrtl sticks and the observer keeps reasserting it.
    var BUBBLE_SEL = '[class*="timelineMessage_"],[class*="userMessageContainer_"],[class*="permissionRequestContainer_"],[class*="permissionsContainer_"],[class*="titleTextInner_"],[class*="sessionName_"]';
    // Dynamic surfaces — contenteditable composer + its mention-mirror
    // overlay. The composer text itself is rendered transparent (color:
    // rgba(0,0,0,0)); what the user actually sees is the mentionMirror_
    // sibling that mirrors the same text. We must style BOTH.
    var INPUT_SEL = '[class*="messageInput_"],[class*="mentionMirror_"]';
    var WATCH_SEL = BUBBLE_SEL + ',' + INPUT_SEL;

    function watchBubble(el) {
        if (!el.matches || !el.matches(WATCH_SEL)) return;
        if (el.__YBYwatched) return;
        el.__YBYwatched = true;
        var dynamic = el.matches(INPUT_SEL);
        function check() {
            // Manual force override takes priority over auto-detection.
            var forceRtl = el.classList.contains('YBY-force-rtl');
            var forceLtr = el.classList.contains('YBY-force-ltr');
            var persian;
            if (forceRtl) persian = true;
            else if (forceLtr) persian = false;
            else persian = RTL.test(el.textContent || '');

            if (persian) {
                if (!el.classList.contains(CLS)) el.classList.add(CLS);
                // v7.2.31 — wrap arrows in static bubbles via DEBOUNCED
                // function (waits WRAP_DEBOUNCE_MS after last mutation).
                // Composer (dynamic) is excluded — too much DOM churn there.
                if (!dynamic) wrapArrowsDebounced(el);
                // v8.0.2 — Per-cell table direction so source column order is
                // never reversed. Tables themselves stay LTR.
                if (!dynamic && el.querySelectorAll) {
                    el.querySelectorAll('table').forEach(function (t) { t.setAttribute('dir', 'ltr'); });
                    el.querySelectorAll('th, td').forEach(function (cell) {
                        cell.setAttribute('dir', RTL.test(cell.textContent || '') ? 'rtl' : 'ltr');
                    });
                }
                if (dynamic) {
                    // dir="rtl" is the HTML-native direction setter. It
                    // beats any CSS \`direction\` declaration the composer
                    // might ship with and works even when inline styles
                    // are stripped by React reconciliation.
                    if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
                    // Inline !important styles as a second line of defense.
                    // Guards prevent a feedback loop with our own observer.
                    if (el.style.direction !== 'rtl') el.style.setProperty('direction', 'rtl', 'important');
                    if (el.style.textAlign !== 'right') el.style.setProperty('text-align', 'right', 'important');
                    if (el.style.fontFamily.indexOf('IRANYekan') === -1) el.style.setProperty('font-family', "'IRANYekan', sans-serif", 'important');
                    if (el.style.unicodeBidi !== 'isolate') el.style.setProperty('unicode-bidi', 'isolate', 'important');
                }
            } else if (dynamic) {
                if (el.classList.contains(CLS)) el.classList.remove(CLS);
                if (el.hasAttribute('dir')) el.removeAttribute('dir');
                if (el.style.direction) el.style.removeProperty('direction');
                if (el.style.textAlign) el.style.removeProperty('text-align');
                if (el.style.fontFamily) el.style.removeProperty('font-family');
                if (el.style.unicodeBidi) el.style.removeProperty('unicode-bidi');
            }
        }
        // rAF-throttled schedule — coalesces bursts of mutations (streaming
        // text, React re-renders) into a single check per paint frame.
        var scheduled = false;
        function schedule() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(function() { scheduled = false; check(); });
        }
        check();
        // Never disconnect. React reconciliation can rewrite className,
        // the style attribute, or the dir attribute on re-render — observing
        // them lets us reassert without a flicker back to LTR. Static
        // bubbles only need 'class' (dir/style never change for them);
        // the composer also needs 'style' + 'dir'.
        new MutationObserver(schedule).observe(el, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: dynamic ? ['class', 'style', 'dir'] : ['class'],
        });
    }

    function init() {
        var root = document.getElementById('root');
        if (!root) { setTimeout(init, 500); return; }
        root.querySelectorAll(WATCH_SEL).forEach(watchBubble);
        new MutationObserver(function(muts) {
            for (var i = 0; i < muts.length; i++) {
                for (var j = 0; j < muts[i].addedNodes.length; j++) {
                    var nd = muts[i].addedNodes[j];
                    if (nd.nodeType !== 1) continue;
                    if (nd.matches) watchBubble(nd);
                    if (nd.querySelectorAll) nd.querySelectorAll(WATCH_SEL).forEach(watchBubble);
                }
            }
        }).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Manual direction override for the focused composer only — Ctrl +
    // Right-Shift toggles force-rtl, Ctrl + Left-Shift toggles force-ltr
    // on the messageInput_ that currently has focus (and its sibling
    // mentionMirror_). Pressing the same combo twice clears the override
    // and returns to Persian auto-detection. The class change fires the
    // existing MutationObserver which re-runs check() and applies or
    // removes YBYrtl + inline styles accordingly.
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Shift' || !e.ctrlKey) return;
        var target = e.code === 'ShiftRight' ? 'rtl' : e.code === 'ShiftLeft' ? 'ltr' : null;
        if (!target) return;
        var active = document.activeElement;
        if (!active || !active.matches || !active.matches(INPUT_SEL)) return;
        var cls = 'YBY-force-' + target;
        var other = 'YBY-force-' + (target === 'rtl' ? 'ltr' : 'rtl');
        var on = !active.classList.contains(cls);
        function apply(element) {
            if (!element || !element.classList) return;
            if (on) {
                element.classList.remove(other);
                element.classList.add(cls);
            } else {
                element.classList.remove(cls);
            }
        }
        apply(active);
        // Mirror the class onto the mention-mirror sibling in the same container
        var container = active.closest('[class*="messageInputContainer_"]') || active.parentElement;
        if (container) container.querySelectorAll('[class*="mentionMirror_"]').forEach(apply);
    });
    } catch (e) { try { console.error("[persian-rtl claude-code]", e); } catch(_){} }
})();
${CC_JS_END_MARKER}
`;
}

/**
 * Build the CSS injected into Claude Code's plan-preview webview template.
 * The plan preview lives inside Claude Code's extension.js (HTML template),
 * not in webview/index.*, and its CSP bans external resources — so fonts
 * have to come in as base64 data URIs.
 */
function buildPlanPreviewCSS(extensionPath) {
    const fontsDir = path.join(extensionPath, 'fonts');
    const regularB64 = fs.readFileSync(path.join(fontsDir, 'IRANYekanWebRegular.woff2')).toString('base64');
    const boldB64 = fs.readFileSync(path.join(fontsDir, 'IRANYekanWebBold.woff2')).toString('base64');

    return `<style>
${CC_PLAN_CSS_MARKER}
@font-face { font-family: 'IRANYekan'; font-style: normal; font-weight: normal; src: url('data:font/woff2;base64,${regularB64}') format('woff2'); }
@font-face { font-family: 'IRANYekan'; font-style: normal; font-weight: bold;   src: url('data:font/woff2;base64,${boldB64}') format('woff2'); }

.fa-rtl {
  direction: rtl;
  text-align: right;
  font-family: 'IRANYekan', sans-serif;
  unicode-bidi: isolate;
}
.fa-rtl.fa-list { padding-right: 1.8em; padding-left: 0; }
.fa-rtl.fa-blockquote { border-right: 3px solid var(--vscode-textBlockQuote-border); border-left: none; padding-right: 12px; padding-left: 0; }
/* v8.0.2 — Tables never reverse column order; per-cell direction. */
#content table { direction: ltr; }
#content th[dir="rtl"], #content td[dir="rtl"] { direction: rtl; text-align: right; font-family: 'IRANYekan', sans-serif; }
#content th[dir="ltr"], #content td[dir="ltr"] { direction: ltr; text-align: left; }

/* Code stays LTR even if an ancestor got .fa-rtl */
#content pre, #content code, #content pre *, #content code * {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
  font-family: var(--vscode-editor-font-family), monospace !important;
}

/* v7.2.27 — mirror directional arrows inside Persian (RTL) text so that
 * "File → Open Folder" reads visually as "Open Folder ← File" in RTL flow.
 * Only applied inside .fa-rtl containers; <pre>/<code> are excluded by the
 * wrapper script (see buildPlanPreviewJS). The logical Unicode char is
 * preserved (screen reader and copy-paste keep semantics). */
.fa-rtl .bidi-arrow-mirror {
  display: inline-block;
  transform: scaleX(-1);
  unicode-bidi: isolate;
}
${CC_PLAN_CSS_END_MARKER}
</style>`;
}

/**
 * Build the JS injected into Claude Code's plan-preview webview template.
 * Wrapped in its own <script> tag with the {{NONCE}} placeholder so the
 * template's CSP (script-src 'nonce-{{NONCE}}') allows it.
 */
function buildPlanPreviewJS() {
    return `<script nonce="{{NONCE}}">
${CC_PLAN_JS_MARKER}
(function () {
  // v7.2.28 — outer try/catch so any future bug here never crashes the
  // plan-preview webview. v7.2.27 had a String.prototype.replace bug.
  try {
  var PERSIAN = /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;
  function hasPersian(el) { return PERSIAN.test(el.textContent || ''); }
  // v7.2.29 — arrow flipping in React-rendered chat is RE-INTRODUCED
  // with hard safeguards against the infinite-loop trap that broke
  // v7.2.27:
  //   1. Wrap is debounced (only runs N ms after the last mutation).
  //      During streaming, wraps never fire — only when content settles.
  //   2. Each node tracks how many times it has been re-wrapped (via a
  //      WeakMap). After 3 re-wraps, the node is permanently skipped —
  //      this catches React reconciliation loops where our spans get
  //      removed and the next mutation tries to re-wrap them.
  //   3. The wrap function itself is wrapped in try/catch so any DOM
  //      manipulation error never escapes to crash the host page.
  // v8.0.2 — Arrow wrapper + classifier (single source of truth — see
  // buildArrowMirrorJS in src/extension.js).
  ${buildArrowMirrorJS({ maxAttempts: 10 })}
  function applyRtl(root) {
    if (!root) return;
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li').forEach(function (el) {
      if (el.closest('pre')) return;
      var persian = hasPersian(el);
      el.classList.toggle('fa-rtl', persian);
      el.classList.toggle('fa-blockquote', el.tagName === 'BLOCKQUOTE' && persian);
      if (persian) wrapArrows(el);
    });
    root.querySelectorAll('ul, ol').forEach(function (list) {
      if (list.closest('pre')) return;
      var persian = hasPersian(list);
      list.classList.toggle('fa-rtl', persian);
      list.classList.toggle('fa-list', persian);
    });
    // v8.0.2 — Tables: column order always source order. Per-cell direction.
    root.querySelectorAll('table').forEach(function (t) { t.setAttribute('dir', 'ltr'); });
    root.querySelectorAll('th, td').forEach(function (cell) {
      var persian = hasPersian(cell);
      cell.classList.toggle('fa-rtl', persian);
      cell.setAttribute('dir', persian ? 'rtl' : 'ltr');
      if (persian) wrapArrows(cell);
    });
  }
  function boot() {
    var content = document.getElementById('content');
    if (!content) { setTimeout(boot, 100); return; }
    applyRtl(content);
    var observing = false, scheduled = false;
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; applyRtl(content); });
    }
    new MutationObserver(schedule).observe(content, { childList: true, subtree: true, characterData: true });
    observing = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  } catch (e) { try { console.error('[persian-rtl plan-preview]', e); } catch(_){} }
})();
${CC_PLAN_JS_END_MARKER}
</script>`;
}

/**
 * Patch the plan-preview HTML template inside Claude Code's extension.js.
 * The template is an inline backtick-string literal containing the CSP meta,
 * a <style> block, and an inline <script>. We inject our CSS right after the
 * CSP meta tag and our script right before the template's </body>.
 */
// Strip our plan-preview injections without touching surrounding whitespace.
function stripPlanBlocks(content) {
    // CSS: we injected `\n<style>\n…\n</style>` right after the CSP meta tag's `>`
    const cssStart = '\n<style>\n' + CC_PLAN_CSS_MARKER;
    const cssEnd   = CC_PLAN_CSS_END_MARKER + '\n</style>';
    const cs = content.indexOf(cssStart);
    if (cs !== -1) {
        const ce = content.indexOf(cssEnd, cs);
        if (ce !== -1) content = content.substring(0, cs) + content.substring(ce + cssEnd.length);
    }
    // JS: we injected `<script …>\n…\n</script>\n` right before the template's </body>
    const jsStart = '<script nonce="{{NONCE}}">\n' + CC_PLAN_JS_MARKER;
    const jsEnd   = CC_PLAN_JS_END_MARKER + '\n</script>';
    const js = content.indexOf(jsStart);
    if (js !== -1) {
        const je = content.indexOf(jsEnd, js);
        if (je !== -1) {
            let end = je + jsEnd.length;
            if (content[end] === '\n') end++; // swallow the trailing \n we added
            content = content.substring(0, js) + content.substring(end);
        }
    }
    // CSP widening — revert
    if (content.includes(CC_PLAN_CSP_NEW)) {
        content = content.replace(CC_PLAN_CSP_NEW, CC_PLAN_CSP_OLD);
    }
    return content;
}

function patchClaudeCodeExtensionJs(ext, extensionPath) {
    const messages = [];
    if (!ext.extensionJsPath || !fs.existsSync(ext.extensionJsPath)) {
        messages.push(`  Plan: Skipped for ${ext.name} (extension.js not found)`);
        return { messages, changed: false };
    }
    const backupPath = ext.extensionJsPath + '.persian-rtl-plan-backup';
    try {
        if (!fs.existsSync(backupPath)) fs.copyFileSync(ext.extensionJsPath, backupPath);
        let content = fs.readFileSync(ext.extensionJsPath, 'utf8');

        // Strip any previous marker blocks so we can re-apply cleanly.
        content = stripPlanBlocks(content);

        if (!content.includes(CC_PLAN_CSP_OLD)) {
            messages.push(`  Plan: CSP anchor not found for ${ext.name} (Claude Code may have changed the template)`);
            return { messages, changed: false };
        }

        // 1) widen CSP to allow data-URI fonts
        content = content.replace(CC_PLAN_CSP_OLD, CC_PLAN_CSP_NEW);

        // 2) inject our <style> immediately after the CSP meta tag.
        // v7.2.28 — use function callback so `$` in cssInjection is taken
        // literally. String.prototype.replace with a string replacement
        // expands `$&` to matched text (and other `$N` patterns), which
        // would silently corrupt any injection containing `$`.
        const cssInjection = buildPlanPreviewCSS(extensionPath);
        content = content.replace(CC_PLAN_CSP_NEW + '>', () => CC_PLAN_CSP_NEW + '>\n' + cssInjection);

        // 3) inject our <script> immediately before the template's </body>
        const jsInjection = buildPlanPreviewJS();
        // Anchor is the zero-indent `\n</body>\n</html>\n`` closing the A14 template
        // literal. Zero indent distinguishes it from Claude Code's other HTML template
        // (the OAuth callback page, which uses 6-space indentation).
        const bodyAnchor = "  </script>\n</body>\n</html>\n`";
        if (!content.includes(bodyAnchor)) {
            messages.push(`  Plan: Body anchor not found for ${ext.name}`);
            // Roll back CSP + CSS injection to keep the file clean
            content = content.replace(CC_PLAN_CSP_NEW + '>\n' + cssInjection, () => CC_PLAN_CSP_OLD + '>');
            content = content.replace(CC_PLAN_CSP_NEW, () => CC_PLAN_CSP_OLD);
            fs.writeFileSync(ext.extensionJsPath, content, 'utf8');
            return { messages, changed: false };
        }
        // v7.2.28 — function callback: jsInjection contains `$&` inside
        // regex escape strings. The previous string-replacement form
        // expanded `$&` to bodyAnchor, producing malformed injected JS:
        //
        //   `return c.replace(/.../g, '\\</script>...');`
        //
        // — which crashed Claude Code with "SyntaxError: Unexpected token '}'"
        // at extension activation. Function callback bypasses $-expansion.
        content = content.replace(bodyAnchor, () =>
            "  </script>\n" + jsInjection + "\n</body>\n</html>\n`");

        fs.writeFileSync(ext.extensionJsPath, content, 'utf8');
        messages.push(`  Plan: Persian RTL applied to ${ext.name} (plan-preview webview)`);
        return { messages, changed: true };
    } catch (err) {
        messages.push(`  Plan: Error patching ${ext.name}: ${err.message}`);
        return { messages, changed: false };
    }
}

function unpatchClaudeCodeExtensionJs(ext) {
    const messages = [];
    if (!ext.extensionJsPath || !fs.existsSync(ext.extensionJsPath)) return { messages, changed: false };
    const backupPath = ext.extensionJsPath + '.persian-rtl-plan-backup';
    try {
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, ext.extensionJsPath);
            fs.unlinkSync(backupPath);
            messages.push(`  Plan: Restored extension.js for ${ext.name}`);
            return { messages, changed: true };
        }
        // No backup — do a best-effort marker strip
        let content = fs.readFileSync(ext.extensionJsPath, 'utf8');
        content = stripPlanBlocks(content);
        fs.writeFileSync(ext.extensionJsPath, content, 'utf8');
        messages.push(`  Plan: Stripped markers in extension.js for ${ext.name}`);
        return { messages, changed: true };
    } catch (err) {
        messages.push(`  Plan: Error unpatching ${ext.name}: ${err.message}`);
        return { messages, changed: false };
    }
}

// =============================================
// Codex / ChatGPT for VS Code webview patching
// =============================================

function buildCodexCSS() {
    return `/* Persian RTL — Codex / ChatGPT for VS Code */
@font-face {
    font-family: 'IRANYekan';
    font-style: normal;
    font-weight: normal;
    src: url('./IRANYekanWebRegular.woff2') format('woff2');
}
@font-face {
    font-family: 'IRANYekan';
    font-style: normal;
    font-weight: bold;
    src: url('./IRANYekanWebBold.woff2') format('woff2');
}

/* User-message body (whitespace-pre-wrap span container) */
.whitespace-pre-wrap.YBYrtl {
    direction: rtl;
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

/* Thread title — appears in the sidebar thread list (data-thread-title)
   and as the active-thread header button (view-transition-name: header-title) */
[data-thread-title="true"].YBYrtl,
[style*="header-title"] span.truncate.YBYrtl {
    direction: rtl;
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

/* Plan / task panel rows — the task's text span sits as the last flex child
   next to an icon + number block. Setting RTL on the row reverses the flex
   so the number / status icon move to the right and Persian text flows to
   the left, which is the natural layout for a Persian numbered list. */
[id^="plan-item-"].YBYrtl {
    direction: rtl;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

/* Manual direction override for the Codex composer only — Ctrl +
   Right-Shift toggles force-rtl, Ctrl + Left-Shift toggles force-ltr on
   the focused [data-codex-composer="true"]. force-rtl reuses the
   existing YBYrtl composer rule through watchBubble; force-ltr needs
   an explicit LTR rule since the default auto-direction would still
   detect Persian characters and flip the composer. */
[data-codex-composer="true"].YBY-force-ltr,
[data-codex-composer="true"].YBY-force-ltr p {
    direction: ltr !important;
    text-align: left !important;
    font-family: var(--vscode-font-family, inherit) !important;
    unicode-bidi: isolate !important;
}

/* ProseMirror composer (Codex message input) — dynamic: the YBYrtl class
   is toggled in JS on every keystroke, so starting with Persian flips to
   RTL + IRANYekan and clearing back to English restores the default. */
[data-codex-composer="true"].YBYrtl,
[data-codex-composer="true"].YBYrtl p {
    direction: rtl;
    text-align: right;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

/* Code-diff viewer (Codex): the diffs-container custom element uses a
   shadow DOM whose pre/code inherit font-family from the host. When an
   ancestor gets YBYrtl (setting body to IRANYekan), that inherits into
   the diff and makes English code render with a Persian font. Force a
   proper monospace stack on the host + its wrapper so the shadow root
   always shows code in monospace, regardless of outer RTL state. */
.composer-diff-simple-line,
diffs-container {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
    direction: ltr !important;
    text-align: left !important;
    unicode-bidi: isolate !important;
}

/* Default per-paragraph auto-direction for Codex markdown. Gives an
   instant visual during streaming before the MutationObserver has had
   time to add YBYrtl — paragraphs starting with Persian immediately
   render RTL instead of showing as LTR and then snapping right-to-left
   when the class lands. The explicit YBYrtl rules below override this
   with isolate + direction rtl once the class is in place. */
[class*="_markdownContent_"] p,
[class*="_markdownContent_"] li,
[class*="_markdownContent_"] blockquote,
[class*="_markdownContent_"] h1,
[class*="_markdownContent_"] h2,
[class*="_markdownContent_"] h3,
[class*="_markdownContent_"] h4,
[class*="_markdownContent_"] h5,
[class*="_markdownContent_"] h6 {
    unicode-bidi: plaintext;
}

/* Assistant markdown content root */
[class*="_markdownContent_"].YBYrtl {
    direction: rtl;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

[class*="_markdownContent_"].YBYrtl p,
[class*="_markdownContent_"].YBYrtl li,
[class*="_markdownContent_"].YBYrtl blockquote,
[class*="_markdownContent_"].YBYrtl h1,
[class*="_markdownContent_"].YBYrtl h2,
[class*="_markdownContent_"].YBYrtl h3,
[class*="_markdownContent_"].YBYrtl h4,
[class*="_markdownContent_"].YBYrtl h5,
[class*="_markdownContent_"].YBYrtl h6 {
    text-align: right !important;
    font-family: 'IRANYekan', sans-serif;
    unicode-bidi: isolate;
}

/* v7.2.27 — mirror directional arrows inside Persian (YBYrtl) text. The
 * wrapping span is added by the YBYrtl JS observer (buildCodexJS). Only
 * applies inside .YBYrtl containers, never inside <pre>/<code>. The
 * logical Unicode char is preserved (screen reader, copy-paste). */
.YBYrtl .bidi-arrow-mirror,
.whitespace-pre-wrap.YBYrtl .bidi-arrow-mirror {
    display: inline-block;
    transform: scaleX(-1);
    unicode-bidi: isolate;
}

[class*="_markdownContent_"].YBYrtl ul,
[class*="_markdownContent_"].YBYrtl ol {
    padding-right: 2em;
    padding-left: 0;
    list-style-position: outside;
}

[class*="_markdownContent_"].YBYrtl blockquote {
    border-right: 3px solid currentColor;
    border-left: none;
    padding-right: 12px;
    padding-left: 0;
}

/* v8.0.2 — Tables never reverse column order; per-cell direction set by JS. */
[class*="_markdownContent_"].YBYrtl table {
    direction: ltr !important;
}

[class*="_markdownContent_"].YBYrtl th[dir="rtl"],
[class*="_markdownContent_"].YBYrtl td[dir="rtl"] {
    direction: rtl;
    text-align: right !important;
    font-family: 'IRANYekan', sans-serif;
}

[class*="_markdownContent_"].YBYrtl th[dir="ltr"],
[class*="_markdownContent_"].YBYrtl td[dir="ltr"] {
    direction: ltr;
    text-align: left !important;
}

/* Every code surface stays LTR — pre, fenced code, inline code span,
   and the file-reference / inline-markdown chips */
[class*="_markdownContent_"].YBYrtl pre,
[class*="_markdownContent_"].YBYrtl code,
[class*="_markdownContent_"].YBYrtl pre *,
[class*="_markdownContent_"].YBYrtl code *,
[class*="_markdownContent_"].YBYrtl [class*="_inlineMarkdown_"] {
    direction: ltr !important;
    text-align: left !important;
    unicode-bidi: isolate !important;
}

/* Real code blocks / fenced code use the editor monospace font */
[class*="_markdownContent_"].YBYrtl pre,
[class*="_markdownContent_"].YBYrtl code,
[class*="_markdownContent_"].YBYrtl pre *,
[class*="_markdownContent_"].YBYrtl code * {
    font-family: var(--vscode-editor-font-family, monospace) !important;
}

/* Inline-markdown chips inherit the paragraph font. Inside a Persian
   block they pick up IRANYekan so digits and short tokens visually
   match the surrounding text instead of snapping to monospace. */
[class*="_markdownContent_"].YBYrtl [class*="_inlineMarkdown_"] {
    font-family: inherit !important;
}
`;
}

function buildCodexJS() {
    return `/* Persian RTL — Codex / ChatGPT for VS Code */
(function () {
    // v7.2.28 — outer try/catch defensively wraps ALL code.
    try {
    var PERSIAN = /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;
    var CLS = 'YBYrtl';
    // v8.0.2 — Arrow wrapper + classifier (single source of truth — see
    // buildArrowMirrorJS in src/extension.js). Codex's inline-markdown
    // chips are also treated as <code> via inlineCodeSel.
    ${buildArrowMirrorJS({ maxAttempts: 10, inlineCodeSel: '[class*="_inlineMarkdown_"]' })}
    // v8.0.2 — Tables: column order always source order. Per-cell direction.
    function applyTableCellDirections(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('table').forEach(function (t) { t.setAttribute('dir', 'ltr'); });
        root.querySelectorAll('th, td').forEach(function (cell) {
            cell.setAttribute('dir', PERSIAN.test(cell.textContent || '') ? 'rtl' : 'ltr');
        });
    }
    // Codex text-bearing surfaces:
    //   - user bubble content: .whitespace-pre-wrap
    //   - assistant content:   [class*="_markdownContent_"]
    //   - thread title in list: [data-thread-title="true"]
    //   - active-thread title in header: [style*="header-title"] span.truncate
    //   - plan/task rows: [id^="plan-item-"]
    //   - composer (ProseMirror): [data-codex-composer="true"]  — DYNAMIC
    var TEXT_SEL = '.whitespace-pre-wrap,[class*="_markdownContent_"],[data-thread-title="true"],[style*="header-title"] span.truncate,[id^="plan-item-"],[data-codex-composer="true"]';
    // Selectors for surfaces whose content can change back-and-forth between
    // Persian and English (composer). For these the class must toggle live,
    // so the observer never disconnects.
    var DYNAMIC_SEL = '[data-codex-composer="true"]';

    function hasPersian(el) { return PERSIAN.test(el.textContent || ''); }

    function watch(el) {
        if (!el || !el.classList) return;
        if (el.__YBYwatched) return;
        el.__YBYwatched = true;
        var dynamic = el.matches(DYNAMIC_SEL);
        function check() {
            // Manual force override (composer only) takes priority over
            // auto-detection. Press Ctrl+RightShift / LeftShift to toggle.
            var forceRtl = el.classList.contains('YBY-force-rtl');
            var forceLtr = el.classList.contains('YBY-force-ltr');
            var persian;
            if (forceRtl) persian = true;
            else if (forceLtr) persian = false;
            else persian = hasPersian(el);

            if (persian) {
                if (!el.classList.contains(CLS)) el.classList.add(CLS);
                // v8.0.2 — wrap arrows + set per-cell table direction.
                wrapArrows(el);
                applyTableCellDirections(el);
            } else if (dynamic && el.classList.contains(CLS)) {
                el.classList.remove(CLS);
            }
        }
        // rAF-throttled schedule — batches streaming text + attribute
        // mutations into a single check per paint frame.
        var scheduled = false;
        function schedule() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(function () { scheduled = false; check(); });
        }
        check();
        // Never disconnect. React reconciliation can rewrite className on
        // every re-render and strip YBYrtl from under us — observing the
        // class attribute lets us reassert it immediately. The childList /
        // subtree / characterData observation covers streaming content and
        // composer typing.
        new MutationObserver(schedule).observe(el, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class'],
        });
    }

    // The Codex code-diff viewer is a <diffs-container> custom element with
    // an OPEN shadow DOM. Light-DOM CSS cannot cross the shadow boundary,
    // and font-family inheritance from the host is unreliable if the shadow
    // has its own rules. Inject a <style> element directly into the shadow
    // root so diff <pre>/<code> always render in monospace. Per-line
    // unicode-bidi: plaintext lets Persian lines in the diff still flow
    // right-to-left without forcing the whole viewer to RTL.
    function injectDiffShadowStyle(host) {
        if (!host || host.__YBYShadowStyled) return;
        var root = host.shadowRoot;
        if (!root) return;
        host.__YBYShadowStyled = true;
        var style = document.createElement('style');
        style.textContent =
            'pre, code, pre *, code * {' +
            '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;' +
            '}' +
            '[data-line], [data-line] * {' +
            '  unicode-bidi: plaintext;' +
            '}';
        root.appendChild(style);
    }

    function scan(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll(TEXT_SEL).forEach(watch);
        root.querySelectorAll('diffs-container').forEach(injectDiffShadowStyle);
    }

    function boot() {
        var root = document.getElementById('root');
        if (!root) { setTimeout(boot, 300); return; }
        scan(document);
        new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                for (var j = 0; j < muts[i].addedNodes.length; j++) {
                    var n = muts[i].addedNodes[j];
                    if (n.nodeType !== 1) continue;
                    if (n.matches && n.matches(TEXT_SEL)) watch(n);
                    if (n.matches && n.matches('diffs-container')) injectDiffShadowStyle(n);
                    scan(n);
                }
            }
        }).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Manual direction override for the focused composer only — Ctrl +
    // Right-Shift toggles force-rtl, Ctrl + Left-Shift toggles force-ltr
    // on the Codex composer. Pressing the same combo twice clears the
    // override and returns to Persian auto-detection. The class change
    // fires the existing MutationObserver which re-runs check().
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Shift' || !e.ctrlKey) return;
        var target = e.code === 'ShiftRight' ? 'rtl' : e.code === 'ShiftLeft' ? 'ltr' : null;
        if (!target) return;
        var active = document.activeElement;
        if (!active || !active.matches) return;
        // Walk up to find the Codex composer (ProseMirror may focus a child node)
        var composer = active.matches(DYNAMIC_SEL) ? active : active.closest(DYNAMIC_SEL);
        if (!composer) return;
        var cls = 'YBY-force-' + target;
        var other = 'YBY-force-' + (target === 'rtl' ? 'ltr' : 'rtl');
        if (composer.classList.contains(cls)) {
            composer.classList.remove(cls);
        } else {
            composer.classList.remove(other);
            composer.classList.add(cls);
        }
    });

    // File-reference buttons in Codex messages carry text like
    // "backend/src/routes/foo.ts (line 42)". Codex itself doesn't wire a
    // click handler to open them, so we do it: hover captures the tooltip's
    // absolute path when available, and click navigates to a URI registered
    // by our own extension that opens the file in VS Code. Relative paths
    // are resolved against the workspace folder on the extension side.
    var FILE_REF_BTN = 'button.cursor-interaction[class*="text-token-text-link-foreground"]';
    var absPathCache = new WeakMap();
    var lastHoveredBtn = null;
    document.addEventListener('mouseover', function (e) {
        var btn = e.target && e.target.closest && e.target.closest(FILE_REF_BTN);
        if (btn) lastHoveredBtn = btn;
    }, true);
    // Radix UI renders the tooltip as a sibling of <body> with role="tooltip"
    // when the trigger is hovered. When that element appears, read its text
    // and cache it against the most recently hovered button. Early-exit when
    // no file-ref button has been hovered recently — streaming assistant
    // text fires this observer hundreds of times and we'd rather skip
    // querySelector work when there's nothing to associate the tooltip with.
    new MutationObserver(function (muts) {
        if (!lastHoveredBtn) return;
        for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var n = added[j];
                if (!n || n.nodeType !== 1) continue;
                var tt = (n.matches && n.matches('[role="tooltip"]'))
                    ? n
                    : (n.querySelector ? n.querySelector('[role="tooltip"]') : null);
                if (tt) {
                    var text = (tt.textContent || '').trim();
                    if (text) absPathCache.set(lastHoveredBtn, text);
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest(FILE_REF_BTN);
        if (!btn) return;
        var span = btn.querySelector('span.break-words') || btn.querySelector('span');
        if (!span) return;
        var rx = /^(.+?)\\s*\\(line\\s+(\\d+)\\)\\s*$/i;
        var text = (span.textContent || '').trim();
        var m = rx.exec(text);
        if (!m) return;
        var relPath = m[1].trim();
        var line = m[2];
        // Prefer the absolute path we captured from the hover tooltip.
        var absText = absPathCache.get(btn);
        var finalPath = relPath;
        var finalLine = line;
        if (absText) {
            var am = rx.exec(absText);
            if (am) { finalPath = am[1].trim(); finalLine = am[2]; }
        }
        e.preventDefault();
        e.stopPropagation();
        var url = 'vscode://amirrezanasiri.persian-rtl-chat/open-file?path='
            + encodeURIComponent(finalPath) + '&line=' + encodeURIComponent(finalLine);
        var a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }, true);
    } catch (e) { try { console.error('[persian-rtl codex]', e); } catch(_){} }
})();
`;
}

function findCodexExtensions() {
    const results = [];
    const home = os.homedir();
    const extRoots = [];
    const editorFolders = [
        { local: '.vscode', server: '.vscode-server' },
        { local: '.cursor', server: '.cursor-server' },
        { local: '.antigravity', server: '.antigravity-server' },
    ];
    for (const ef of editorFolders) {
        extRoots.push(path.join(home, ef.local, 'extensions'));
        extRoots.push(path.join(home, ef.server, 'extensions'));
    }
    if (process.platform === 'win32') {
        for (const wslRoot of ['\\\\wsl$', '\\\\wsl.localhost']) {
            try {
                const distros = fs.readdirSync(wslRoot);
                for (const distro of distros) {
                    try {
                        const homeDir = path.join(wslRoot, distro, 'home');
                        const users = fs.readdirSync(homeDir);
                        for (const user of users) {
                            if (user === 'root') continue;
                            for (const ef of editorFolders) {
                                extRoots.push(path.join(homeDir, user, ef.server, 'extensions'));
                            }
                        }
                    } catch {}
                }
            } catch {}
        }
    }
    for (const root of extRoots) {
        if (!fs.existsSync(root)) continue;
        let entries;
        try { entries = fs.readdirSync(root); } catch { continue; }
        for (const dir of entries.filter(e => e.startsWith('openai.chatgpt-')).sort()) {
            const extDir = path.join(root, dir);
            const htmlPath = path.join(extDir, 'webview', 'index.html');
            if (fs.existsSync(htmlPath)) {
                results.push({ name: dir, dir: extDir, htmlPath, webviewDir: path.dirname(htmlPath) });
            }
        }
    }
    return results;
}

function isCodexPatched(htmlPath) {
    try { return fs.readFileSync(htmlPath, 'utf8').includes(CODEX_HTML_MARKER); } catch { return false; }
}

function patchCodexExtension(ext, extensionPath) {
    const messages = [];
    try {
        const injectDir = path.join(ext.webviewDir, CODEX_INJECT_DIR);
        fs.mkdirSync(injectDir, { recursive: true });

        // Write/refresh our assets
        fs.writeFileSync(path.join(injectDir, 'persian-rtl.css'), buildCodexCSS(), 'utf8');
        fs.writeFileSync(path.join(injectDir, 'persian-rtl.js'), buildCodexJS(), 'utf8');
        for (const fontFile of ['IRANYekanWebRegular.woff2', 'IRANYekanWebBold.woff2']) {
            fs.copyFileSync(path.join(extensionPath, 'fonts', fontFile), path.join(injectDir, fontFile));
        }

        const backupPath = ext.htmlPath + '.persian-rtl-backup';
        if (!fs.existsSync(backupPath)) fs.copyFileSync(ext.htmlPath, backupPath);

        let html = fs.readFileSync(ext.htmlPath, 'utf8');

        // Strip any previous injection between markers so re-apply is clean
        const s = html.indexOf(CODEX_HTML_MARKER);
        if (s !== -1) {
            const e = html.indexOf(CODEX_HTML_END_MARKER, s);
            if (e !== -1) {
                let end = e + CODEX_HTML_END_MARKER.length;
                if (html[end] === '\n') end++;
                // Drop the newline directly before the start marker, if present
                let start = s;
                if (start > 0 && html[start - 1] === '\n') start--;
                html = html.substring(0, start) + html.substring(end);
            }
        }

        const injection =
            CODEX_HTML_MARKER + '\n' +
            '    <link rel="stylesheet" href="./' + CODEX_INJECT_DIR + '/persian-rtl.css">\n' +
            '    <script defer src="./' + CODEX_INJECT_DIR + '/persian-rtl.js"></script>\n' +
            '    ' + CODEX_HTML_END_MARKER;

        if (!html.includes('</head>')) {
            messages.push(`  Codex: </head> not found for ${ext.name}`);
            return { messages, changed: false };
        }
        // v7.2.28 — function callback so any `$` in injection (e.g. CSP
        // nonces, file URIs with query strings) is taken literally.
        html = html.replace('</head>', () => '    ' + injection + '\n  </head>');

        fs.writeFileSync(ext.htmlPath, html, 'utf8');
        messages.push(`  Codex: Persian RTL applied to ${ext.name}`);
        return { messages, changed: true };
    } catch (err) {
        messages.push(`  Codex: Error patching ${ext.name}: ${err.message}`);
        return { messages, changed: false };
    }
}

function unpatchCodexExtension(ext) {
    const messages = [];
    try {
        const backupPath = ext.htmlPath + '.persian-rtl-backup';
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, ext.htmlPath);
            fs.unlinkSync(backupPath);
        } else {
            // Best-effort: strip marker block
            let html = fs.readFileSync(ext.htmlPath, 'utf8');
            const s = html.indexOf(CODEX_HTML_MARKER);
            if (s !== -1) {
                const e = html.indexOf(CODEX_HTML_END_MARKER, s);
                if (e !== -1) {
                    let end = e + CODEX_HTML_END_MARKER.length;
                    if (html[end] === '\n') end++;
                    let start = s;
                    if (start > 0 && html[start - 1] === '\n') start--;
                    html = html.substring(0, start) + html.substring(end);
                    fs.writeFileSync(ext.htmlPath, html, 'utf8');
                }
            }
        }
        // Remove injected assets directory
        const injectDir = path.join(ext.webviewDir, CODEX_INJECT_DIR);
        if (fs.existsSync(injectDir)) {
            for (const f of fs.readdirSync(injectDir)) {
                try { fs.unlinkSync(path.join(injectDir, f)); } catch {}
            }
            try { fs.rmdirSync(injectDir); } catch {}
        }
        messages.push(`  Codex: Restored ${ext.name}`);
        return { messages, changed: true };
    } catch (err) {
        messages.push(`  Codex: Error restoring ${ext.name}: ${err.message}`);
        return { messages, changed: false };
    }
}

function patchCodex(extensionPath) {
    const exts = findCodexExtensions();
    if (exts.length === 0) return { found: false, messages: [], changed: false };
    const allMessages = [];
    let anyChanged = false;
    for (const ext of exts) {
        const { messages, changed } = patchCodexExtension(ext, extensionPath);
        allMessages.push(...messages);
        if (changed) anyChanged = true;
    }
    return { found: true, messages: allMessages, changed: anyChanged };
}

function unpatchCodex() {
    const exts = findCodexExtensions();
    if (exts.length === 0) return { messages: [], changed: false };
    const allMessages = [];
    let anyChanged = false;
    for (const ext of exts) {
        const { messages, changed } = unpatchCodexExtension(ext);
        allMessages.push(...messages);
        if (changed) anyChanged = true;
    }
    return { messages: allMessages, changed: anyChanged };
}

/**
 * Find Claude Code extension webview directories
 */
function findClaudeCodeExtensions() {
    const results = [];
    const home = os.homedir();
    const extRoots = [];

    const editorFolders = [
        { local: '.vscode', server: '.vscode-server' },
        { local: '.cursor', server: '.cursor-server' },
        { local: '.antigravity', server: '.antigravity-server' },
    ];

    for (const ef of editorFolders) {
        extRoots.push(path.join(home, ef.local, 'extensions'));
        extRoots.push(path.join(home, ef.server, 'extensions'));
    }

    if (process.platform === 'win32') {
        for (const wslRoot of ['\\\\wsl$', '\\\\wsl.localhost']) {
            try {
                const distros = fs.readdirSync(wslRoot);
                for (const distro of distros) {
                    try {
                        const homeDir = path.join(wslRoot, distro, 'home');
                        const users = fs.readdirSync(homeDir);
                        for (const user of users) {
                            if (user === 'root') continue;
                            for (const ef of editorFolders) {
                                extRoots.push(path.join(homeDir, user, ef.server, 'extensions'));
                            }
                        }
                    } catch {}
                }
            } catch {}
        }
    }

    for (const root of extRoots) {
        if (!fs.existsSync(root)) continue;
        let entries;
        try { entries = fs.readdirSync(root); } catch { continue; }
        for (const dir of entries.filter(e => e.startsWith('anthropic.claude-code-')).sort()) {
            const extDir = path.join(root, dir);
            const cssPath = path.join(extDir, 'webview', 'index.css');
            const jsPath = path.join(extDir, 'webview', 'index.js');
            const extensionJsPath = path.join(extDir, 'extension.js');
            if (fs.existsSync(cssPath)) {
                results.push({
                    name: dir,
                    dir: extDir,
                    cssPath,
                    jsPath: fs.existsSync(jsPath) ? jsPath : null,
                    extensionJsPath: fs.existsSync(extensionJsPath) ? extensionJsPath : null,
                });
            }
        }
    }
    return results;
}

function isClaudeCodePatched(cssPath) {
    try { return fs.readFileSync(cssPath, 'utf8').includes(CC_CSS_MARKER); } catch { return false; }
}

function isPlanPreviewPatched(extensionJsPath) {
    try { return fs.readFileSync(extensionJsPath, 'utf8').includes(CC_PLAN_CSS_MARKER); } catch { return false; }
}

function isExtFullyPatched(ext) {
    if (!isClaudeCodePatched(ext.cssPath)) return false;
    if (ext.extensionJsPath && !isPlanPreviewPatched(ext.extensionJsPath)) return false;
    return true;
}

function removeBlock(content, startMarker, endMarker) {
    const start = content.indexOf(startMarker);
    const end = content.indexOf(endMarker);
    if (start === -1 || end === -1) return content;
    let a = start, b = end + endMarker.length;
    if (a > 0 && content[a - 1] === '\n') a--;
    if (b < content.length && content[b] === '\n') b++;
    return content.substring(0, a) + content.substring(b);
}

function patchClaudeCodeExtension(ext, extensionPath) {
    const messages = [];
    let changed = false;

    // Copy font files next to index.css
    const webviewDir = path.dirname(ext.cssPath);
    const fontsDir = path.join(__dirname, '..', 'fonts');
    for (const fontFile of ['IRANYekanWebRegular.woff2', 'IRANYekanWebBold.woff2']) {
        try { fs.copyFileSync(path.join(fontsDir, fontFile), path.join(webviewDir, fontFile)); } catch (err) {
            messages.push(`  Font: Error copying ${fontFile}: ${err.message}`);
        }
    }

    // CSS
    const backupCss = ext.cssPath + '.persian-rtl-backup';
    try {
        if (!fs.existsSync(backupCss)) fs.copyFileSync(ext.cssPath, backupCss);
        const existing = fs.readFileSync(ext.cssPath, 'utf8');
        let updated = existing.includes(CC_CSS_MARKER) ? removeBlock(existing, CC_CSS_MARKER, CC_CSS_END_MARKER) : existing;
        fs.writeFileSync(ext.cssPath, updated + '\n' + buildClaudeCodeCSS(), 'utf8');
        messages.push(`  CSS: Persian RTL applied to ${ext.name}`);
        changed = true;
    } catch (err) { messages.push(`  CSS: Error patching ${ext.name}: ${err.message}`); }

    // JS
    if (ext.jsPath) {
        const backupJs = ext.jsPath + '.persian-rtl-backup';
        try {
            if (!fs.existsSync(backupJs)) fs.copyFileSync(ext.jsPath, backupJs);
            const existing = fs.readFileSync(ext.jsPath, 'utf8');
            let updated = existing.includes(CC_JS_MARKER) ? removeBlock(existing, CC_JS_MARKER, CC_JS_END_MARKER) : existing;
            fs.writeFileSync(ext.jsPath, updated + '\n' + buildClaudeCodeJS(), 'utf8');
            messages.push(`  JS: Persian RTL applied to ${ext.name}`);
            changed = true;
        } catch (err) { messages.push(`  JS: Error patching ${ext.name}: ${err.message}`); }
    }

    // Plan-mode preview webview (inside Claude Code's extension.js)
    const planResult = patchClaudeCodeExtensionJs(ext, extensionPath);
    messages.push(...planResult.messages);
    if (planResult.changed) changed = true;

    return { messages, changed };
}

function patchClaudeCode(extensionPath) {
    const exts = findClaudeCodeExtensions();
    if (exts.length === 0) return { found: false, messages: ['No Claude Code extensions found'], changed: false };
    const allMessages = [];
    let anyChanged = false;
    for (const ext of exts) {
        const { messages, changed } = patchClaudeCodeExtension(ext, extensionPath);
        allMessages.push(...messages);
        if (changed) anyChanged = true;
    }
    return { found: true, messages: allMessages, changed: anyChanged };
}

const YECHIELBY_CSS_START = '/* RTL Text Support for Claude Code VS Code / Cursor / Antigravity Extension - Added by script */';
const YECHIELBY_CSS_END   = '/* End RTL Text Support for Claude Code VS Code / Cursor / Antigravity Extension */';
const YECHIELBY_JS_START  = '/* RTL Toggle Button - Added by script */';
const YECHIELBY_JS_END    = '/* End RTL Toggle Button */';

function stripAllRtlPatches(content) {
    content = removeBlock(content, CC_CSS_MARKER, CC_CSS_END_MARKER);
    content = removeBlock(content, CC_JS_MARKER, CC_JS_END_MARKER);
    content = removeBlock(content, YECHIELBY_CSS_START, YECHIELBY_CSS_END);
    content = removeBlock(content, YECHIELBY_JS_START, YECHIELBY_JS_END);
    return content;
}

function findCleanestContent(filePath) {
    const bakPath = filePath + '.bak';
    if (fs.existsSync(bakPath)) {
        const content = fs.readFileSync(bakPath, 'utf8');
        if (!content.includes(CC_CSS_MARKER) && !content.includes(YECHIELBY_CSS_START) &&
            !content.includes(CC_JS_MARKER)  && !content.includes(YECHIELBY_JS_START)) {
            return { content, source: bakPath };
        }
    }
    const ourBackup = filePath + '.persian-rtl-backup';
    if (fs.existsSync(ourBackup)) {
        return { content: stripAllRtlPatches(fs.readFileSync(ourBackup, 'utf8')), source: ourBackup };
    }
    return { content: stripAllRtlPatches(fs.readFileSync(filePath, 'utf8')), source: 'current' };
}

function unpatchClaudeCodeExtension(ext) {
    const messages = [];
    let changed = false;

    // Remove font files
    const webviewDir = path.dirname(ext.cssPath);
    for (const fontFile of ['IRANYekanWebRegular.woff2', 'IRANYekanWebBold.woff2']) {
        try { if (fs.existsSync(path.join(webviewDir, fontFile))) fs.unlinkSync(path.join(webviewDir, fontFile)); } catch {}
    }

    // Restore CSS
    try {
        const { content, source } = findCleanestContent(ext.cssPath);
        fs.writeFileSync(ext.cssPath, content, 'utf8');
        for (const bak of [ext.cssPath + '.persian-rtl-backup', ext.cssPath + '.bak']) {
            try { if (fs.existsSync(bak)) fs.unlinkSync(bak); } catch {}
        }
        messages.push(`  CSS: Restored for ${ext.name}`);
        changed = true;
    } catch (err) { messages.push(`  CSS: Error restoring ${ext.name}: ${err.message}`); }

    // Restore JS
    if (ext.jsPath) {
        try {
            const { content, source } = findCleanestContent(ext.jsPath);
            fs.writeFileSync(ext.jsPath, content, 'utf8');
            for (const bak of [ext.jsPath + '.persian-rtl-backup', ext.jsPath + '.bak']) {
                try { if (fs.existsSync(bak)) fs.unlinkSync(bak); } catch {}
            }
            messages.push(`  JS: Restored for ${ext.name}`);
            changed = true;
        } catch (err) { messages.push(`  JS: Error restoring ${ext.name}: ${err.message}`); }
    }

    // Plan-mode preview webview
    const planResult = unpatchClaudeCodeExtensionJs(ext);
    messages.push(...planResult.messages);
    if (planResult.changed) changed = true;

    return { messages, changed };
}

function unpatchClaudeCode() {
    const exts = findClaudeCodeExtensions();
    if (exts.length === 0) return { messages: ['No Claude Code extensions found'], changed: false };
    const allMessages = [];
    let anyChanged = false;
    for (const ext of exts) {
        const { messages, changed } = unpatchClaudeCodeExtension(ext);
        allMessages.push(...messages);
        if (changed) anyChanged = true;
    }
    return { messages: allMessages, changed: anyChanged };
}

// =============================================
// Workbench patching
// =============================================

function findWorkbenchDir() {
    const execDir = path.dirname(process.execPath);
    let current = execDir;
    for (let i = 0; i < 5; i++) {
        const candidate = path.join(current, 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench');
        if (fs.existsSync(path.join(candidate, 'workbench.html'))) return candidate;
        try {
            for (const child of fs.readdirSync(current, { withFileTypes: true })) {
                if (child.isDirectory()) {
                    const deep = path.join(current, child.name, 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench');
                    if (fs.existsSync(path.join(deep, 'workbench.html'))) return deep;
                }
            }
        } catch {}
        current = path.dirname(current);
    }
    return null;
}

function isPatched(workbenchDir) {
    return fs.readFileSync(path.join(workbenchDir, 'workbench.html'), 'utf8').includes(MARKER);
}

function patchWorkbench(workbenchDir, extensionPath) {
    const htmlPath = path.join(workbenchDir, 'workbench.html');
    const jsPath = path.join(workbenchDir, 'persian-rtl.js');
    const backupPath = htmlPath + '.persian-rtl-backup';

    fs.writeFileSync(jsPath, buildPersianRtlJS(extensionPath), 'utf8');
    let html = fs.readFileSync(htmlPath, 'utf8');
    if (html.includes(MARKER)) { updateChecksum(workbenchDir, htmlPath); return { success: true, alreadyPatched: true }; }
    if (!fs.existsSync(backupPath)) fs.copyFileSync(htmlPath, backupPath);
    html = html.replace(/(font-src\s*\n\s*'self')/, `$1\n\t\t\t\t\tdata:`);
    html = html.replace(/(<script src="\.\/workbench\.js"[^>]*><\/script>)/, `$1\n${SCRIPT_TAG}`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    updateChecksum(workbenchDir, htmlPath);
    return { success: true, alreadyPatched: false };
}

function unpatchWorkbench(workbenchDir) {
    const htmlPath = path.join(workbenchDir, 'workbench.html');
    const jsPath = path.join(workbenchDir, 'persian-rtl.js');
    const backupPath = htmlPath + '.persian-rtl-backup';
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, htmlPath);
        fs.unlinkSync(backupPath);
    } else {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\n?\t<!-- Persian RTL Chat -->\n\t<script src="\.\/persian-rtl\.js"><\/script>/, '');
        html = html.replace(/(font-src\s*\n\s*'self')\n\s*data:/m, '$1');
        fs.writeFileSync(htmlPath, html, 'utf8');
    }
    try { if (fs.existsSync(jsPath)) fs.unlinkSync(jsPath); } catch {}
    updateChecksum(workbenchDir, htmlPath);
    cleanOldResidues();
    return { success: true };
}

function updateChecksum(workbenchDir, htmlPath) {
    try {
        const appDir = path.resolve(workbenchDir, '..', '..', '..', '..', '..');
        const productPath = path.join(appDir, 'product.json');
        if (!fs.existsSync(productPath)) return;
        const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
        if (!product.checksums) return;
        const checksumKey = 'vs/code/electron-browser/workbench/workbench.html';
        if (!(checksumKey in product.checksums)) return;
        const hash = crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('base64').replace(/=+$/, '');
        product.checksums[checksumKey] = hash;
        try {
            fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'), 'utf8');
        } catch {
            vscode.window.showWarningMessage('Persian RTL: Could not update VS Code integrity checksum — run as Administrator once to suppress the "corrupt" warning.', 'OK');
        }
    } catch {}
}

function cleanOldResidues() {
    try { const f = path.join(os.homedir(), 'persian-rtl-vscode.js'); if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    try {
        const config = vscode.workspace.getConfiguration();
        const imports = config.get('vscode_custom_css.imports') || [];
        const filtered = imports.filter(x => !x.includes('persian-rtl'));
        if (filtered.length !== imports.length) config.update('vscode_custom_css.imports', filtered, vscode.ConfigurationTarget.Global);
    } catch {}
}

// =============================================
// Codex WSL guard
// =============================================
// Codex VS Code extension has a setting `chatgpt.runCodexInWindowsSubsystemForLinux`.
// When `true`, Codex runs inside WSL and uses a separate ~/.codex/config.toml inside
// Linux — which breaks MCP servers and skills configured on Windows. We force it to
// `false` while this extension is active, remembering the prior value so we can
// restore it on disable/uninstall.

const CODEX_WSL_SECTION = 'chatgpt';
const CODEX_WSL_KEY = 'runCodexInWindowsSubsystemForLinux';
const CODEX_WSL_SAVED = 'codexWslPreviousGlobalValue';

async function ensureCodexOnWindows(context) {
    try {
        if (process.platform !== 'win32') return;
        if (!vscode.extensions.getExtension('openai.chatgpt')) return;
        const cfg = vscode.workspace.getConfiguration(CODEX_WSL_SECTION);
        const inspected = cfg.inspect(CODEX_WSL_KEY);
        const globalValue = inspected ? inspected.globalValue : undefined;
        if (globalValue === true) {
            if (context.globalState.get(CODEX_WSL_SAVED) === undefined) {
                await context.globalState.update(CODEX_WSL_SAVED, globalValue);
            }
            await cfg.update(CODEX_WSL_KEY, false, vscode.ConfigurationTarget.Global);
        }
    } catch {}
}

async function restoreCodexWslSetting(context) {
    try {
        if (process.platform !== 'win32') return;
        const saved = context.globalState.get(CODEX_WSL_SAVED);
        if (saved === undefined) return;
        const cfg = vscode.workspace.getConfiguration(CODEX_WSL_SECTION);
        await cfg.update(CODEX_WSL_KEY, saved, vscode.ConfigurationTarget.Global);
        await context.globalState.update(CODEX_WSL_SAVED, undefined);
    } catch {}
}

// =============================================
// Extension activation
// =============================================

async function activate(context) {
    const extensionPath = context.extensionPath;
    const workbenchDir = findWorkbenchDir();
    const isDisabled = context.globalState.get('persianRtlDisabled', false);

    if (!isDisabled) {
        ensureCodexOnWindows(context);
    }
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${CODEX_WSL_SECTION}.${CODEX_WSL_KEY}`)) {
                if (!context.globalState.get('persianRtlDisabled', false)) {
                    ensureCodexOnWindows(context);
                }
            }
        })
    );

    // Register a URI handler so Codex file-reference buttons can open files
    // in VS Code via `vscode://amirrezanasiri.persian-rtl-chat/open-file?path=X&line=Y`.
    // Path can be absolute (Windows, POSIX, or WSL /mnt/x/...) or relative —
    // relative paths are resolved against the first matching workspace folder.
    context.subscriptions.push(vscode.window.registerUriHandler({
        handleUri(uri) {
            if (uri.path !== '/open-file') return;
            const params = new URLSearchParams(uri.query);
            let filePath = params.get('path');
            const line = Math.max(0, parseInt(params.get('line') || '1', 10) - 1);
            if (!filePath) return;
            // Normalize WSL /mnt/<drive>/ → <DRIVE>:/
            const wsl = /^\/mnt\/([a-z])\/(.+)$/i.exec(filePath);
            if (wsl) filePath = wsl[1].toUpperCase() + ':/' + wsl[2];
            const isAbs = /^[a-z]:[\\/]/i.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\');
            let fileUri;
            if (isAbs) {
                fileUri = vscode.Uri.file(filePath);
            } else {
                const folders = vscode.workspace.workspaceFolders || [];
                if (!folders.length) {
                    vscode.window.showWarningMessage(`Persian RTL: no workspace open to resolve "${filePath}"`);
                    return;
                }
                fileUri = null;
                for (const ws of folders) {
                    const candidate = vscode.Uri.joinPath(ws.uri, filePath);
                    if (fs.existsSync(candidate.fsPath)) { fileUri = candidate; break; }
                }
                if (!fileUri) fileUri = vscode.Uri.joinPath(folders[0].uri, filePath);
            }
            vscode.commands.executeCommand('vscode.open', fileUri, {
                selection: new vscode.Range(line, 0, line, 0),
            });
        },
    }));

    if (workbenchDir && !isPatched(workbenchDir) && !isDisabled) {
        try {
            patchWorkbench(workbenchDir, extensionPath);
            try { patchClaudeCode(extensionPath); } catch {}
            try { patchCodex(extensionPath); } catch {}
            vscode.window.showInformationMessage('Persian RTL Chat applied — reloading...');
            setTimeout(() => vscode.commands.executeCommand('workbench.action.reloadWindow'), 1500);
            return;
        } catch (err) {
            vscode.window.showErrorMessage(`Persian RTL: Could not patch workbench. Try running as Administrator.\n${err.message}`);
        }
    }

    if (workbenchDir && !isDisabled) {
        const ccExts = findClaudeCodeExtensions();
        const codexExts = findCodexExtensions();
        const ccPatched = ccExts.length === 0 || ccExts.every(isExtFullyPatched);
        const codexPatched = codexExts.length === 0 || codexExts.every(e => isCodexPatched(e.htmlPath));
        const alreadyPatched = ccPatched && codexPatched;
        try { patchClaudeCode(extensionPath); } catch {}
        try { patchCodex(extensionPath); } catch {}
        if (!alreadyPatched && (ccExts.length > 0 || codexExts.length > 0)) {
            vscode.window.showInformationMessage('Persian RTL: Claude Code / Codex RTL applied — reloading...');
            setTimeout(() => vscode.commands.executeCommand('workbench.action.reloadWindow'), 1500);
            return;
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('persianRtl.enable', async () => {
            const dir = findWorkbenchDir();
            if (!dir) { vscode.window.showErrorMessage('Persian RTL: Could not find workbench directory.'); return; }
            try {
                await context.globalState.update('persianRtlDisabled', false);
                const result = patchWorkbench(dir, extensionPath);
                patchClaudeCode(extensionPath);
                patchCodex(extensionPath);
                if (result.alreadyPatched) { vscode.window.showInformationMessage('Persian RTL is already enabled.'); return; }
                const action = await vscode.window.showInformationMessage('Persian RTL Chat enabled! Restart the editor to apply.', 'Restart Now');
                if (action === 'Restart Now') vscode.commands.executeCommand('workbench.action.reloadWindow');
            } catch (err) {
                vscode.window.showErrorMessage(`Persian RTL: Failed to patch. Try running as Administrator.\n${err.message}`);
            }
        }),

        vscode.commands.registerCommand('persianRtl.disable', async () => {
            const dir = findWorkbenchDir();
            if (!dir) { vscode.window.showErrorMessage('Persian RTL: Could not find workbench directory.'); return; }
            try {
                await context.globalState.update('persianRtlDisabled', true);
                unpatchWorkbench(dir);
                unpatchClaudeCode();
                unpatchCodex();
                await restoreCodexWslSetting(context);
                const action = await vscode.window.showInformationMessage('Persian RTL Chat disabled. Restart the editor to apply.', 'Restart Now');
                if (action === 'Restart Now') vscode.commands.executeCommand('workbench.action.reloadWindow');
            } catch (err) {
                vscode.window.showErrorMessage(`Persian RTL: Failed to remove patch. Try running as Administrator.\n${err.message}`);
            }
        }),

        vscode.commands.registerCommand('persianRtl.status', () => {
            const dir = findWorkbenchDir();
            if (!dir) { vscode.window.showInformationMessage('Persian RTL: Could not find workbench directory.'); return; }
            const ccExts = findClaudeCodeExtensions();
            const ccPatched = ccExts.filter(e => isClaudeCodePatched(e.cssPath));
            const planPatched = ccExts.filter(e => e.extensionJsPath && isPlanPreviewPatched(e.extensionJsPath));
            const codexExts = findCodexExtensions();
            const codexPatched = codexExts.filter(e => isCodexPatched(e.htmlPath));
            vscode.window.showInformationMessage(
                (isPatched(dir) ? 'Persian RTL ENABLED' : 'Persian RTL DISABLED') +
                ` — Claude Code: ${ccPatched.length}/${ccExts.length}` +
                ` — Plan preview: ${planPatched.length}/${ccExts.length}` +
                ` — Codex: ${codexPatched.length}/${codexExts.length}`
            );
        }),

        // v7.2.32 — unified "re-apply patches" command. Useful AFTER an
        // extension upgrade (Claude Code / Codex / Copilot) when their files
        // have been overwritten and our patches are lost. Runs ALL patchers
        // in one shot without requiring disable→enable cycle. The user just
        // needs to reload the relevant chat panel afterward.
        //
        // When to use:
        //   - "Reload Window"      — apply EVERYTHING (workbench + all chat surfaces)
        //   - "Re-apply patches"   — quick re-patch without VS Code restart
        //                           (good after Claude Code / Codex update)
        //   - "Refresh AI Bridge"  — only refresh OUR own webview panel
        //                           (no patcher run; just panel re-render)
        //   - "Disable / Enable"   — full reset (use if patches are broken)
        vscode.commands.registerCommand('persianRtl.reapply', async () => {
            const dir = findWorkbenchDir();
            if (!dir) { vscode.window.showErrorMessage('Persian RTL: Could not find workbench directory.'); return; }
            const messages = [];
            try {
                if (!isPatched(dir)) {
                    patchWorkbench(dir, extensionPath);
                    messages.push('workbench: re-patched');
                }
                const cc = patchClaudeCode(extensionPath);
                if (cc.changed) messages.push(`Claude Code: re-patched (${cc.messages.length} surfaces)`);
                const cx = patchCodex(extensionPath);
                if (cx.changed) messages.push(`Codex: re-patched`);
                if (!messages.length) {
                    vscode.window.showInformationMessage('Persian RTL: همه چیز قبلاً به‌روز است (هیچ patch جدیدی لازم نبود).');
                } else {
                    const choice = await vscode.window.showInformationMessage(
                        '✓ Persian RTL: ' + messages.join(' · ') + '. برای دیدن تغییرات یک Reload Window لازم است.',
                        'Reload Now'
                    );
                    if (choice === 'Reload Now') vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Persian RTL: re-apply failed — ${err.message}`);
            }
        }),

        vscode.extensions.onDidChange(() => {
            const stillInstalled = !!vscode.extensions.getExtension('amirrezanasiri.persian-rtl-chat');
            if (!stillInstalled) {
                try { unpatchClaudeCode(); } catch {}
                try { unpatchCodex(); } catch {}
                try { restoreCodexWslSetting(context); } catch {}
            }
        })
    );
}

function deactivate() {
    try { cleanOldResidues(); } catch {}
}

module.exports = { activate, deactivate };
