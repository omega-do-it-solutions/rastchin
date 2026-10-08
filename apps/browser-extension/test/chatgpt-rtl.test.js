'use strict';
// Regression suite for ChatGPT's recipe: narrow selectors (streaming safety),
// scoped response font, and NO text-node wrapping / heavy inline mutation.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEngine, makeIsolatingEngine, el, t } = require('./engine-harness');

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
check('codeGuard: adapter opts into content-aware fenced-block handling', registeredRecipe.codeGuardsAreExclusions, false);
check('bidi: isolate keeps inline LTR runs (url/email/code) readable', registeredRecipe.rtlStyle.unicodeBidi, 'isolate');
check('composer: excluded from RTL', registeredRecipe.excludeSelectors.includes('[data-type="unified-composer"]'), true);
check('document editor: generic contenteditable is not excluded', registeredRecipe.excludeSelectors.includes('[contenteditable="true"]'), false);
check('document editor: generic form descendants are not excluded', registeredRecipe.excludeSelectors.includes('form *'), false);
check('composer: prompt textarea descendants are excluded', registeredRecipe.excludeSelectors.includes('#prompt-textarea *'), true);

// --- scoped response font (font-inject skips response, recipe supplies the font) ---
const css = registeredRecipe.globalCss((registeredRecipe.codeGuardSelectors || []).join(', '), { messageSelectors });
check('css: code guard stays LTR', /direction:\s*ltr\s*!important/.test(css), true);
check('css: supplies Vazirmatn response font', css.includes('"Vazirmatn"'), true);
const responseScope = `:is(${exported.responseContainerSelectors.join(', ')})`;
check('css: response font scoped to the font-inject-skipped containers', css.includes(responseScope), true);
check('css: response font also targets the container itself (bare-div user bubble)', css.includes(`${responseScope},`), true);
check('css: guest response inline code uses the scoped monospace rule', css.includes(`${responseScope} :is(code,`), true);
check('css: response font element list includes div (bare-div user text)', css.includes('h6, div, span,'), true);
check('css: code keeps a monospace stack inside messages', css.includes('ui-monospace'), true);
check('css: code descendants keep monospace despite response div/span font rule', /:is\(code,[\s\S]*?\)\s+\*\s*\{[\s\S]*?ui-monospace/.test(css), true);
check('css: marked Persian code surfaces receive the content font', /\.cm-editor, pre,[\s\S]*?\.rastchin-chatgpt-rtl\[dir="rtl"\][\s\S]*?font-family:\s*"Vazirmatn"/.test(css), true);
check('css: marked Persian code surfaces force RTL alignment', /\.cm-content \*[\s\S]*?direction:\s*rtl\s*!important;[\s\S]*?text-align:\s*right\s*!important/.test(css), true);
check('css: marked ChatGPT content wins host direction rules', /\[dir="rtl"\][^{]*\{[^}]*direction:\s*rtl\s*!important/.test(css), true);
check('css: prose alignment does not override table column alignment', css.includes('html body .rastchin-chatgpt-rtl[dir="rtl"]:not(td):not(th)'), true);
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
        messageSelectors,
        applyToMessage: registeredRecipe.applyToMessage,
        textSelectors,
        excludeSelectors: [...registeredRecipe.excludeSelectors],
        rtlRegex: registeredRecipe.rtlRegex,
        rtlClass: registeredRecipe.rtlClass,
        rtlStyle: registeredRecipe.rtlStyle,
        needsRTL: registeredRecipe.needsRTL,
        isCodeLike: registeredRecipe.isCodeLike,
        coalesceCandidateSubtrees: registeredRecipe.coalesceCandidateSubtrees,
        shouldScanMutation: registeredRecipe.shouldScanMutation
    });
}

