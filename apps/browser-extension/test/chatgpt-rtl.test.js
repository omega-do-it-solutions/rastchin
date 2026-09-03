'use strict';
// Regression suite for ChatGPT's recipe: narrow selectors (streaming safety),
// scoped response font, and NO text-node wrapping / heavy inline mutation.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEngine, el, t } = require('./engine-harness');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'chatgpt-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

const ctx = {
    window: {
        __CHATGPT_RTL_TEST__(api) { exported = api; }
    },
    RastChinRecipe: {
        runPlatformRecipe(recipe) { registeredRecipe = recipe; }
    },
    console
};
ctx.window.window = ctx.window;
ctx.window.top = ctx.window;
vm.createContext(ctx);
vm.runInContext(source, ctx);

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (got !== expected) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: ChatGPT recipe test hook did not run');
    process.exit(1);
}

// --- recipe contract ---
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'chatgptEnabled');
check('recipe: host chatgpt.com', registeredRecipe.hosts.includes('chatgpt.com'), true);
check('recipe: host chat.openai.com', registeredRecipe.hosts.includes('chat.openai.com'), true);

// --- streaming safety: narrow textSelectors (no div/span blanket mutation) ---
const textSelectors = registeredRecipe.textSelectors;
check('textSelectors: drops over-broad div', textSelectors.includes('div'), false);
check('textSelectors: drops over-broad span', textSelectors.includes('span'), false);
check('textSelectors: keeps block paragraphs', textSelectors.includes('p'), true);
check('textSelectors: keeps list items', textSelectors.includes('li'), true);
check('textSelectors: keeps table cells', textSelectors.includes('td') && textSelectors.includes('th'), true);

// --- streaming safety: narrow messageSelectors ---
const messageSelectors = registeredRecipe.messageSelectors;
check('messageSelectors: drops broad conversation-turn wrapper', messageSelectors.includes('[data-testid="conversation-turn"]'), false);
check('messageSelectors: drops bare data-message-author-role', messageSelectors.includes('[data-message-author-role]'), false);
check('messageSelectors: scopes to assistant message', messageSelectors.includes('[data-message-author-role="assistant"]'), true);
check('messageSelectors: scopes to user message', messageSelectors.includes('[data-message-author-role="user"]'), true);
check('messageSelectors: keeps semantic message-id fallback', messageSelectors.includes('[data-message-id]'), true);
check('messageSelectors: includes numbered turn wrapper for leaf walking', messageSelectors.includes('[data-testid^="conversation-turn"]'), true);
check('messageSelectors: includes semantic main article fallback', messageSelectors.includes('main article'), true);
check('messageSelectors: includes direct main paragraph fallback', messageSelectors.includes('main p'), true);
check('messageSelectors: includes Canvas root fallback', messageSelectors.includes('[data-testid*="canvas"]'), true);
check('messageSelectors: includes ProseMirror document root', messageSelectors.includes('.ProseMirror'), true);
check('recipe: opaque related frames are explicitly allowed', registeredRecipe.allowOpaqueOriginFrames, true);
check('recipe: uses a dedicated RTL marker class', registeredRecipe.rtlClass, 'rastchin-chatgpt-rtl');

{
    const body = el('body', {});
    check('embedded document: top-level body is not a message root', registeredRecipe.isMessageElement(body), false);
    ctx.window.top = {};
    check('embedded document: related child-frame body is a message root', registeredRecipe.isMessageElement(body), true);
    ctx.window.top = ctx.window;
}

