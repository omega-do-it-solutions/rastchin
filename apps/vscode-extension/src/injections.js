const crypto = require('crypto');
const fs = require('fs');

const {
  CLEAN_CLASS,
  FONT_FAMILY,
  FONT_FACES,
  FONT_STACK,
  FORCE_LTR_CLASS,
  FORCE_RTL_CLASS,
  MARKERS,
} = require('./constants');

// Runtime version, read from package.json so the embedded fingerprint comment
// carries the extension version that produced the injected webview code.
let RUNTIME_VERSION = '0.0.0';
try {
  RUNTIME_VERSION = require('../package.json').version || RUNTIME_VERSION;
} catch {
  /* package.json is always present in a real install; default keeps tests happy */
}

// Content fingerprint of THIS generator file. It is embedded as a comment into
// every generated runtime block so Status can tell, without a window reload,
// whether the code actually injected into a Codex/Claude webview matches the
// bundled generator (i.e. detect a stale patch left behind after an edit or a
// target-extension update). Any change to this file changes the fingerprint.
let RUNTIME_FP = '00000000';
try {
  RUNTIME_FP = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').slice(0, 8);
} catch {
  /* fall back to the placeholder; status simply reports it as unfingerprinted */
}

// Single source of the fingerprint marker. NEVER use a backtick or ${ here: this
// comment is injected into a JS template literal inside Claude's extension.js
// (Plan Preview) — a raw backtick or ${ would close that literal early and break
// activation. The grep-able token is "RastChin runtime".
function fingerprintComment() {
  return `/* RastChin runtime ${RUNTIME_FP} v${RUNTIME_VERSION} */`;
}

function fontFaceCss(source = {}) {
  // Either inline data: URIs (Plan Preview, sandboxed CSP) or relative files.
  const dataUris = source.dataUris || {};
  const prefix = source.prefix || './';
  return FONT_FACES.map((face) => {
    const src = dataUris[face.file] || `${prefix}${face.file}`;
    return `
@font-face {
  font-family: '${FONT_FAMILY}';
  font-style: normal;
  font-weight: ${face.weight};
  src: url('${src}') format('woff2');
}`;
  }).join('\n');
}

function commonScopedCss(scope) {
  return `
${scope} {
  --persian-rtl-clean-font-family: ${FONT_STACK};
}

${scope} .${CLEAN_CLASS},
${scope} .${CLEAN_CLASS}.fa-text-clean,
${scope} .fa-rtl-clean,
${scope} .fa-rtl-clean.fa-text-clean,
${scope} [dir="rtl"].fa-text-clean {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}

${scope} [dir="ltr"].fa-text-clean,
${scope} .fa-ltr-clean {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
}

/* Agent Markdown themes can assign their UI font directly to nested list and
   emphasis nodes. The doubled class gives this rule enough specificity to win
   without styling an entire chat panel. Protected code descendants are omitted
   so commands, paths and fenced code remain monospace. */
${scope} .fa-text-clean.fa-text-clean :is(p, li, div, span, strong, em, b, i, del, mark, small, sub, sup, a):not(.fa-ltr-clean):not(code *):not(pre *):not(kbd *):not(samp *),
${scope} .fa-rtl-clean.fa-text-clean :is(p, li, div, span, strong, em, b, i, del, mark, small, sub, sup, a):not(.fa-ltr-clean):not(code *):not(pre *):not(kbd *):not(samp *) {
  font-family: inherit !important;
}

${scope} a.fa-ltr-clean {
  font-family: var(--vscode-editor-font-family), monospace !important;
}

${scope} .${CLEAN_CLASS} table,
${scope} table.fa-table-clean {
  direction: ltr !important;
}

${scope} th[dir="rtl"],
${scope} td[dir="rtl"] {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate;
}

${scope} th[dir="ltr"],
${scope} td[dir="ltr"] {
  direction: ltr !important;
  text-align: left !important;
}

${scope} .${CLEAN_CLASS} ul,
${scope} .${CLEAN_CLASS} ol,
${scope} ul.fa-rtl-clean,
${scope} ol.fa-rtl-clean {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: isolate !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  padding-right: 1.5em !important;
  padding-left: 0 !important;
  list-style-position: outside !important;
}

${scope} :is(ul, ol).fa-rtl-clean > li.fa-rtl-clean,
${scope} :is(ul, ol).fa-rtl-clean > li[dir="rtl"],
${scope} :is(ul, ol).fa-rtl-clean > li.fa-rtl-clean > :not(.fa-ltr-clean):not(pre):not(code):not(kbd):not(samp),
${scope} :is(ul, ol).fa-rtl-clean > li[dir="rtl"] > :not(.fa-ltr-clean):not(pre):not(code):not(kbd):not(samp) {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: isolate !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
}

${scope} :is(ul, ol).fa-rtl-clean > li.fa-rtl-clean :is(span, strong, em, b, i, del, mark, small, sub, sup, a):not(.fa-ltr-clean):not(code *):not(pre *):not(kbd *):not(samp *),
${scope} :is(ul, ol).fa-rtl-clean > li[dir="rtl"] :is(span, strong, em, b, i, del, mark, small, sub, sup, a):not(.fa-ltr-clean):not(code *):not(pre *):not(kbd *):not(samp *),
${scope} :is(ul, ol).fa-rtl-clean > li::marker {
  font-family: var(--persian-rtl-clean-font-family) !important;
}

/* Agent renderers sometimes insert version-specific wrappers (section,
   output, custom elements, etc.) inside list items. Inherit Vazirmatn through
   every prose descendant instead of maintaining a fragile tag allow-list.
   Explicit LTR fragments and code trees remain protected. */
${scope} :is(ul, ol).fa-rtl-clean > li.fa-rtl-clean :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
${scope} :is(ul, ol).fa-rtl-clean > li[dir="rtl"] :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *) {
  font-family: var(--persian-rtl-clean-font-family) !important;
}

/* Keep the item independently styled while an agent swaps its streaming list
   container for the final Markdown tree. The observer restores the parent list
   marker/layout hook, but these rules avoid even a one-frame font fallback. */
${scope} li.fa-rtl-clean,
${scope} li[dir="rtl"],
${scope} li.fa-rtl-clean :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
${scope} li[dir="rtl"] :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
${scope} li.fa-rtl-clean::marker,
${scope} li[dir="rtl"]::marker {
  font-family: var(--persian-rtl-clean-font-family) !important;
}

${scope} .${CLEAN_CLASS} blockquote,
${scope} blockquote.fa-rtl-clean {
  border-right: 3px solid currentColor;
  border-left: none;
  padding-right: 12px !important;
  padding-left: 0 !important;
}

${scope} pre,
${scope} code,
${scope} kbd,
${scope} samp,
${scope} textarea,
${scope} input,
${scope} pre *,
${scope} code * {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
  font-family: var(--vscode-editor-font-family), monospace !important;
}

/* Prose text/plaintext code blocks the runtime classed as Persian prose. The
   block root carries .fa-rtl-clean-text (Codex [data-markdown-copy="code-block"]
   or Claude [class*="codeBlockWrapper_"]); its <pre>/<code> or direct
   Codex overflow-auto prose body carry .fa-rtl-clean.
   Re-assert RTL + Vazirmatn AND, because this is prose not code, wrap naturally
   instead of the monospace pre/overflow-x scroll. Real code blocks (js, bash,
   json, …) never get .fa-rtl-clean-text, so they stay LTR + monospace above.
   IMPORTANT: target the <pre>/<code> CONTENT only, NOT the wrapper itself.
   Forcing display:block + direction:rtl on the wrapper flipped its header
   ([data-markdown-copy="exclude"], which holds the copy button) and broke
   copy/selection. The wrapper still carries dir="rtl" (set by the runtime) for
   the content; the header is pinned back to LTR below. */
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text pre,
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text .overflow-auto:not([data-markdown-copy="exclude"]),
${scope} [data-markdown-copy="code-block"] .overflow-auto.fa-rtl-clean:not([data-markdown-copy="exclude"]),
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text code.fa-rtl-clean,
${scope} .fa-rtl-clean-text pre.fa-rtl-clean,
${scope} .fa-rtl-clean-text code.fa-rtl-clean {
  display: block !important;
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: plaintext !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  white-space: pre-wrap !important;
  overflow: visible !important;
  overflow-x: visible !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

/* Codex writing-block prose puts the visible text in a hardcoded
   div.overflow-auto[dir="ltr"] body below the copy header. That body is the real
   horizontal-scroll container. Neutralise it through either the wrapper prose
   hook or the body's own .fa-rtl-clean hook so a live tagging/timing drift cannot
   leave overflow:auto behind. Real js/bash/json code blocks are not fa-rtl-clean
   prose bodies, so their scrollers stay untouched.
   NOTE: never use a backtick in this shared CSS. buildClaudePlanCss() injects it
   into a JS template literal inside Claude's extension.js (Plan Preview); a raw
   backtick closes that literal early and a SyntaxError aborts the whole extension
   activation, leaving the Claude panel blank. */
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text .overflow-auto:not([data-markdown-copy="exclude"]),
${scope} [data-markdown-copy="code-block"] .overflow-auto.fa-rtl-clean:not([data-markdown-copy="exclude"]) {
  overflow: visible !important;
  overflow-x: visible !important;
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: plaintext !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  white-space: pre-wrap !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

/* The copy button + language label live in the [data-markdown-copy="exclude"]
   header, a SIBLING of .overflow-auto (not inside it). The wrapper carries
   dir="rtl" (set by the runtime), which inherits into the header and reorders its
   flex layout, dislodging the copy button. Pin the header — and everything inside
   it — back to LTR so the button stays clickable and the code stays
   selectable/copyable. No pointer-events tricks needed. */
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text [data-markdown-copy="exclude"],
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text [data-markdown-copy="exclude"] * {
  direction: ltr !important;
  text-align: left !important;
}

/* The actual prose lives in <span> children of the <code>/<pre>; without this
   they keep the (0,1,2)!-specificity monospace+LTR from the aggressor rule
   above. Inherit the RTL flow + Vazirmatn instead. Decoupled from
   code.fa-rtl-clean so it also covers blocks whose <code> was not individually
   tagged (Claude renders the prose directly under <pre>). */
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text code.fa-rtl-clean *,
${scope} [data-markdown-copy="code-block"].fa-rtl-clean-text .overflow-auto:not([data-markdown-copy="exclude"]) *,
${scope} [data-markdown-copy="code-block"] .overflow-auto.fa-rtl-clean:not([data-markdown-copy="exclude"]) *,
${scope} .fa-rtl-clean-text pre.fa-rtl-clean *,
${scope} .fa-rtl-clean-text code.fa-rtl-clean * {
  direction: inherit !important;
  text-align: inherit !important;
  unicode-bidi: inherit !important;
  font-family: inherit !important;
  white-space: inherit !important;
}

${scope} .bidi-arrow-mirror-clean {
  display: inline-block;
  transform: scaleX(-1);
  unicode-bidi: isolate;
}
`;
}