{
    const header = el('th', { attrs: { align: 'right' } }, t('تعداد'));
    const centered = el('td', { attrs: { align: 'center' } }, t('فارسی'));
    const inlineAligned = el('td', { style: { textAlign: 'left' } }, t('متن فارسی'));
    const number = el('td', { attrs: { align: 'right' } }, t('43'));
    const english = el('td', {}, t('English'));
    const table = el('table', {}, el('thead', {}, el('tr', {}, header)), el('tbody', {}, el('tr', {}, centered, inlineAligned, number, english)));
    const turn = el('article', {}, table);
    el('main', {}, turn);
    const engine = makeChatGptEngine();
    engine.applyToMessage(turn);
    check('table: numeric cell remains LTR', number.getAttribute('dir'), 'ltr');
    check('table: explicit numeric right alignment is preserved', number.style.textAlign, 'right');
    check('table: centered Persian column stays centered', centered.style.textAlign, 'center');
    check('table: original inline column alignment is preserved', inlineAligned.style.textAlign, 'left');
    engine.applyToMessage(turn);
    check('table: repeated scan preserves original inline column alignment', inlineAligned.style.textAlign, 'left');
    check('table: repeated scan preserves centered alignment', centered.style.textAlign, 'center');
    engine.restoreStyles();
    check('table: disable restores original inline alignment', inlineAligned.style.textAlign, 'left');
    check('table: disable removes numeric alignment override', number.style.textAlign, '');
    check('table: disable removes Persian direction', centered.getAttribute('dir'), null);
}

// Current native tables declare logical Markdown alignment on the cell. The
// nested paragraph must inherit that explicit column decision as well.
{
    const numberParagraph = el('p', {}, el('span', {}, t('43')));
    const number = el('td', { attrs: { 'data-d-align': 'end' } }, numberParagraph);
    const persianParagraph = el('p', {}, el('span', {}, t('فارسی')));
    const center = el('td', { attrs: { 'data-d-align': 'center' } }, persianParagraph);
    const englishParagraph = el('p', {}, t('English'));
    const englishCenter = el('td', { attrs: { 'data-d-align': 'center' } }, englishParagraph);
    const inlineParagraph = el('p', {}, t('متن فارسی'));
    const inlineCell = el('td', { style: { textAlign: 'left' } }, inlineParagraph);
    const turn = el('article', {}, el('table', {}, el('tr', {}, number, center, englishCenter, inlineCell)));
    el('main', {}, turn);
    const engine = makeChatGptEngine();
    engine.applyToMessage(turn);
    check('native column end: number cell stays right-aligned', number.style.textAlign, 'right');
    check('native column end: nested number paragraph stays right-aligned', numberParagraph.style.textAlign, 'right');
    check('native centered column: Persian cell stays centered', center.style.textAlign, 'center');
    check('native centered column: Persian paragraph stays centered', persianParagraph.style.textAlign, 'center');
    check('native centered column: English paragraph stays centered', englishParagraph.style.textAlign, 'center');
    check('inline column alignment: nested Persian paragraph stays left-aligned', inlineParagraph.style.textAlign, 'left');
    engine.applyToMessage(turn);
    check('native column alignment: repeated scans preserve centering', persianParagraph.style.textAlign, 'center');
    engine.restoreStyles();
    check('native column alignment: disable preserves host data attribute', center.getAttribute('data-d-align'), 'center');
    check('native column alignment: disable restores inline value', inlineCell.style.textAlign, 'left');
}

// The September ChatGPT composer has neither the old id nor unified-composer
// hook. Pasting a rich prompt must never route its ProseMirror content through
// the response walker, even during the initial whole-document discovery.
for (const attribute of ['data-composer-markdown', 'data-composer-body']) {
    const paragraph = el('p', {}, t('یک ورودی آزمایشی با English'));
    const editor = el('div', { cls: 'ProseMirror', attrs: { contenteditable: 'true', [attribute]: '' } }, paragraph);
    const main = el('main', {}, editor);
    const engine = makeChatGptEngine();
    const candidates = new Set();
    engine.collectCandidates(main, candidates);
    check(`${attribute}: editor excluded from initial discovery`, candidates.has(editor), false);
    check(`${attribute}: pasted paragraph excluded`, candidates.has(paragraph), false);
    registeredRecipe.applyToMessage(main, engine);
    check(`${attribute}: paragraph receives no direction mutation`, paragraph.getAttribute('dir'), null);
    check(`${attribute}: prompt changes do not schedule response scans`, registeredRecipe.shouldScanMutation({type:'childList', target:editor, addedNodes:[paragraph], removedNodes:[]}, engine), false);
}