// --- no text-node wrapping / custom mutation path ---
check('recipe: custom leaf walker handles normal chat and document boxes', typeof registeredRecipe.applyToMessage, 'function');
check('source: never replaces live text nodes (no replaceChild)', /replaceChild/.test(source), false);
check('source: never wraps text in injected spans (no createElement)', /createElement\(/.test(source), false);

// --- code / url / email / table preserved ---
check('codeGuard: protects code', registeredRecipe.codeGuardSelectors.includes('code'), true);
check('codeGuard: protects pre', registeredRecipe.codeGuardSelectors.includes('pre'), true);
check('bidi: isolate keeps inline LTR runs (url/email/code) readable', registeredRecipe.rtlStyle.unicodeBidi, 'isolate');
check('composer: excluded from RTL', registeredRecipe.excludeSelectors.includes('[data-type="unified-composer"]'), true);
check('document editor: generic contenteditable is not excluded', registeredRecipe.excludeSelectors.includes('[contenteditable="true"]'), false);
check('document editor: generic form descendants are not excluded', registeredRecipe.excludeSelectors.includes('form *'), false);
check('composer: prompt textarea descendants are excluded', registeredRecipe.excludeSelectors.includes('#prompt-textarea *'), true);

// --- scoped response font (font-inject skips response, recipe supplies the font) ---
const css = registeredRecipe.globalCss((registeredRecipe.codeGuardSelectors || []).join(', '), { messageSelectors });
check('css: code guard stays LTR', /direction:\s*ltr\s*!important/.test(css), true);
check('css: supplies Vazirmatn response font', css.includes('"Vazirmatn"'), true);
check('css: response font scoped to the font-inject-skipped containers', css.includes(':is([data-message-author-role], [data-message-id], [data-testid^="conversation-turn"], main article)'), true);
check('css: response font also targets the container itself (bare-div user bubble)', css.includes(':is([data-message-author-role], [data-message-id], [data-testid^="conversation-turn"], main article),'), true);
check('css: response font element list includes div (bare-div user text)', css.includes('h6, div, span,'), true);
check('css: code keeps a monospace stack inside messages', css.includes('ui-monospace'), true);
check('css: code descendants keep monospace despite response div/span font rule', /:is\(code,[\s\S]*?\)\s+\*\s*\{[\s\S]*?ui-monospace/.test(css), true);
check('css: marked ChatGPT content wins host alignment rules', /\[dir="rtl"\][^{]*\{[^}]*direction:\s*rtl\s*!important[^}]*text-align:\s*right\s*!important/.test(css), true);
check('css: dedicated marker beats host alignment rules', css.includes('html body .rastchin-chatgpt-rtl[dir="rtl"]'), true);

// Cross-file parity: the recipe must font EXACTLY what font-inject skips, or some
// response text (e.g. a bare-div user bubble) ends up with neither font.
const fontInjectSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'font-inject.js'), 'utf8');
const responseSkipMatches = [...fontInjectSrc.matchAll(/"(chatgpt\.com|chat\.openai\.com)":\s*'([^']+)'/g)]
    .map(match => match[2]);
const recipeResponseSelector = exported.responseContainerSelectors.join(', ');
check('parity: font-inject has both ChatGPT hosts', responseSkipMatches.length, 2);
check('parity: font-inject skips exactly the recipe response containers', responseSkipMatches.every(selector => selector === recipeResponseSelector), true);
check('css: rtl tables flip direction', /\[dir="rtl"\]\s*table\s*\{[^}]*direction:\s*rtl/.test(css), true);
check('css: rtl lists get start padding', /\[dir="rtl"\]\s*(?:ul|ol)[\s\S]*padding-right:\s*2rem/.test(css), true);

function makeChatGptEngine() {
    return makeEngine({
        textSelectors,
        excludeSelectors: [...registeredRecipe.excludeSelectors, ...registeredRecipe.codeGuardSelectors],
        rtlRegex: registeredRecipe.rtlRegex,
        rtlClass: registeredRecipe.rtlClass,
        rtlStyle: registeredRecipe.rtlStyle,
        needsRTL: registeredRecipe.needsRTL,
        isCodeLike: node => registeredRecipe.codeGuardSelectors.some(selector => node.closest?.(selector))
    });
}

// --- current ChatGPT turn regression ---------------------------------------
// Current turns use numbered data-testid values. Font injection can still find
// Persian text generically, so a missing message candidate produces the exact
// visible bug: Vazirmatn loads while no content block receives dir=rtl.
{
    const paragraph = el('p', {}, t('سلام، این پاسخ فارسی باید راست‌چین باشد.'));
    const markdown = el('div', { cls: 'markdown prose' }, paragraph);
    const numberedTurn = el(
        'article',
        { attrs: { 'data-testid': 'conversation-turn-2' } },
        el('div', { cls: 'agent-turn' }, markdown)
    );
    check('numbered turn: wrapper becomes a scan boundary', numberedTurn.matches(messageSelectors.join(', ')), true);

    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(numberedTurn, engine);
    check('numbered turn: response layout stays untouched', markdown.getAttribute('dir'), null);
    check('numbered turn: paragraph receives dir=rtl', paragraph.getAttribute('dir'), 'rtl');
    check('numbered turn: paragraph aligns right', paragraph.style.textAlign, 'right');
}