function runtimeJs(options = {}) {
  const rootSelector = options.rootSelector || 'document';
  const textSelector = options.textSelector || 'p, li, blockquote, h1, h2, h3, h4, h5, h6, [class*="message"], [class*="content"], [data-thread-title="true"]';
  const dynamicSelector = options.dynamicSelector || 'textarea, input, [contenteditable="true"], [data-codex-composer="true"], [class*="messageInput_"], [class*="mentionMirror_"]';
  const inlineCodeSelector = options.inlineCodeSelector || '';
  // cardSelector scopes a generic, content-based RTL pass over request/approval
  // /question cards whose inner text containers carry no stable class names.
  const cardSelector = options.cardSelector || '';
  const optionSelector = options.optionSelector || '[role="radio"], [role="checkbox"], [role="option"], [role="menuitemradio"], [role="menuitemcheckbox"]';
  const rtlPreviewSelector = options.rtlPreviewSelector || '';
  const logName = options.logName || 'webview';
  const codeSelector = inlineCodeSelector
    ? `pre, code, kbd, samp, textarea, input, ${inlineCodeSelector}`
    : 'pre, code, kbd, samp, textarea, input';

  return `${fingerprintComment()}
(function () {
  try {
    var RTL_SCRIPT = /[\\u0600-\\u06ff\\u0750-\\u077f\\u08a0-\\u08ff\\ufb50-\\ufdff\\ufe70-\\ufeff]/;
    var RTL_LETTER = /[\\u0621-\\u064a\\u0660-\\u0669\\u0670-\\u06d3\\u06f0-\\u06f9\\ufb50-\\ufdff\\ufe70-\\ufeff]/;
    // Only Latin letters are strong-LTR for first-strong direction. Latin digits
    // are weak (Unicode Bidi EN), so a Persian line numbered "1. مرحله ..." must
    // resolve RTL, not LTR. Code-like lines are still caught earlier by
    // shouldKeepLtr/looksCodeLikePreview, so this never flips real code.
    var LATIN_STRONG = /[A-Za-z]/;
    var URL = /\\b(?:https?:\\/\\/|www\\.)[^\\s<>()]+/i;
    var EMAIL = /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i;
    var CODE_SEL = ${JSON.stringify(codeSelector)};
    var TEXT_SEL = ${JSON.stringify(textSelector)};
    var DYNAMIC_SEL = ${JSON.stringify(dynamicSelector)};
    var CARD_SEL = ${JSON.stringify(cardSelector)};
    var OPTION_SEL = ${JSON.stringify(optionSelector)};
    // Role-based drift fallback: if the stable surface attribute (e.g.
    // data-codex-approval-surface) ever disappears from the bundle, an approval /
    // request_option_picker is still recognizable by its option group's role.
    // APPROVAL_GROUP_SEL is the role hook; APPROVAL_SURFACE_SEL is the preferred
    // stable surface that, when still present, makes this fallback a no-op.
    var APPROVAL_GROUP_SEL = ${JSON.stringify(options.approvalGroupSelector || '')};
    var APPROVAL_SURFACE_SEL = ${JSON.stringify(options.approvalSurfaceSelector || '')};
    // APPROVAL_OPTION_SEL recognizes a *bare* option group: option_picker pills
    // (role="radio"/"checkbox") that render with NO radiogroup wrapper AND NO
    // surface attribute, so neither CARD_SEL nor APPROVAL_GROUP_SEL would ever
    // reach them. Gated below by closest(surface)/closest(group) so the surface
    // and radiogroup paths stay strict no-ops (settings/feedback use radiogroup).
    var APPROVAL_OPTION_SEL = ${JSON.stringify(options.approvalOptionSelector || '')};
    var RTL_PREVIEW_SEL = ${JSON.stringify(rtlPreviewSelector)};
    var CARD_TEXT_SEL = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, .whitespace-pre-wrap, [class*="_markdownContent_"]';
    var CARD_LEAF_SEL = 'div, span, label';
    var TEXT_LEAF_SEL = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, div, span, label, button, code';
    var SEMANTIC_TEXT_BLOCK_SEL = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';
    var USER_MESSAGE_SEL = ${JSON.stringify(options.userMessageSelector || '[class*="userMessageContainer_"],[class*="userMessage_"]')};
    var DYNAMIC_FIELD_SEL = 'textarea, input, [contenteditable="true"]';
    var CLEAN_CLASS = ${JSON.stringify(CLEAN_CLASS)};
    var FORCE_RTL_CLASS = ${JSON.stringify(FORCE_RTL_CLASS)};
    var FORCE_LTR_CLASS = ${JSON.stringify(FORCE_LTR_CLASS)};
    var ARROWS = ['\\u2192','\\u2190','\\u27f6','\\u27f5','\\u21d2','\\u21d0','\\u279c','\\u2794','\\u27a4','\\u279e'];
    var ARROW_RE = new RegExp('(' + ARROWS.join('|') + ')', 'g');
    var ARROW_CHARS_RE = new RegExp('[' + ARROWS.join('') + ']', 'g');
    var STATUS_LTR = /^\\s*(?:\\.{3}|…)?\\s*(?:Actioning|Brewing|Calculating|Combobulating|Concocting|Considering|Cooking|Finishing|Flibbertigibbeting|Mixing|Percolating|Preparing|Processing|Puttering|Pontificating|Retrying|Simmering|Stirring|Thinking|Working|Reading|Writing|Searching|Running|Loading|Queued|Thought for \\d+s|Worked for \\d+s)\\s*(?:\\.{3}|…)?\\s*$/i;
    var MIRROR_CLASS = 'bidi-arrow-mirror-clean';
    var LIST_FONT_VALUE = 'var(--persian-rtl-clean-font-family)';
    var flipAttempts = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    // ---- self-write suppression (breaks the MutationObserver feedback loops) ----
    // Every observer the runtime owns is registered here so a single write phase
    // can drain ALL of their pending record queues at once (defeats the
    // cross-observer loop, not just the per-element self-loop).
    var rtlObservers = [];
    // Re-entrant write guard. A COUNTER, not a boolean: applyText -> wrapArrows ->
    // more mutators, and scanMutationTarget -> watch -> applyText all nest, so we
    // must only drain when the OUTERMOST write completes (depth returns to 0).
    var rtlWriteDepth = 0;
    function registerObserver(obs) {
      if (obs) rtlObservers.push(obs);
      return obs;
    }
    function drainObservers() {
      // Pull + discard every observer's pending records. takeRecords() empties
      // each queue synchronously, so the records the engine queued for OUR own
      // writes are gone before its scheduled microtask fires -> the callbacks
      // never run for self-originated mutations. Genuine external mutations that
      // arrive later (at depth 0) are queued fresh and delivered normally.
      for (var i = 0; i < rtlObservers.length; i++) {
        var o = rtlObservers[i];
        if (o && o.takeRecords) o.takeRecords();
      }
    }
    function doWrite(fn) {
      rtlWriteDepth++;
      try {
        return fn();
      } finally {
        rtlWriteDepth--;
        if (rtlWriteDepth === 0) drainObservers();
      }
    }

    function addClass(el, cls) {
      if (el && el.classList && !el.classList.contains(cls)) el.classList.add(cls);
    }
    function removeClass(el, cls) {
      if (el && el.classList && el.classList.contains(cls)) el.classList.remove(cls);
    }
    function setDir(el, dir) {
      if (el && el.getAttribute && el.getAttribute('dir') !== dir) el.setAttribute('dir', dir);
    }
    function removeDir(el) {
      if (el && el.hasAttribute && el.hasAttribute('dir')) el.removeAttribute('dir');
    }
    function previewElement(el) {
      if (!RTL_PREVIEW_SEL || !el || !el.closest) return false;
      return el.matches && el.matches(RTL_PREVIEW_SEL) ? el : el.closest(RTL_PREVIEW_SEL);
    }
    function codeBlockRoot(el) {
      // Codex wraps fenced blocks in [data-markdown-copy="code-block"]; Claude
      // wraps them in a hashed [class*="codeBlockWrapper_"] with NO copy attribute
      // and NO visible language label. Match either so both surfaces are covered.
      return el && el.closest ? el.closest('[data-markdown-copy="code-block"], [class*="codeBlockWrapper_"]') : null;
    }
    function isClaudeCodeBlock(block) {
      return !!(block && block.matches && block.matches('[class*="codeBlockWrapper_"]'));
    }
    function codeBlockClassLang(block) {
      // Claude exposes the fence language ONLY as <code class="language-xxx">; no
      // label node is rendered. '' means an unlabeled fence (plain prose) too.
      var code = block && block.querySelector ? (block.querySelector('pre code') || block.querySelector('code')) : null;
      if (!code || !code.className) return '';
      var m = String(code.className).match(/(?:^|\\s)language-([\\w+#.-]+)/i);
      return m ? m[1].toLowerCase() : '';
    }
    function codeBlockLabel(block) {
      // Codex renders the language as a visible header label node. Exact-match
      // only text/plaintext so a real-language label (javascript/bash/…) yields
      // '' and is treated as code, exactly as before.
      if (!block || !block.querySelectorAll) return '';
      var nodes = block.querySelectorAll('span, div');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.closest && node.closest('pre, code, kbd, samp, textarea, input, button')) continue;
        var value = String(node.textContent || '').trim().toLowerCase();
        if (value === 'text' || value === 'plaintext' || value === 'plain text' || value === 'txt') return value;
      }
      return '';
    }
    function isPlainTextLang(lang) {
      return lang === 'text' || lang === 'plaintext' || lang === 'plain text' || lang === 'txt';
    }
    function isPlainTextCodeBlock(block) {
      if (!block) return false;
      if (isClaudeCodeBlock(block)) {
        // No visible label: a KNOWN code language excludes the block; an
        // unlabeled fence ('') or an explicit text/plaintext fence is prose.
        var lang = codeBlockClassLang(block);
        return lang === '' || isPlainTextLang(lang);
      }
      // Codex / generic: only a literal text/plaintext header label counts as
      // prose. A real-language label or no label yields '' here -> stays LTR code.
      return isPlainTextLang(codeBlockLabel(block));
    }
    function syncCodeBlockRoot(el, dir) {
      var block = codeBlockRoot(el);
      if (!block) return;
      if (dir === 'rtl') {
        removeClass(block, 'fa-ltr-clean-text');
        addClass(block, 'fa-rtl-clean-text');
        setDir(block, 'rtl');
      } else if (dir === 'ltr') {
        removeClass(block, 'fa-rtl-clean-text');
        addClass(block, 'fa-ltr-clean-text');
        setDir(block, 'ltr');
      } else {
        removeClass(block, 'fa-rtl-clean-text');
        removeClass(block, 'fa-ltr-clean-text');
        removeDir(block);
      }
    }
    function previewText(el) {
      var preview = previewElement(el);
      if (!preview) return false;
      return String(preview.textContent || '').trim();
    }
    function isEligibleTextPreview(el) {
      var preview = previewElement(el);
      if (!preview) return false;
      var block = codeBlockRoot(preview);
      if (block && !isPlainTextCodeBlock(block)) return false;
      var value = previewText(preview);
      return !!value && RTL_SCRIPT.test(value) && !shouldKeepLtr(value);
    }
    function isRtlTextPreview(el) {
      return isEligibleTextPreview(el);
    }
    function isProtected(el) {
      return !!(el && el.closest && el.closest(CODE_SEL) && !isRtlTextPreview(el));
    }
    function isDynamicField(el) { return !!(el && el.matches && el.matches(DYNAMIC_FIELD_SEL)); }
    function dynamicFieldOwner(el) {
      if (!el || !el.closest) return null;
      return isDynamicField(el) ? el : el.closest(DYNAMIC_FIELD_SEL);
    }
    function isInsideDynamicField(el) { return !!dynamicFieldOwner(el); }
    function controlText(el) {
      if (!el) return '';
      if (typeof el.value === 'string') return el.value;
      return el.textContent || '';
    }
    function dynamicText(el) {
      if (!el) return '';
      if (isDynamicField(el)) return controlText(el);
      if (!el.querySelector) return '';
      var field = el.querySelector(DYNAMIC_FIELD_SEL);
      return controlText(field);
    }
    function dynamicFields(el) {
      var fields = [];
      if (!el) return fields;
      if (isDynamicField(el)) fields.push(el);
      if (el.querySelectorAll) {
        el.querySelectorAll(DYNAMIC_FIELD_SEL).forEach(function (field) {
          if (fields.indexOf(field) === -1) fields.push(field);
        });
      }
      return fields;
    }
    function clearDynamicFields(el, forceLtr) {
      dynamicFields(el).forEach(function (field) {
        removeClass(field, CLEAN_CLASS);
        removeClass(field, 'fa-text-clean');
        removeClass(field, 'fa-rtl-clean');
        removeClass(field, 'fa-ltr-clean');
        if (forceLtr) setDir(field, 'ltr');
        else removeDir(field);
      });
    }
    function applyDynamicFields(el, dir) {
      dynamicFields(el).forEach(function (field) {
        addClass(field, 'fa-text-clean');
        setDir(field, dir);
        if (dir === 'rtl') {
          addClass(field, CLEAN_CLASS);
          addClass(field, 'fa-rtl-clean');
          removeClass(field, 'fa-ltr-clean');
        } else {
          removeClass(field, CLEAN_CLASS);
          removeClass(field, 'fa-rtl-clean');
          addClass(field, 'fa-ltr-clean');
        }
      });
    }
    function isStandaloneUrlOrEmail(text) {
      var value = String(text || '').trim();
      return /^(?:https?:\\/\\/|www\\.)[^\\s<>()]+$/i.test(value) ||
        /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$/i.test(value);
    }
    function shouldKeepLtr(text) {
      var value = String(text || '').trim();
      return isStandaloneUrlOrEmail(value) || /^(\\$|>|#)\\s+\\S/.test(value) || /^diff --git\\b/m.test(value) || /^@@\\s/m.test(value) || /^[+-](?![+-])\\S?/m.test(value);
    }
    function looksCodeLikePreview(text) {
      var value = String(text || '').trim();
      if (!value) return false;
      if (shouldKeepLtr(value)) return true;
      // Do not classify ordinary prose from a single English keyword. In
      // particular, "Update افزونه ..." is prose, not an SQL UPDATE statement.
      // Require language syntax or a recognisable SQL phrase before forcing LTR.
      if (/^\\s*(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*(?:[=:;]|$)/.test(value)) return true;
      if (/^\\s*(?:function|if|for|while|switch|catch)\\b[^\\n]*(?:\\(|\\{)/i.test(value)) return true;
      if (/^\\s*class\\s+[A-Za-z_$][\\w$]*/i.test(value)) return true;
      if (/^\\s*(?:type|interface|enum)\\s+[A-Za-z_$][\\w$]*\\s*(?:[={]|extends\\b)/i.test(value)) return true;
      if (/^\\s*def\\s+[A-Za-z_][\\w]*\\s*\\(/i.test(value)) return true;
      if (/^\\s*(?:from\\s+[A-Za-z_.]+\\s+import|import\\s+[A-Za-z_@])/i.test(value)) return true;
      if (/^\\s*select\\b[\\s\\S]*\\bfrom\\b/i.test(value)) return true;
      if (/^\\s*insert\\s+into\\b/i.test(value)) return true;
      if (/^\\s*update\\s+[A-Za-z_][\\w."-]*\\s+set\\b/i.test(value)) return true;
      if (/^\\s*delete\\s+from\\b/i.test(value)) return true;
      if (/^\\s*(?:create|alter|drop)\\s+(?:table|index|database|view)\\b/i.test(value)) return true;
      if (/^\\s*(?:\\/[^\\s]+\\/|\\.\\.?\\/|~\\/|[A-Za-z]:[\\\\/])/.test(value)) return true;
      if (/^\\s*[\\w.-]+\\/\\S*\\.[A-Za-z0-9]{1,8}\\b/.test(value)) return true;
      var rtlIndex = value.search(RTL_LETTER);
      var prefix = rtlIndex >= 0 ? value.slice(0, rtlIndex) : value;
      if (
        prefix.indexOf('=') !== -1 ||
        prefix.indexOf(';') !== -1 ||
        prefix.indexOf('(') !== -1 ||
        prefix.indexOf('[') !== -1 ||
        prefix.indexOf('{') !== -1 ||
        prefix.indexOf('"') !== -1 ||
        prefix.indexOf("'") !== -1 ||
        prefix.indexOf('\\x60') !== -1 ||
        prefix.indexOf('<') !== -1 ||
        prefix.indexOf('>') !== -1
      ) return true;
      return false;
    }
    function shouldTagPreviewRtl(text) {
      var value = String(text || '').trim();
      if (!value || !RTL_SCRIPT.test(value)) return false;
      if (isStandaloneUrlOrEmail(value)) return false;
      if (looksCodeLikePreview(value)) return false;
      return firstStrongDir(value) === 'rtl';
    }
    function shouldForceLtrText(text) {
      var value = String(text || '').trim();
      return STATUS_LTR.test(value);
    }
    function clearRtlState(el) {
      removeClass(el, CLEAN_CLASS);
      removeClass(el, 'fa-text-clean');
      removeClass(el, 'fa-rtl-clean');
      removeClass(el, 'fa-ltr-clean');
      removeDir(el);
      syncNearestList(el);
    }
    function applyLtrState(el) {
      removeClass(el, CLEAN_CLASS);
      removeClass(el, 'fa-text-clean');
      removeClass(el, 'fa-rtl-clean');
      addClass(el, 'fa-ltr-clean');
      setDir(el, 'ltr');
      syncNearestList(el);
    }
    function nearestList(el) {
      if (!el || !el.closest) return null;
      var li = el.matches && el.matches('li') ? el : el.closest('li');
      if (!li || !li.parentElement || !li.parentElement.matches) return null;
      return li.parentElement.matches('ol,ul') ? li.parentElement : null;
    }
    function setOwnedListFont(el, enabled) {
      if (!el || !el.style) return;
      if (enabled) {
        el.style.setProperty('font-family', LIST_FONT_VALUE, 'important');
      } else if (el.style.getPropertyValue('font-family').trim() === LIST_FONT_VALUE) {
        el.style.removeProperty('font-family');
      }
    }
    function applyListFontTree(item, enabled) {
      if (!item || !item.querySelectorAll) return;
      setOwnedListFont(item, enabled);
      item.querySelectorAll('p, div, span, strong, em, b, i, del, mark, small, sub, sup, a, label, button').forEach(function (node) {
        var protectedNode = isProtected(node) || !!(node.closest && node.closest('.fa-ltr-clean'));
        setOwnedListFont(node, enabled && !protectedNode);
      });
    }
    function syncList(list) {
      if (!list || !list.classList || !list.querySelector) return;
      var hasRtlItem = !!list.querySelector('li.fa-rtl-clean, li .' + CLEAN_CLASS + '[dir="rtl"], li .fa-rtl-clean');
      if (hasRtlItem) {
        addClass(list, 'fa-rtl-clean');
        addClass(list, 'fa-text-clean');
        setDir(list, 'rtl');
        setOwnedListFont(list, true);
      } else {
        removeClass(list, 'fa-rtl-clean');
        removeClass(list, 'fa-text-clean');
        if (!list.classList.contains(CLEAN_CLASS)) removeDir(list);
        setOwnedListFont(list, false);
      }
      list.querySelectorAll('li').forEach(function (item) {
        var itemRtl = item.classList.contains('fa-rtl-clean') || item.getAttribute('dir') === 'rtl' ||
          !!item.querySelector('.' + CLEAN_CLASS + '[dir="rtl"], .fa-rtl-clean');
        applyListFontTree(item, itemRtl);
      });
    }
    function syncNearestList(el) {
      syncList(nearestList(el));
    }
    function textOutsideProtected(el) {
      if (!el) return '';
      var out = '';
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.parentElement || isProtected(node.parentElement)) return NodeFilter.FILTER_REJECT;
          // The agent owns every node below its textarea/contenteditable. Static
          // transcript scans must never classify or rewrite an in-progress draft.
          if (!isDynamicField(el) && isInsideDynamicField(node.parentElement)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement.classList && node.parentElement.classList.contains(MIRROR_CLASS)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var node;
      while ((node = walker.nextNode())) out += ' ' + node.nodeValue;
      return out;
    }
    function strongCounts(text) {
      var counts = { rtl: 0, latin: 0 };
      var value = String(text || '');
      for (var i = 0; i < value.length; i++) {
        var ch = value[i];
        if (RTL_LETTER.test(ch)) counts.rtl++;
        else if (LATIN_STRONG.test(ch)) counts.latin++;
      }
      return counts;
    }
    function isRtlDominantMixedProse(text) {
      var value = String(text || '').trim();
      if (!RTL_SCRIPT.test(value)) return false;
      var counts = strongCounts(value);
      if (counts.rtl < 2) return false;
      return counts.rtl >= Math.max(2, counts.latin * 0.35);
    }
    function firstStrongDir(text) {
      if (shouldKeepLtr(text)) return 'ltr';
      return firstStrongMixedDir(text);
    }
    function editableFirstStrongDir(text) {
      var value = String(text || '');
      for (var i = 0; i < value.length; i++) {
        var ch = value[i];
        if (RTL_LETTER.test(ch)) return 'rtl';
        if (LATIN_STRONG.test(ch)) return 'ltr';
      }
      return RTL_SCRIPT.test(value) ? 'rtl' : 'ltr';
    }
    function firstStrongMixedDir(text) {
      var value = String(text || '');
      for (var i = 0; i < value.length; i++) {
        var ch = value[i];
        if (RTL_LETTER.test(ch)) return 'rtl';
        if (LATIN_STRONG.test(ch)) {
          if (!looksCodeLikePreview(value) && isRtlDominantMixedProse(value)) return 'rtl';
          return 'ltr';
        }
      }
      return RTL_SCRIPT.test(text) ? 'rtl' : 'ltr';
    }
    function stripArrows(text) { return String(text || '').replace(ARROW_CHARS_RE, ''); }
    function immediateToken(text, leftSlice) {
      var stripped = stripArrows(text);
      var match = leftSlice ? stripped.match(/(\\S+)\\s*$/) : stripped.match(/^\\s*(\\S+)/);
      return match ? match[1] : '';
    }
    function tokenKind(token) {
      if (!token) return null;
      if (URL.test(token) || EMAIL.test(token)) return 'protected-ltr';
      return RTL_LETTER.test(token) ? 'prose-rtl' : 'prose-ltr';
    }
    function shouldMirrorText(text, offset, length) {
      var left = tokenKind(immediateToken(text.slice(0, offset), true));
      var right = tokenKind(immediateToken(text.slice(offset + length), false));
      return left === 'prose-rtl' || right === 'prose-rtl';
    }
    function wrapArrows(root) {
      if (!root || !root.querySelectorAll) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          ARROW_RE.lastIndex = 0;
          if (!ARROW_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          ARROW_RE.lastIndex = 0;
          var parent = node.parentElement;
          if (!parent || isProtected(parent) || isInsideDynamicField(parent)) return NodeFilter.FILTER_REJECT;
          if (parent.classList && parent.classList.contains(MIRROR_CLASS)) return NodeFilter.FILTER_REJECT;
          if (flipAttempts && (flipAttempts.get(parent) || 0) >= 10) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var nodes = [], node;
      while ((node = walker.nextNode())) nodes.push(node);
      nodes.forEach(function (textNode) {
        var text = textNode.nodeValue;
        var parent = textNode.parentElement;
        var fragment = document.createDocumentFragment();
        var changed = false;
        var last = 0;
        var match;
        ARROW_RE.lastIndex = 0;
        while ((match = ARROW_RE.exec(text))) {
          if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
          if (shouldMirrorText(text, match.index, match[1].length)) {
            var span = document.createElement('span');
            span.className = MIRROR_CLASS;
            span.textContent = match[1];
            fragment.appendChild(span);
            changed = true;
          } else {
            fragment.appendChild(document.createTextNode(match[1]));
          }
          last = match.index + match[1].length;
        }
        if (!changed) return;
        if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
        if (flipAttempts && parent) flipAttempts.set(parent, (flipAttempts.get(parent) || 0) + 1);
        if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
      });
    }
    function shouldWatchTextLeaf(el) {
      if (!el || !el.classList || el.__persianRtlCleanWatched) return false;
      if (isProtected(el) || isDynamicField(el) || isInsideDynamicField(el)) return false;
      var text = textOutsideProtected(el) || el.textContent || '';
      if (!String(text || '').trim()) return false;
      if (!RTL_SCRIPT.test(text) && !shouldForceLtrText(text)) return false;
      if (hasRtlChildBlock(el) && !hasOwnDirectRtlText(el) && !isSemanticTextBlock(el)) return false;
      return true;
    }
    function watchTextLeaves(container) {
      if (!container || !container.querySelectorAll) return;
      container.querySelectorAll(TEXT_LEAF_SEL).forEach(function (el) {
        if (shouldWatchTextLeaf(el)) watch(el);
      });
    }
    function applyText(el, dynamic) {
      // Wrap the whole pass as one write phase: every class/dir/childList write it
      // makes (incl. wrapArrows + watchTable, which nest under this depth) is
      // drained from all observers at depth 0 so applyText cannot re-trigger its
      // own per-element observer or the root observer.
      return doWrite(function () { return applyTextImpl(el, dynamic); });
    }
    function applyTextImpl(el, dynamic) {
      if (!el || !el.classList || (!dynamic && isProtected(el))) return;
      var text = dynamic ? dynamicText(el) : '';
      if (!text) text = textOutsideProtected(el) || el.textContent || '';
      var forceRtl = el.classList.contains(FORCE_RTL_CLASS);
      var forceLtr = el.classList.contains(FORCE_LTR_CLASS);
      var cardOption = isCardOption(el) || isBareApprovalOption(el);
      var userMessage = !!(el.matches && el.matches(USER_MESSAGE_SEL)) ||
        !!(el.matches && el.matches('.whitespace-pre-wrap, .text-token-conversation-body') && el.closest && el.closest(USER_MESSAGE_SEL));
      var preview = !dynamic ? previewElement(el) : null;
      var previewBlock = preview ? codeBlockRoot(preview) : null;
      var eligiblePreview = !dynamic && isEligibleTextPreview(el);
      var previewRtl = eligiblePreview && shouldTagPreviewRtl(previewText(el));
      if (!dynamic && !forceRtl && !forceLtr && previewBlock && !isPlainTextCodeBlock(previewBlock)) {
        applyLtrState(el);
        syncCodeBlockRoot(el, 'ltr');
        return;
      }
      if (!dynamic && !forceRtl && !forceLtr && eligiblePreview && !previewRtl) {
        applyLtrState(el);
        syncCodeBlockRoot(el, 'ltr');
        return;
      }
      if (!dynamic && !forceRtl && !forceLtr && !cardOption && !userMessage && !eligiblePreview && hasRtlChildBlock(el) && !hasOwnDirectRtlText(el) && !isSemanticTextBlock(el)) {
        clearRtlState(el);
        watchTextLeaves(el);
        return;
      }
      var persian = forceRtl || (!forceLtr && RTL_SCRIPT.test(text));
      if (!persian) {
        if (!dynamic && shouldForceLtrText(text)) {
          applyLtrState(el);
          return;
        }
        if (dynamic || forceLtr) {
          removeClass(el, CLEAN_CLASS);
          removeClass(el, 'fa-text-clean');
          if (!forceLtr) removeDir(el);
          if (dynamic) clearDynamicFields(el, forceLtr);
        }
        if (forceLtr) setDir(el, 'ltr');
        syncCodeBlockRoot(el, forceLtr ? 'ltr' : null);
        return;
      }
      // Composer text is user/editor-owned prose. Its base direction follows
      // the literal first strong character; rendered transcript prose retains
      // the more forgiving Persian-dominance heuristic.
      var dir = (forceRtl || cardOption || previewRtl)
        ? 'rtl'
        : (dynamic ? editableFirstStrongDir(text) : firstStrongDir(text));
      removeClass(el, 'fa-ltr-clean');
      addClass(el, 'fa-text-clean');
      setDir(el, dir);
      if (dir === 'rtl') {
        addClass(el, CLEAN_CLASS);
        addClass(el, 'fa-rtl-clean');
      } else if (dynamic) {
        // CLEAN_CLASS is a legacy RTL class whose stylesheet uses !important.
        // Keeping it on an English-first mixed draft makes CSS contradict the
        // correct dir=ltr attribute and visually scrambles typing.
        removeClass(el, CLEAN_CLASS);
        removeClass(el, 'fa-rtl-clean');
        addClass(el, 'fa-ltr-clean');
      } else {
        addClass(el, CLEAN_CLASS);
        removeClass(el, 'fa-rtl-clean');
      }
      syncCodeBlockRoot(el, previewRtl && dir === 'rtl' ? 'rtl' : null);
      syncNearestList(el);
      if (dynamic) applyDynamicFields(el, dir);
      // Never replace text nodes inside textarea/contenteditable editors. Rich
      // paste and editor frameworks keep live Range/selection references to
      // those nodes; replacing one can crash or disable the agent composer.
      if (!dynamic) wrapArrows(el);
      if (el.querySelectorAll) el.querySelectorAll('table').forEach(watchTable);
    }
    function watch(el) {
      if (!el || !el.classList || el.__persianRtlCleanWatched) return;
      var dynamic = !!(el.matches && el.matches(DYNAMIC_SEL));
      if (!dynamic && isInsideDynamicField(el)) return;
      el.__persianRtlCleanWatched = true;
      var scheduled = false;
      function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
          scheduled = false;
          applyText(el, dynamic);
        });
      }
      applyText(el, dynamic);
      // The root observer handles streamed DOM/text/attribute updates for static
      // prose. Avoid one MutationObserver per text node: long Claude threads can
      // contain hundreds of watched blocks, and draining all of those observers on
      // every composer keystroke makes typing latency scale with chat history.
      if (dynamic) {
        el.__persianRtlCleanSchedule = schedule;
        el.addEventListener('input', schedule, true);
        el.addEventListener('change', schedule, true);
        el.addEventListener('keyup', schedule, true);
      }
    }
    function isCardOption(el) {
      if (!CARD_SEL || !OPTION_SEL || !el || !el.matches || !el.matches(OPTION_SEL)) return false;
      if (el.matches(CARD_SEL)) return true;
      return !!(el.closest && el.closest(CARD_SEL));
    }
    function hasClassToken(el, token) {
      return !!(el && el.classList && el.classList.contains(token));
    }
    function isBareOptionPickerPill(el) {
      if (!APPROVAL_OPTION_SEL || !el || !el.matches || !el.matches(APPROVAL_OPTION_SEL)) return false;
      if (APPROVAL_SURFACE_SEL && el.closest && el.closest(APPROVAL_SURFACE_SEL)) return false;
      if (APPROVAL_GROUP_SEL && el.closest && el.closest(APPROVAL_GROUP_SEL)) return false;
      if ((el.tagName || '').toLowerCase() !== 'button') return false;
      if (el.getAttribute('type') && el.getAttribute('type') !== 'button') return false;
      var group = el.parentElement;
      if (!group) return false;
      // Active Codex option_picker renders pills inside a form child with this
      // cluster shape. Keep the bare role fallback out of unrelated controls.
      if (!hasClassToken(group, 'flex') || !hasClassToken(group, 'flex-wrap') || !hasClassToken(group, 'gap-2')) return false;
      if (!group.parentElement || (group.parentElement.tagName || '').toLowerCase() !== 'form') return false;
      if (!hasClassToken(el, 'rounded-full') || !hasClassToken(el, 'border') || !hasClassToken(el, 'text-sm')) return false;
      return true;
    }
    function isBareApprovalOption(el) {
      // A bare option_picker pill: matches an option role but lives outside any
      // surface/radiogroup card. Treated as a card-option so a Persian-containing
      // pill is forced RTL (indicator stays on the correct side) even when its
      // label starts with a Latin word or number. English-only pills never reach
      // the RTL branch (applyText gates on RTL_SCRIPT), so they stay LTR.
      return isBareOptionPickerPill(el);
    }
    function isSemanticTextBlock(el) {
      return !!(el && el.matches && el.matches(SEMANTIC_TEXT_BLOCK_SEL));
    }
    function hasRtlChildBlock(el) {
      if (!el || !el.children) return false;
      for (var i = 0; i < el.children.length; i++) {
        var child = el.children[i];
        if (child.classList && child.classList.contains(MIRROR_CLASS)) continue;
        if (isProtected(child)) continue;
        if (RTL_SCRIPT.test(textOutsideProtected(child))) return true;
      }
      return false;
    }
    function hasOwnDirectRtlText(el) {
      if (!el || !el.childNodes) return false;
      for (var i = 0; i < el.childNodes.length; i++) {
        var node = el.childNodes[i];
        if (node.nodeType === 3 && RTL_SCRIPT.test(node.nodeValue || '')) return true;
      }
      return false;
    }
    function watchCard(card) {
      if (!card || !card.querySelectorAll) return;
      // 1) option rows: watching the row flips its flex layout so the
      //    radio/checkbox indicator sits on the correct side for RTL labels.
      if (OPTION_SEL) card.querySelectorAll(OPTION_SEL).forEach(watch);
      // 2) explicit text blocks (markdown body, list items, headings).
      card.querySelectorAll(CARD_TEXT_SEL).forEach(watch);
      // 3) generic leaf blocks (question, labels, descriptions) that carry
      //    Persian text but have no stable class. Prefer the innermost block,
      //    but still style an element that holds its OWN direct Persian text
      //    even when it also wraps a Persian child block (e.g. a question that
      //    sits directly above its options) so the question is never missed.
      card.querySelectorAll(CARD_LEAF_SEL).forEach(function (el) {
        if (!el || el.__persianRtlCleanWatched) return;
        if (isProtected(el)) return;
        if (OPTION_SEL && el.closest && el.closest(OPTION_SEL)) return;
        if (!RTL_SCRIPT.test(textOutsideProtected(el))) return;
        if (hasRtlChildBlock(el) && !hasOwnDirectRtlText(el)) return;
        watch(el);
      });
    }
    function approvalGroupFallback(group) {
      // Only runs when the surface attribute has drifted away: treat the option
      // group's container as a card so the Persian question/description that sits
      // ABOVE the options (outside the group, so watchCard(group) alone would
      // miss it) still flips RTL. Gated by closest(APPROVAL_SURFACE_SEL) so the
      // normal, surface-present path is a strict no-op and behavior never changes.
      if (!group) return;
      if (APPROVAL_SURFACE_SEL && group.closest && group.closest(APPROVAL_SURFACE_SEL)) return;
      if (group.parentElement) watchCard(group.parentElement);
    }
    function scanApprovalGroups(root) {
      // Mirror scanCards' three entry points (descendants, self, host) so the
      // fallback also fires when a bare group is itself the streamed-in node.
      if (!APPROVAL_GROUP_SEL || !root) return;
      if (root.querySelectorAll) root.querySelectorAll(APPROVAL_GROUP_SEL).forEach(approvalGroupFallback);
      if (root.matches && root.matches(APPROVAL_GROUP_SEL)) approvalGroupFallback(root);
      var hostGroup = root.closest && root.closest(APPROVAL_GROUP_SEL);
      if (hostGroup) approvalGroupFallback(hostGroup);
    }
    function bareOptionFallback(opt) {
      // Fires only for an option that is NOT inside the stable surface AND NOT
      // inside a radiogroup -- i.e. the streamed option_picker whose pills are
      // bare role="radio"/"checkbox" in a plain flex container. Persian-gated by
      // watchCard -> applyText downstream, so English groups stay LTR; groups
      // that use role="radiogroup" (settings, feedback) are excluded outright,
      // and surface/radiogroup options are already handled by scanCards.
      if (!isBareOptionPickerPill(opt)) return;
      var group = opt.parentElement;
      if (!group) return;
      // The option cluster flips each pill's label + flex layout; its parent is
      // the card that also holds the Persian question sitting above the pills.
      watchCard(group);
      if (group.parentElement) watchCard(group.parentElement);
    }
    function scanBareOptions(root) {
      // Mirror scanApprovalGroups' three entry points (descendants, self, host)
      // so a bare option streamed in as the top-level node is still caught.
      if (!APPROVAL_OPTION_SEL || !root) return;
      if (root.querySelectorAll) root.querySelectorAll(APPROVAL_OPTION_SEL).forEach(bareOptionFallback);
      if (root.matches && root.matches(APPROVAL_OPTION_SEL)) bareOptionFallback(root);
      var hostOpt = root.closest && root.closest(APPROVAL_OPTION_SEL);
      if (hostOpt) bareOptionFallback(hostOpt);
    }
    function scanCards(root) {
      if (!CARD_SEL || !root) return;
      if (root.querySelectorAll) root.querySelectorAll(CARD_SEL).forEach(watchCard);
      if (root.matches && root.matches(CARD_SEL)) watchCard(root);
      var hostCard = root.closest && root.closest(CARD_SEL);
      if (hostCard) watchCard(hostCard);
      scanApprovalGroups(root);
      scanBareOptions(root);
    }
    function closestMatch(el, selector) {
      if (!selector || !el || !el.closest) return null;
      return el.matches && el.matches(selector) ? el : el.closest(selector);
    }
    function addUnique(list, item) {
      if (item && list.indexOf(item) === -1) list.push(item);
    }
    function scanMutationTarget(target) {
      return doWrite(function () { return scanMutationTargetImpl(target); });
    }
    function scanMutationTargetImpl(target) {
      var el = target && target.nodeType === 1 ? target : target && target.parentElement;
      if (!el) return;
      // A rich paste can add dozens of nodes in one editor transaction. Treat the
      // nearest dynamic composer as one opaque field and coalesce a direction
      // refresh; recursively scanning each pasted node is both unsafe and O(n²).
      var editor = closestMatch(el, DYNAMIC_SEL);
      if (editor) {
        if (!editor.__persianRtlCleanWatched) watch(editor);
        else if (editor.__persianRtlCleanSchedule) editor.__persianRtlCleanSchedule();
        return;
      }
      var candidates = [];
      addUnique(candidates, el);
      addUnique(candidates, closestMatch(el, TEXT_SEL));
      addUnique(candidates, closestMatch(el, DYNAMIC_SEL));
      addUnique(candidates, closestMatch(el, RTL_PREVIEW_SEL));
      addUnique(candidates, closestMatch(el, CARD_SEL));
      addUnique(candidates, closestMatch(el, APPROVAL_GROUP_SEL));
      addUnique(candidates, closestMatch(el, APPROVAL_OPTION_SEL));
      addUnique(candidates, el.parentElement);
      candidates.forEach(function (node) {
        if (!node || !node.querySelectorAll) return;
        if (node.matches && node.matches(TEXT_SEL + ',' + DYNAMIC_SEL)) {
          if (node.__persianRtlCleanWatched) applyText(node, !!node.matches(DYNAMIC_SEL));
          else watch(node);
        }
        if (RTL_PREVIEW_SEL && node.matches && node.matches(RTL_PREVIEW_SEL)) {
          if (node.__persianRtlCleanWatched) applyText(node, false);
          else watch(node);
        }
        if (
          node.__persianRtlCleanWatched &&
          node.matches &&
          node.matches(TEXT_LEAF_SEL) &&
          !isInsideDynamicField(node)
        ) {
          // Codex can rewrite className when it replaces the streaming renderer
          // with the final Markdown renderer. A watched leaf still needs its
          // clean classes restored after that external attribute mutation.
          applyText(node, false);
        } else if (shouldWatchTextLeaf(node)) {
          if (node.__persianRtlCleanWatched) applyText(node, false);
          else watch(node);
        }
        scan(node);
      });
    }
    function cellDir(cell) {
      // Per-cell first-strong direction. A Persian-prose cell flips RTL; an
      // English / code-like / URL / path cell stays LTR. This keeps mixed tables
      // readable (Persian cells RTL, command/path cells LTR) instead of forcing
      // the whole table one way.
      var text = textOutsideProtected(cell) || (cell && cell.textContent) || '';
      if (!String(text).trim() || !RTL_SCRIPT.test(text)) return 'ltr';
      if (shouldKeepLtr(text)) return 'ltr';
      return firstStrongDir(text);
    }
    function tagTable(table) {
      return doWrite(function () { return tagTableImpl(table); });
    }
    function tagTableImpl(table) {
      if (!table || !table.querySelectorAll) return;
      // The table element itself stays LTR so the column order is preserved; only
      // each cell's text direction is decided independently. The CSS keeps
      // .fa-table-clean tables LTR while th/td[dir="rtl"] flip their own content.
      setDir(table, 'ltr');
      addClass(table, 'fa-table-clean');
      table.querySelectorAll('th, td').forEach(function (cell) {
        var dir = cellDir(cell);
        setDir(cell, dir);
        if (dir === 'rtl') {
          addClass(cell, CLEAN_CLASS);
          addClass(cell, 'fa-rtl-clean');
          removeClass(cell, 'fa-ltr-clean');
        } else {
          removeClass(cell, CLEAN_CLASS);
          removeClass(cell, 'fa-rtl-clean');
        }
      });
    }
    function watchTable(table) {
      if (!table || table.__persianRtlCleanTableWatched || isInsideDynamicField(table)) return;
      table.__persianRtlCleanTableWatched = true;
      tagTable(table);
      // The root observer re-tags streamed table cells; avoid a table-scoped
      // observer per table for the same reason watch() avoids per-node observers.
    }
    function scanTables(root) {
      if (!root) return;
      if (root.querySelectorAll) root.querySelectorAll('table').forEach(watchTable);
      if (root.matches && root.matches('table')) watchTable(root);
      var hostTable = root.closest && root.closest('table');
      if (hostTable) watchTable(hostTable);
    }
    function scan(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll(TEXT_SEL + ',' + DYNAMIC_SEL).forEach(function (el) {
        if ((el.matches && el.matches(DYNAMIC_SEL)) || !isInsideDynamicField(el)) watch(el);
      });
      root.querySelectorAll(TEXT_SEL).forEach(watchTextLeaves);
      if (RTL_PREVIEW_SEL) {
        root.querySelectorAll(RTL_PREVIEW_SEL).forEach(watch);
        if (root.matches && root.matches(RTL_PREVIEW_SEL)) watch(root);
      }
      scanTables(root);
      scanCards(root);
      root.querySelectorAll('a').forEach(function (a) {
        if (!isInsideDynamicField(a) && isStandaloneUrlOrEmail(a.textContent || '')) a.classList.add('fa-ltr-clean');
      });
      root.querySelectorAll('diffs-container').forEach(function (host) {
        if (!host.shadowRoot) return;
        // The file-create / file-write preview renders its content inside this
        // custom element's shadow root as [data-line] rows, styled by an adopted
        // stylesheet that forces a monospace font (--diffs-font-family). A page
        // stylesheet cannot reach into the shadow root, so Vazirmatn never lands
        // on a Persian plaintext file preview. We tag the Persian lines and let a
        // shadow-scoped rule give them Vazirmatn + RTL; the persian font var is
        // inherited from #root through the shadow boundary. Code/LTR lines stay
        // monospace and untouched.
        function shouldTagShadowLineRtl(text) {
          return shouldTagPreviewRtl(text);
        }
        function tagLines() {
          return doWrite(function () {
            host.shadowRoot.querySelectorAll('[data-line]').forEach(function (line) {
              var text = line.textContent || '';
              if (shouldTagShadowLineRtl(text)) addClass(line, 'fa-rtl-clean');
              else removeClass(line, 'fa-rtl-clean');
            });
          });
        }
        if (!host.__persianRtlCleanShadowStyled) {
          host.__persianRtlCleanShadowStyled = true;
          var style = document.createElement('style');
          style.textContent = 'pre, code, pre *, code * { direction:ltr !important; text-align:left !important; unicode-bidi:isolate !important; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important; }'
            + ' [data-line], [data-line] * { unicode-bidi: plaintext; }'
            + ' [data-line].fa-rtl-clean, [data-line].fa-rtl-clean * { font-family: var(--persian-rtl-clean-font-family, ${FONT_STACK}) !important; direction: rtl !important; text-align: right !important; unicode-bidi: plaintext !important; }';
          host.shadowRoot.appendChild(style);
          // Diff lines stream in after the host mounts; re-tag as the shadow grows.
          registerObserver(new MutationObserver(tagLines)).observe(host.shadowRoot, { childList: true, subtree: true, characterData: true });
        }
        tagLines();
      });
    }
    function boot() {
      var root = ${rootSelector};
      if (root === document) root = document.body || document.documentElement;
      if (!root) { setTimeout(boot, 300); return; }
      scan(root);
      registerObserver(new MutationObserver(function (muts) {
        doWrite(function () {
          for (var i = 0; i < muts.length; i++) {
            if (muts[i].type === 'characterData' || muts[i].type === 'attributes') {
              scanMutationTarget(muts[i].target);
            }
            for (var j = 0; j < muts[i].addedNodes.length; j++) {
              var node = muts[i].addedNodes[j];
              if (node.nodeType !== 1) {
                scanMutationTarget(node);
                continue;
              }
              scanMutationTarget(node);
            }
          }
        });
      })).observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'class',
          'role',
          'dir',
          'style',
          'id',
          'data-codex-approval-surface',
          'data-codex-composer',
          'data-local-conversation-user-anchor',
          'data-local-conversation-final-assistant',
          'data-user-message-bubble',
          'data-thread-title',
          'data-markdown-animated',
          'data-markdown-copy',
        ],
      });
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Shift' || !event.ctrlKey) return;
        var target = event.code === 'ShiftRight' ? 'rtl' : event.code === 'ShiftLeft' ? 'ltr' : null;
        if (!target) return;
        var active = document.activeElement;
        var composer = active && active.matches && (active.matches(DYNAMIC_SEL) ? active : active.closest(DYNAMIC_SEL));
        if (!composer) return;
        var cls = target === 'rtl' ? FORCE_RTL_CLASS : FORCE_LTR_CLASS;
        var other = target === 'rtl' ? FORCE_LTR_CLASS : FORCE_RTL_CLASS;
        if (composer.classList.contains(cls)) composer.classList.remove(cls);
        else {
          composer.classList.remove(other);
          composer.classList.add(cls);
        }
      }, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } catch (error) {
    try { console.error('[persian-rtl-clean ${logName}]', error); } catch (_) {}
  }
}());`;
}