{
    const engine = makeChatGptEngine();
    const shortLabel = el('li', {}, t('Self-hosted است.'));
    const products = el('li', {}, t('OpenAI / Claude / Gemini / Ollama / LM Studio / OpenRouter را پشتیبانی می‌کند.'));
    const english = el('li', {}, t('This English sentence mentions سلام once.'));
    const list = el('ul', {}, shortLabel, products, english);
    const labelParagraph = el('p', {}, t('Open Notebook = یک NotebookLM شخصی Self-hosted و قابل اتصال به Agentها.'));
    const turn = el('div', { attrs: { 'data-chatgpt-selection-message-id': 'sample' } }, list, labelParagraph);
    el('main', {}, turn);
    engine.applyToMessage(turn);
    check('current native ChatGPT boundary is discovered', turn.matches(messageSelectors.join(', ')), true);
    check('short Latin label with Persian copula is RTL', shortLabel.getAttribute('dir'), 'rtl');
    check('product-name list with Persian predicate is RTL', products.getAttribute('dir'), 'rtl');
    check('Latin-labelled Persian paragraph is RTL', labelParagraph.getAttribute('dir'), 'rtl');
    check('English item in RTL list explicitly stays LTR', english.getAttribute('dir'), 'ltr');
    engine.restoreStyles();
    check('mixed-list disable restores English item direction', english.getAttribute('dir'), null);
    check('short English greeting with incidental Persian stays LTR', engine.needsRTL('Hello سلام'), false);
    check('English sentence with a long later Persian quote stays LTR', engine.needsRTL('This is a quote: این یک نقل‌قول بلند فارسی برای آزمون است.'), false);
}

{
    const p = el('p', {}, t('متن فارسی'));
    const turn = el('article', {}, el('div', { attrs: { 'data-message-id': 'nested' } }, p));
    const main = el('main', {}, turn);
    const engine = makeChatGptEngine();
    const visited = [];
    engine.applyToMessage = node => visited.push(node);
    engine.pendingNodes.add(main);
    engine.pendingNodes.add(p);
    engine.processQueue();
    check('long-chat discovery walks overlapping subtree once', visited.length, 1);
    check('long-chat discovery keeps the outer response boundary', visited[0], turn);

    const body = el('body', {}, main);
    const tooltip = el('div', { role: 'tooltip' }, t('عنوان ساختگی'));
    const unrelated = { type:'childList', target:body, addedNodes:[tooltip], removedNodes:[] };
    check('sidebar portal insertion does not rescan conversation', registeredRecipe.shouldScanMutation(unrelated, engine), false);
    unrelated.addedNodes=[]; unrelated.removedNodes=[tooltip];
    check('sidebar portal removal does not rescan conversation', registeredRecipe.shouldScanMutation(unrelated, engine), false);
    check('own marker class does not rescan conversation', registeredRecipe.shouldScanMutation({type:'attributes', attributeName:'class', target:p, oldValue:''}, engine), false);
    check('hover classes do not rescan conversation', registeredRecipe.shouldScanMutation({type:'attributes', attributeName:'class', target:turn, oldValue:'hover'}, engine), false);
    check('streaming completion still triggers rescan', registeredRecipe.shouldScanMutation({type:'attributes', attributeName:'class', target:turn, oldValue:'result-streaming'}, engine), true);
    check('response text replacement still triggers rescan', registeredRecipe.shouldScanMutation({type:'childList', target:p, addedNodes:[t('بند تازه')], removedNodes:[t('قدیمی')]}, engine), true);
    // After removal, a fallback article loses the `main` ancestor in its
    // selector. Its direction snapshots still need releasing on empty chats.
    const removed = el('article', {}, el('p', { cls: 'rastchin-chatgpt-rtl' }, t('بند قدیمی')));
    check('detached fallback response still triggers snapshot cleanup', registeredRecipe.shouldScanMutation({type:'childList', target:body, addedNodes:[], removedNodes:[removed]}, engine), true);
}

// Currency/date labels are prefixes to Persian prose, including ChatGPT's
// streamed bold-label spans. They must not change an English sentence's base.
{
    const engine = makeChatGptEngine();
    for (const label of ['Revolut (+€ 200):', 'MEDIACUBE (+€ 4 100):', 'Eva (September 23):', 'OpenAI ($20):']) {
        const paragraph = el('p', {}, el('strong', {}, t(label)), t(' این یک نام ساختگی برای تست پرانتز و عدد در متن فارسی است.'));
        const turn = el('article', {}, paragraph);
        el('main', {}, turn);
        engine.applyToMessage(turn);
        check(`Latin label ${label}: Persian paragraph is RTL`, paragraph.getAttribute('dir'), 'rtl');
    }
    check('English sentence with a currency amount stays LTR', engine.needsRTL('This costs €200: این توضیح فارسی فقط بخشی از نقل قول است.'), false);
    check('Ordinary English-first prose still stays LTR', engine.needsRTL('English-first paragraph with a later عبارت فارسی should stay left-to-right.'), false);
}