{
    const paragraph = el('p', {}, t('یک پاسخ فارسی بدون author-role'));
    const rolelessMessage = el(
        'div',
        { attrs: { 'data-message-id': 'message-123' } },
        paragraph
    );
    check('message-id fallback: roleless message remains a candidate', rolelessMessage.matches(messageSelectors.join(', ')), true);
}

// Normal ChatGPT responses can render without the older role/message wrappers.
// The turn wrapper is only a discovery boundary: individual prose blocks receive
// direction so the surrounding flex layout and action row never reverse.
{
    const englishLead = el('p', {}, t('Of course 😜'));
    const mixedParagraph = el('p', {}, t('امروز هوا خیلی خوب بود و کمی قدم زدم. The weather was really nice.'));
    const actionButton = el('button', {}, t('Copy'));
    const turn = el(
        'article',
        { attrs: { 'data-testid': 'conversation-turn-6' } },
        el('div', { cls: 'response-body' }, englishLead, mixedParagraph),
        el('div', { cls: 'action-row' }, actionButton)
    );
    const main = el('main', {}, turn);
    const candidates = main.querySelectorAll(messageSelectors.join(', '));
    check('normal chat: numbered article is discovered', candidates.includes(turn), true);

    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(turn, engine);
    check('normal chat: outer turn layout stays untouched', turn.getAttribute('dir'), null);
    check('normal chat: English paragraph stays untouched', englishLead.getAttribute('dir'), null);
    check('normal chat: mixed Persian paragraph gets dir=rtl', mixedParagraph.getAttribute('dir'), 'rtl');
    check('normal chat: mixed Persian paragraph aligns right', mixedParagraph.style.textAlign, 'right');
    check('normal chat: action control stays untouched', actionButton.getAttribute('dir'), null);
}

// Anonymous `/uc/` chats may expose neither a numbered turn nor a message-role
// wrapper. A direct prose leaf under `main` must still become a candidate.
{
    const paragraph = el('p', {}, t('این پاسخ عادی باید راست‌چین شود. Normal chat text follows.'));
    const main = el('main', {}, el('section', {}, paragraph));
    const candidates = main.querySelectorAll(messageSelectors.join(', '));
    check('anonymous chat: direct main paragraph is discovered', candidates.includes(paragraph), true);

    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(paragraph, engine);
    check('anonymous chat: paragraph receives dir=rtl', paragraph.getAttribute('dir'), 'rtl');
    check('anonymous chat: paragraph aligns right', paragraph.style.textAlign, 'right');
}

// ChatGPT's editable document/Canvas output can live inside an assistant turn.
// Its prose is allowed even under contenteditable, while the box toolbar and the
// instruction composer form remain outside the RTL walk.
{
    const title = el('h2', {}, t('RTL / LTR Test'));
    const mixedDocumentParagraph = el('p', {}, t('سلام! This is a mixed document paragraph.'));
    const code = el('pre', {}, el('code', {}, t('const message = "سلام";')));
    const editor = el(
        'div',
        { cls: 'ProseMirror', attrs: { contenteditable: 'true' } },
        title,
        mixedDocumentParagraph,
        code
    );
    const editButton = el('button', {}, t('Edit'));
    const composer = el(
        'div',
        { attrs: { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' } },
        t('سلام برای ویرایش')
    );
    const documentBox = el(
        'form',
        { attrs: { 'data-testid': 'canvas-document' } },
        el('div', { role: 'toolbar' }, editButton),
        editor,
        composer
    );
    const main = el('main', {}, documentBox);
    const candidates = main.querySelectorAll(messageSelectors.join(', '));
    check('document box: standalone Canvas root is discovered', candidates.includes(documentBox), true);

    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(documentBox, engine);
    check('document box: outer surface stays untouched', documentBox.getAttribute('dir'), null);
    check('document box: English title stays untouched', title.getAttribute('dir'), null);
    check('document box: mixed prose gets dir=rtl', mixedDocumentParagraph.getAttribute('dir'), 'rtl');
    check('document box: mixed prose aligns right', mixedDocumentParagraph.style.textAlign, 'right');
    check('document box: mixed prose gets the host-override class', mixedDocumentParagraph.classList.contains('rastchin-chatgpt-rtl'), true);
    check('document box: code stays LTR/unmanaged', code.getAttribute('dir'), null);
    check('document box: toolbar control stays untouched', editButton.getAttribute('dir'), null);
    check('document box: instruction composer stays untouched', composer.getAttribute('dir'), null);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