function buildClaudeCss() {
  return `${MARKERS.claudeCssStart}
${fontFaceCss({ prefix: './persian-rtl-clean/' })}
${commonScopedCss('#root')}
/* AskUserQuestion renders its title and role-based choices inside Claude's
   permission-request surface. The option row itself is the flex container, so
   forcing its base direction to RTL also moves the radio/checkbox indicator to
   the right. CSS-module suffixes change between releases; semantic prefixes do
   not. */
#root [class*="permissionRequestContent_"] .${CLEAN_CLASS},
#root [class*="questionBlock_"] .${CLEAN_CLASS},
#root [class*="questionBlock_"] [role="radio"].${CLEAN_CLASS},
#root [class*="questionBlock_"] [role="checkbox"].${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root [class*="messageInput_"].${CLEAN_CLASS},
#root [class*="mentionMirror_"].${CLEAN_CLASS},
#root [class*="messageInput_"].${FORCE_RTL_CLASS},
#root [class*="mentionMirror_"].${FORCE_RTL_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root [class*="messageInput_"].${FORCE_LTR_CLASS},
#root [class*="mentionMirror_"].${FORCE_LTR_CLASS} {
  direction: ltr !important;
  text-align: left !important;
  font-family: var(--vscode-font-family, inherit) !important;
  unicode-bidi: isolate !important;
}
#root [class*="userMessageContainer_"].${CLEAN_CLASS} {
  align-items: flex-end !important;
  text-align: right !important;
}
#root [class*="userMessage_"].${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root [class*="userMessageContainer_"].${FORCE_LTR_CLASS} {
  align-items: flex-start !important;
  text-align: left !important;
}
#root [class*="toolBodyRowContent_"] pre.fa-rtl-clean,
#root [class*="toolBodyPlainText_"].fa-rtl-clean,
#root [class*="timelineMessage_"] pre.fa-rtl-clean {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: plaintext !important;
}
#root [class*="toolBodyRowContent_"] pre .${CLEAN_CLASS}:not(code):not(pre):not(kbd):not(samp),
#root [class*="toolBodyPlainText_"] .${CLEAN_CLASS}:not(code):not(pre):not(kbd):not(samp) {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: plaintext !important;
}
#root [class*="toolBodyRowContent_"] pre code.fa-rtl-clean,
#root [class*="toolBodyPlainText_"] code.fa-rtl-clean,
#root [class*="timelineMessage_"] pre code.fa-rtl-clean {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: plaintext !important;
}
#root [class*="toolBodyRowContent_"] pre.fa-ltr-clean,
#root [class*="toolBodyPlainText_"].fa-ltr-clean,
#root [class*="timelineMessage_"] pre.fa-ltr-clean,
#root [class*="timelineMessage_"] pre code.fa-ltr-clean {
  direction: ltr !important;
  text-align: left !important;
  font-family: var(--vscode-editor-font-family), monospace !important;
}
${MARKERS.claudeCssEnd}`;
}