// The current renderer uses a code-only scrollport, with the language and
// copy/wrap buttons in a separate header. Only a known prose body may change.
{
    const box = (label, text) => {
        const title = el('div', { cls: 'truncate' }, t(label));
        const copy = el('button', { attrs: { 'aria-label': 'Copy' } }, t('Copy'));
        const header = el('div', { attrs: { 'data-markdown-copy': 'exclude' } }, title, copy);
        const code = el('code', {}, el('span', {}, t(text)));
        const body = el('div', { cls: 'chatgpt-code-scrollport', attrs: { dir: 'ltr' }, style: { textAlign: '' } }, code);
        return { root: el('div', { attrs: { 'data-markdown-copy': 'code-block' } }, header, body), header, body, code };
    };
    const prose = box('Plain text', 'این متن فقط نمونه است.\nمرحله اول → مرحله دوم\nنتیجه با English token و عدد ۱۲۳');
    const technical = box('JavaScript', 'const greeting = "سلام";\nconsole.log(greeting);');
    const declaredCode = box('Python', '# این فقط توضیح فارسی در یک برنامه است.');
    const unknown = box('Unknown language', 'این فقط توضیح فارسی در یک زبان ناشناخته است.');
    const english = box('Plain text', 'This is a plain English sample.');
    const turn = el('article', {}, prose.root, technical.root, declaredCode.root, unknown.root, english.root);
    el('main', {}, turn);
    const engine = makeChatGptEngine();
    engine.applyToMessage(turn);
    check('native prose code-only box: scrollport is RTL', prose.body.getAttribute('dir'), 'rtl');
    check('native prose code-only box: content aligns right', prose.body.style.textAlign, 'right');
    check('native prose code-only box: uses per-line bidi', prose.body.style.unicodeBidi, 'plaintext');
    check('native prose code-only box: header is untouched', prose.header.getAttribute('dir'), null);
    check('native code-only JavaScript: stays LTR', technical.body.getAttribute('dir'), 'ltr');
    check('native code-only Python: Persian comments stay technical', declaredCode.body.getAttribute('dir'), 'ltr');
    check('native code-only unknown language: fails closed', unknown.body.getAttribute('dir'), 'ltr');
    check('native English plain text: stays LTR', english.body.getAttribute('dir'), 'ltr');
    prose.code.childNodes[0].childNodes[0].textContent = 'const greeting = "سلام";\nconsole.log(greeting);';
    engine.applyToMessage(turn);
    check('native regenerated technical content: restores LTR', prose.body.getAttribute('dir'), 'ltr');
    check('native regenerated technical content: removes font/direction marker', prose.body.classList.contains('rastchin-chatgpt-rtl'), false);
    engine.restoreStyles();
    check('native prose disable: restores body direction', prose.body.getAttribute('dir'), 'ltr');
    check('native prose disable: restores body alignment', prose.body.style.textAlign, '');
}

// React and the word-stream renderer retain Text references after streaming.
// Splitting Latin phrases into one BDI per word reverses names such as "Open
// Notebook" in RTL and makes later renderer removals unsafe. Style-only bidi
// must preserve both the element and its original text children.
{
    const openText = t('Open ');
    const notebookText = t('Notebook ');
    const open = el('span', { attrs: { 'data-d-stream-word': '' } }, openText);
    const notebook = el('span', { attrs: { 'data-d-stream-word': '' } }, notebookText);
    const paragraph = el('p', {}, open, notebook, t('= یک سرویس آزمایشی فارسی است.'));
    const turn = el('article', {}, paragraph);
    el('main', {}, turn);
    const engine = makeIsolatingEngine({ ...registeredRecipe });
    engine.applyToMessage(turn);
    check('word-stream renderer: paragraph still gets RTL', paragraph.getAttribute('dir'), 'rtl');
    check('word-stream renderer: original Open text stays a direct child', open.childNodes[0] === openText, true);
    check('word-stream renderer: original Notebook text stays a direct child', notebook.childNodes[0] === notebookText, true);
    check('word-stream renderer: no injected BDI boundaries between words', paragraph.querySelectorAll('bdi[data-rastchin-bidi]').length, 0);
}

// A Latin product/tax label at the start of a Persian list item must not place
// the marker on the visual left. Lists use Persian dominance while ordinary
// paragraphs retain ChatGPT's first-strong-letter behavior.
{
    const persianItem = el(
        'li',
        {},
        el('strong', {}, t('KöSt (Körperschaftsteuer)')),
        t(' — در این مثال ساختگی، شرکت باید مبلغ را با نرخ فرضی محاسبه کند و نتیجه فارسی را نمایش دهد.')
    );
    const secondPersianItem = el(
        'li',
        {},
        el('strong', {}, t('Einkommensteuer')),
        t(' — این توضیح فارسی برای یک محاسبه آزمایشی نوشته شده است و اطلاعات نمونه را نشان می‌دهد.')
    );
    const persianList = el('ul', {}, persianItem, secondPersianItem);
    const englishItem = el('li', {}, t('English release notes with one Persian word سلام at the end.'));
    const englishList = el('ul', {}, englishItem);
    const turn = el(
        'article',
        { attrs: { 'data-testid': 'conversation-turn-list' } },
        persianList,
        englishList
    );
    const main = el('main', {}, turn);
    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(turn, engine);

    check('mixed list: Persian-dominant UL receives dir=rtl', persianList.getAttribute('dir'), 'rtl');
    check('mixed list: Latin-leading Persian LI receives dir=rtl', persianItem.getAttribute('dir'), 'rtl');
    check('mixed list: second Latin-leading Persian LI receives dir=rtl', secondPersianItem.getAttribute('dir'), 'rtl');
    check('English list: UL with incidental Persian stays unmanaged', englishList.getAttribute('dir'), null);
    check('English list: LI with incidental Persian stays unmanaged', englishItem.getAttribute('dir'), null);

    engine.restoreStyles();
    check('mixed list disable: UL direction is restored', persianList.getAttribute('dir'), null);
    check('mixed list disable: LI direction is restored', persianItem.getAttribute('dir'), null);
}

// Fenced plain-text boxes that contain Persian prose are content, despite being
// rendered through ChatGPT's CodeMirror viewer. Actual programming code and
// inline code keep the native LTR/monospace guard.
{
    const persianContent = el(
        'pre',
        { cls: 'cm-content' },
        el('code', {}, el('span', {}, t('موضوع: پیگیری دامنه omegado.api\n\n1. این متن فارسی برای آزمایش است و Registry ID را نمایش می‌دهد.')))
    );
    const persianViewer = el('div', { cls: 'cm-editor', attrs: { dir: 'ltr' } }, persianContent);
    const technicalPre = el('pre', {}, el('code', {}, t('const message = "سلام";\nconsole.log(message);')));
    const inlineCode = el('code', {}, t('سلام'));
    const paragraph = el('p', {}, t('این متن دارای کد درون‌خطی است: '), inlineCode);
    const turn = el(
        'article',
        { attrs: { 'data-testid': 'conversation-turn-code' } },
        paragraph,
        persianViewer,
        technicalPre
    );
    const main = el('main', {}, turn);
    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(turn, engine);

    check('Persian code box: CodeMirror viewer receives dir=rtl', persianViewer.getAttribute('dir'), 'rtl');
    check('Persian code box: viewer aligns content right', persianViewer.style.textAlign, 'right');
    check('Persian code box: viewer uses per-line bidi', persianViewer.style.unicodeBidi, 'plaintext');
    check('Persian code box: viewer gets RTL marker for font override', persianViewer.classList.contains('rastchin-chatgpt-rtl'), true);
    check('technical code: code block remains unmanaged', technicalPre.getAttribute('dir'), null);
    check('inline code: remains unmanaged', inlineCode.getAttribute('dir'), null);

    engine.restoreStyles();
    check('Persian code box disable: original dir is restored', persianViewer.getAttribute('dir'), 'ltr');
    check('Persian code box disable: RTL marker is removed', persianViewer.classList.contains('rastchin-chatgpt-rtl'), false);
}