function buildClaudeJs() {
  return `${MARKERS.claudeJsStart}
${runtimeJs({
    rootSelector: 'document.getElementById("root")',
    textSelector: '[class*="timelineMessage_"],[class*="userMessageContainer_"],[class*="userMessage_"],[class*="permissionRequestContainer_"],[class*="permissionsContainer_"],[class*="titleTextInner_"],[class*="sessionName_"]',
    dynamicSelector: '[class*="messageInput_"],[class*="mentionMirror_"]',
    inlineCodeSelector: '[class*="permissionPath_"],[class*="permissionRequestInput_"]',
    // Claude's AskUserQuestion tool is rendered by the normal permission
    // request component. Scope card semantics to that surface so Latin-first
    // mixed Persian choices are forced RTL, while unrelated settings radios
    // remain untouched. questionBlock_ is the direct current-bundle hook;
    // permissionRequestContent_ keeps the adapter resilient to inner DOM drift.
    cardSelector: '[class*="permissionRequestContent_"],[class*="questionBlock_"]',
    rtlPreviewSelector: '[class*="toolBodyRowContent_"] pre,[class*="toolBodyRowContent_"] pre code,[class*="toolBodyPlainText_"],[class*="toolBodyPlainText_"] code,[class*="timelineMessage_"] pre,[class*="timelineMessage_"] pre code,[class*="codeBlockWrapper_"] pre,[class*="codeBlockWrapper_"] pre code',
    logName: 'claude-code',
  })}
${MARKERS.claudeJsEnd}`;
}

function buildClaudePlanCss(source = {}) {
  return `<style>
${MARKERS.claudePlanCssStart}
${fontFaceCss(source)}
${commonScopedCss('#content')}
${MARKERS.claudePlanCssEnd}
</style>`;
}

function buildClaudePlanJs() {
  return `<script nonce="{{NONCE}}">
${MARKERS.claudePlanJsStart}
${runtimeJs({
    rootSelector: 'document.getElementById("content")',
    textSelector: 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th',
    dynamicSelector: 'textarea, input, [contenteditable="true"]',
    logName: 'claude-plan-preview',
  })}
${MARKERS.claudePlanJsEnd}
</script>`;
}

function buildCodexCss() {
  return `${MARKERS.codexCssStart}
${fontFaceCss({ prefix: './' })}
${commonScopedCss('#root')}
#root [data-codex-composer].${CLEAN_CLASS},
#root [data-codex-composer].${CLEAN_CLASS} p,
#root [data-codex-composer].${CLEAN_CLASS} textarea,
#root [data-codex-composer].${CLEAN_CLASS} input,
#root [data-codex-composer].${CLEAN_CLASS} [contenteditable="true"],
#root [data-codex-composer] textarea.${CLEAN_CLASS},
#root [data-codex-composer] input.${CLEAN_CLASS},
#root [data-codex-composer] [contenteditable="true"].${CLEAN_CLASS},
#root [class*="_markdownContent_"].${CLEAN_CLASS},
#root [data-thread-title="true"].${CLEAN_CLASS},
#root [id^="plan-item-"].${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root [data-local-conversation-user-anchor].${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: isolate !important;
}
/* The real visible user bubble carries a hardcoded \`text-left\`; without
   overriding it here the wrapped lines of a multi-line Persian prompt stay
   left-aligned and drift. The bubble's horizontal position in the row is set
   by an ancestor flex \`items-end\`, which already sits it on the user side, so
   we only flip the bubble's own text direction/alignment, not its placement. */
#root [data-user-message-bubble].${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root .whitespace-pre-wrap.${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
  width: 100% !important;
}
/* User-bubble prose text (a div.whitespace-pre-wrap, not a <p>): force a single
   RTL base direction with isolate so a long Persian prompt that also contains a
   Latin filename wraps as one stable RTL block instead of drifting per line the
   way plaintext (per-line auto-direction) does. */
#root [data-local-conversation-user-anchor] .whitespace-pre-wrap.${CLEAN_CLASS},
#root [data-user-message-bubble] .whitespace-pre-wrap.${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
  width: 100% !important;
}
#root p.whitespace-pre-wrap.${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
  width: 100% !important;
}
#root .text-token-conversation-body.${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root [class*="_markdownContent_"] :is(ol, ul).fa-rtl-clean,
#root [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean,
#root [data-local-conversation-final-assistant] :is(ol, ul).fa-rtl-clean,
#root [data-markdown-animated] :is(ol, ul).fa-rtl-clean,
#root .text-token-conversation-body :is(ol, ul).fa-rtl-clean,
#root .whitespace-pre-wrap :is(ol, ul).fa-rtl-clean,
#root :is(ol, ul).fa-rtl-clean {
  direction: rtl !important;
  text-align: right !important;
  padding-inline-start: 1.75em !important;
  padding-inline-end: 0 !important;
  padding-right: 1.75em !important;
  padding-left: 0 !important;
  list-style-position: outside !important;
}
/* Current Codex can attach its final Markdown typography after the streaming
   stylesheet and assign a font directly to <li> descendants. Anchor the final
   override to the real MarkdownRoot plus our RTL item hooks so it wins that
   late cascade without leaking into code/URL/LTR subtrees. */
#root [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li.fa-rtl-clean,
#root [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li[dir="rtl"],
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li.fa-rtl-clean,
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li[dir="rtl"],
#root [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li.fa-rtl-clean :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
#root [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li[dir="rtl"] :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li.fa-rtl-clean :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li[dir="rtl"] :not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *):not(kbd *):not(samp *):not(.fa-ltr-clean):not(.fa-ltr-clean *),
#root [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li::marker,
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean > li::marker {
  font-family: var(--persian-rtl-clean-font-family) !important;
}
/* Keep a simple-selector fallback for Chromium/jsdom engines that discard a
   whole rule containing complex :not(... *) selectors. Clean prose descendants
   are runtime-owned and never include protected code/URL nodes. Doubling the
   class also beats Codex's late final-render typography at equal importance. */
#root [class*="_MarkdownRoot_"] li.fa-rtl-clean .${CLEAN_CLASS}.${CLEAN_CLASS},
#root [class*="_MarkdownRoot_"] li[dir="rtl"] .${CLEAN_CLASS}.${CLEAN_CLASS},
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] li.fa-rtl-clean .${CLEAN_CLASS},
#root [data-local-conversation-final-assistant] [class*="_MarkdownRoot_"] li[dir="rtl"] .${CLEAN_CLASS} {
  font-family: var(--persian-rtl-clean-font-family) !important;
}
#root [data-local-conversation-user-anchor] .whitespace-pre-wrap.${CLEAN_CLASS} > span,
#root [data-local-conversation-user-anchor] .whitespace-pre-wrap.${CLEAN_CLASS} > a,
#root [data-local-conversation-user-anchor] .whitespace-pre-wrap.${CLEAN_CLASS} > button,
#root .text-token-conversation-body.${CLEAN_CLASS} > span,
#root .text-token-conversation-body.${CLEAN_CLASS} > a,
#root .text-token-conversation-body.${CLEAN_CLASS} > button,
#root p.whitespace-pre-wrap.${CLEAN_CLASS} > span,
#root p.whitespace-pre-wrap.${CLEAN_CLASS} > a,
#root p.whitespace-pre-wrap.${CLEAN_CLASS} > button {
  direction: inherit !important;
  text-align: inherit !important;
  unicode-bidi: inherit !important;
  font-family: inherit !important;
}
#root [data-codex-composer] textarea,
#root [data-codex-composer] input,
#root [data-codex-composer] [contenteditable="true"] {
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: plaintext !important;
}
/* Explicit Ctrl+RightShift force-RTL rule for the composer. The runtime also
   tags the composer with the clean class, but an explicit, field-scoped rule
   guards the shortcut against any future decoupling of that class. Scoped to the
   composer fields only (not pre/code), so embedded commands/paths stay LTR via
   commonScopedCss. */
#root [data-codex-composer].${FORCE_RTL_CLASS},
#root [data-codex-composer].${FORCE_RTL_CLASS} p,
#root [data-codex-composer].${FORCE_RTL_CLASS} textarea,
#root [data-codex-composer].${FORCE_RTL_CLASS} input,
#root [data-codex-composer].${FORCE_RTL_CLASS} [contenteditable="true"],
#root [data-codex-composer] textarea.${FORCE_RTL_CLASS},
#root [data-codex-composer] input.${FORCE_RTL_CLASS},
#root [data-codex-composer] [contenteditable="true"].${FORCE_RTL_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
}
#root [data-codex-composer].${FORCE_LTR_CLASS},
#root [data-codex-composer].${FORCE_LTR_CLASS} p,
#root [data-codex-composer].${FORCE_LTR_CLASS} textarea,
#root [data-codex-composer].${FORCE_LTR_CLASS} input,
#root [data-codex-composer].${FORCE_LTR_CLASS} [contenteditable="true"],
#root [data-codex-composer] textarea.${FORCE_LTR_CLASS},
#root [data-codex-composer] input.${FORCE_LTR_CLASS},
#root [data-codex-composer] [contenteditable="true"].${FORCE_LTR_CLASS} {
  direction: ltr !important;
  text-align: left !important;
  font-family: var(--vscode-font-family, inherit) !important;
}
diffs-container,
.composer-diff-simple-line {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
}
#root .codex-review-diff-card pre.${CLEAN_CLASS},
#root .codex-review-diff-card code.${CLEAN_CLASS},
#root .composer-diff-simple-line pre.${CLEAN_CLASS},
#root .composer-diff-simple-line code.${CLEAN_CLASS},
#root pre.whitespace-pre-wrap.${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: plaintext !important;
}
#root .codex-review-diff-card pre.fa-ltr-clean,
#root .codex-review-diff-card code.fa-ltr-clean,
#root .composer-diff-simple-line pre.fa-ltr-clean,
#root .composer-diff-simple-line code.fa-ltr-clean,
#root pre.whitespace-pre-wrap.fa-ltr-clean {
  direction: ltr !important;
  text-align: left !important;
}
/* A plaintext file/code preview renders its prose inside clean inner nodes
   (often <span>), while commonScopedCss forces all pre/code descendants to
   monospace with !important. Re-assert Vazirmatn only on the clean prose nodes
   themselves; do NOT wildcard all descendants, or inline code/path fragments
   inside a mixed preview will lose monospace. */
#root pre.whitespace-pre-wrap.${CLEAN_CLASS},
#root pre.whitespace-pre-wrap .${CLEAN_CLASS}:not(code):not(pre):not(kbd):not(samp),
#root .codex-review-diff-card .${CLEAN_CLASS}:not(code):not(pre):not(kbd):not(samp),
#root .composer-diff-simple-line .${CLEAN_CLASS}:not(code):not(pre):not(kbd):not(samp) {
  font-family: var(--persian-rtl-clean-font-family) !important;
}
/* Request / approval / multi-choice cards. Persian question, option labels and
   descriptions are turned RTL per-element by the runtime (CLEAN_CLASS). Option
   rows flip their flex layout so the radio/checkbox indicator stays on the
   correct side. Inline code / commands / paths stay LTR + monospace. */
#root [data-codex-approval-surface] .${CLEAN_CLASS},
#root [data-codex-composer-request-navigation] .${CLEAN_CLASS},
#root [role="radiogroup"] [role="radio"].${CLEAN_CLASS},
#root [role="radiogroup"] [role="checkbox"].${CLEAN_CLASS},
#root [data-codex-approval-surface] [role="option"].${CLEAN_CLASS} {
  direction: rtl !important;
  text-align: right !important;
  font-family: var(--persian-rtl-clean-font-family) !important;
  unicode-bidi: isolate !important;
}
#root [data-codex-approval-surface] pre,
#root [data-codex-approval-surface] code,
#root [data-codex-approval-surface] kbd,
#root [data-codex-approval-surface] samp,
#root [data-codex-approval-surface] [class*="_inlineMarkdown_"],
#root [data-codex-composer-request-navigation] pre,
#root [data-codex-composer-request-navigation] code,
#root [data-codex-composer-request-navigation] kbd,
#root [data-codex-composer-request-navigation] samp,
#root [data-codex-composer-request-navigation] [class*="_inlineMarkdown_"],
#root [role="radiogroup"] code,
#root [role="radiogroup"] [class*="_inlineMarkdown_"] {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
  font-family: var(--vscode-editor-font-family), ui-monospace, monospace !important;
}
${MARKERS.codexCssEnd}`;
}