// Firefox's logged-out /uc/ layout: user text is a prose leaf inside a
// clickable bubble, and the conversation itself is an OL of message turns.
// These are sanitized shapes from the live smoke test, not account content.
{
    const userText = el('p', { cls: '_test_messageCopy' }, t('این یک آزمون است. English follows.'));
    const userButton = el('button', { cls: '_test_userMessage' }, userText);
    const english = el('p', {}, t('This English-first paragraph ends with سلام'));
    const persian = el('p', {}, t('این یک پاسخ فارسی است.'));
    const response = el('div', { cls: '_test_messageCopy' }, persian, english);
    const userTurn = el('li', { cls: '_test_messageTurn' }, userButton);
    const assistantTurn = el('li', { cls: '_test_messageTurn' }, response);
    const list = el('ol', { cls: '_test_messageList' }, userTurn, assistantTurn);
    const main = el('main', {}, el('div', { cls: 'wm-app-thread' }, list));
    const engine = makeChatGptEngine();
    const candidates = new Set();
    engine.collectCandidates(main, candidates);
    candidates.forEach(node => engine.applyToMessage(node));

    check('guest bubble: Persian-first sent text gets RTL', userText.getAttribute('dir'), 'rtl');
    check('guest bubble: only text aligns right', userText.style.textAlign, 'right');
    check('guest bubble: button geometry stays untouched', userButton.getAttribute('dir'), null);
    check('guest conversation: list geometry stays untouched', list.getAttribute('dir'), null);
    check('guest conversation: user turn stays untouched', userTurn.getAttribute('dir'), null);
    check('guest conversation: assistant turn stays untouched', assistantTurn.getAttribute('dir'), null);
    check('guest response: wrapper does not force English RTL', response.getAttribute('dir'), null);
    check('guest response: English leaf stays unmanaged', english.getAttribute('dir'), null);
    check('guest response: Persian leaf is RTL', persian.getAttribute('dir'), 'rtl');
    check('guest font: new message body is a CSS scope', response.matches(exported.responseContainerSelectors.join(', ')), true);
    check('guest font: user text is a CSS scope', userText.matches(exported.responseContainerSelectors.join(', ')), true);

    engine.restoreStyles();
    check('guest disable: sent text direction is restored', userText.getAttribute('dir'), null);
    check('guest disable: sent text alignment is restored', userText.style.textAlign, '');
    check('guest disable: response direction is restored', persian.getAttribute('dir'), null);
}

// Keep all other buttons guarded, including similarly named content outside
// the known conversation and controls nested in toolbars.
for (const location of ['unknown', 'toolbar', 'ordinary']) {
    const text = el('p', { cls: '_test_messageCopy' }, t('این کنترل نباید تغییر کند'));
    const button = el('button', { cls: location === 'ordinary' ? 'action' : '_test_userMessage' }, text);
    const container = location === 'toolbar' ? el('div', { role: 'toolbar' }, button) : button;
    const thread = el('div', { cls: location === 'unknown' ? 'unknown' : 'wm-app-thread' }, container);
    const main = el('main', {}, thread);
    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(main, engine);
    check(`guest guards: ${location} button remains untouched`, text.getAttribute('dir'), null);
}

// Streaming can reuse a bare DIV for the settled Markdown tree. Its old RTL
// snapshot must be restored as soon as it becomes a multi-paragraph wrapper.
{
    const streamedText = t('پاسخ در حال نمایش');
    const response = el('div', { cls: '_test_messageCopy' }, streamedText);
    const main = el('main', {}, el('div', { cls: 'wm-app-thread' }, response));
    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(response, engine);
    check('settle: bare prose initially receives RTL', response.getAttribute('dir'), 'rtl');
    response.removeChild(streamedText);
    const persian = el('p', {}, t('یک پاراگراف فارسی'));
    const english = el('p', {}, t('English paragraph with سلام'));
    response.append(persian, english);
    const candidates = new Set();
    engine.collectCandidates(response, candidates);
    candidates.forEach(node => engine.applyToMessage(node));
    check('settle: response wrapper relinquishes RTL', response.getAttribute('dir'), null);
    check('settle: wrapper alignment is restored', response.style.textAlign, '');
    check('settle: Persian leaf remains RTL', persian.getAttribute('dir'), 'rtl');
    check('settle: English leaf has no inherited RTL wrapper', english.parentElement.getAttribute('dir'), null);
    check('settle: text stays intact', engine.collectDirectionText(main).includes('English paragraph with سلام'), true);
}

// A bare span candidate must not walk OUTSIDE its discovery root and mark a
// parent that owns unrelated English paragraphs.
{
    const span = el('span', {}, t('یک خط فارسی'));
    const english = el('p', {}, t('English sibling'));
    const wrapper = el('div', {}, span, english);
    const engine = makeChatGptEngine();
    registeredRecipe.applyToMessage(span, engine);
    check('fallback: standalone span cannot escape its root', wrapper.getAttribute('dir'), null);
    registeredRecipe.applyToMessage(wrapper, engine);
    check('fallback: structured wrapper stays unmarked', wrapper.getAttribute('dir'), null);
    check('fallback: bare Persian span receives direction', span.getAttribute('dir'), 'rtl');
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