function buildCodexJs() {
  return `${MARKERS.codexJsStart}
${runtimeJs({
    rootSelector: 'document.getElementById("root")',
    // Current Codex uses _MarkdownRoot_* plus stable data attributes; older
    // builds used _markdownContent_*. Keep both hashed fallbacks, but prefer the
    // semantic lifecycle hooks so interrupted and finalized responses are
    // scanned even when no further streaming characterData mutation arrives.
    textSelector: '.whitespace-pre-wrap,.text-token-conversation-body,[class*="_markdownContent_"],[class*="_MarkdownRoot_"],[data-markdown-animated],[data-local-conversation-final-assistant],[data-thread-title="true"],[style*="header-title"] span.truncate,[id^="plan-item-"],[data-user-message-bubble]',
    dynamicSelector: '[data-codex-composer],[data-codex-composer] textarea,[data-codex-composer] input,[data-codex-composer] [contenteditable="true"]',
    inlineCodeSelector: '[class*="_inlineMarkdown_"]',
    // Current request_user_input / Plan-mode questions use this stable wrapper;
    // their title sits above (not inside) the radiogroup, so the older role-only
    // hook styled choices but never reached the heading.
    cardSelector: '[data-codex-approval-surface],[data-codex-composer-request-navigation],[role="radiogroup"]',
    approvalGroupSelector: '[role="radiogroup"]',
    approvalSurfaceSelector: '[data-codex-approval-surface]',
    approvalOptionSelector: '[role="radio"],[role="checkbox"]',
    rtlPreviewSelector: '.codex-review-diff-card pre,.codex-review-diff-card code,.composer-diff-simple-line pre,.composer-diff-simple-line code,pre.whitespace-pre-wrap,.text-token-conversation-body,p.whitespace-pre-wrap,[data-markdown-copy="code-block"] pre,[data-markdown-copy="code-block"] code,[data-markdown-copy="code-block"] .overflow-auto',
    userMessageSelector: '[data-local-conversation-user-anchor],[data-user-message-bubble]',
    logName: 'codex',
  })}
${MARKERS.codexJsEnd}`;
}

module.exports = {
  buildClaudeCss,
  buildClaudeJs,
  buildClaudePlanCss,
  buildClaudePlanJs,
  buildCodexCss,
  buildCodexJs,
  fingerprintComment,
  RUNTIME_FP,
  RUNTIME_VERSION,
};
