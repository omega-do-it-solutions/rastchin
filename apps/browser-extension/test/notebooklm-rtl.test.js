'use strict';
// Regression suite for NotebookLM's content-scoped RTL recipe.
// Run: `node test/notebooklm-rtl.test.js`

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    makeIsolatingEngine,
    RastChinBidi,
    El,
    el,
    t
} = require('./engine-harness');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'notebooklm-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

function createTreeWalker(root) {
    const nodes = [];
    const visit = node => {
        if (!node) return;
        if (node.nodeType === 3) {
            nodes.push(node);
            return;
        }
        for (const child of node.childNodes || []) visit(child);
    };
    visit(root);

    let index = 0;
    return {
        nextNode() {
            return nodes[index++] || null;
        }
    };
}

const ctx = {
    window: {
        location: { hostname: 'notebook.google.com' },
        getComputedStyle: node => (node && node.__computedStyle) || {},
        __NOTEBOOKLM_RTL_TEST__(api) { exported = api; }
    },
    document: {
        createTreeWalker
    },
    NodeFilter: { SHOW_TEXT: 4 },
    HTMLElement: El,
    Element: El,
    RastChinRecipe: {
        runPlatformRecipe(recipe) { registeredRecipe = recipe; }
    },
    console
};
ctx.window.window = ctx.window;

vm.createContext(ctx);
vm.runInContext(source, ctx);

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: NotebookLM recipe test hook did not run');
    process.exit(1);
}

function makeEngine() {
    return makeIsolatingEngine({
        messageSelectors: registeredRecipe.messageSelectors,
        excludeSelectors: [
            ...(registeredRecipe.excludeSelectors || []),
            ...(registeredRecipe.codeGuardSelectors || [])
        ],
        textSelectors: registeredRecipe.textSelectors,
        rtlRegex: registeredRecipe.rtlRegex,
        rtlClass: registeredRecipe.rtlClass,
        rtlStyle: registeredRecipe.rtlStyle,
        inlineIsolate: registeredRecipe.inlineIsolate,
        isMessageElement: registeredRecipe.isMessageElement,
        isCodeLike: registeredRecipe.isCodeLike
    });
}

const MARK = RastChinBidi.MARK_ATTR;
function concatText(node) {
    if (node.nodeType === 3) return node.textContent || '';
    let out = '';
    for (const child of node.childNodes || []) out += concatText(child);
    return out;
}

function wrappers(root) {
    const out = [];
    const visit = node => {
        if (node.nodeType === 1 && node.getAttribute && node.getAttribute(MARK) !== null) out.push(node);
        for (const child of node.childNodes || []) if (child.nodeType === 1) visit(child);
    };
    visit(root);
    return out;
}

function replaceText(element, text) {
    for (const child of element.childNodes || []) {
        child.parentElement = null;
    }
    const next = t(text);
    next.parentElement = element;
    element.childNodes = [next];
    return next;
}

function collect(root) {
    const engine = makeEngine();
    const candidates = new Set();
    engine.collectCandidates(root, candidates);
    return candidates;
}

// --- recipe contract: content-focused selectors, no app-wide chrome roots ---
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'notebooklmEnabled');
check('recipe: host notebook.google.com', registeredRecipe.hosts.includes('notebook.google.com'), true);
check('recipe: legacy host notebooklm.google.com remains supported', registeredRecipe.hosts.includes('notebooklm.google.com'), true);
check('recipe: inline isolation enabled', registeredRecipe.inlineIsolate, true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has custom isMessageElement', typeof registeredRecipe.isMessageElement, 'function');
check('recipe: plaintext bidi style', registeredRecipe.rtlStyle.unicodeBidi, 'plaintext');
check('recipe: exports textual fallback predicate', typeof exported.isTextualFallbackBlock, 'function');

const selectors = registeredRecipe.messageSelectors;
check('selectors: drops main app root', selectors.includes('main'), false);
check('selectors: drops broad article root', selectors.includes('article'), false);
check('selectors: drops broad section root', selectors.includes('section'), false);
check('selectors: drops broad listitem role', selectors.includes("[role='listitem']"), false);
check('selectors: drops notebook card selectors', selectors.some(sel => /notebook.*card|card/i.test(sel)), false);
check('selectors: drops project button selectors', selectors.some(sel => /project.*button/i.test(sel)), false);
check('selectors: includes chat message selector', selectors.includes('[class*="chat-message"]'), true);
check('selectors: includes output content selector', selectors.includes('[class*="output-content"]'), true);
check('selectors: includes source note selector', selectors.includes('[class*="source-note"]'), true);
check('selectors: includes note content selector', selectors.includes('[class*="note-content"]'), true);
check('selectors: includes generic paragraph fallback', selectors.includes('p'), true);
check('selectors: includes dir auto fallback', selectors.includes('[dir="auto"]'), true);
check('selectors: includes aria-live div fallback', selectors.includes('[aria-live] div'), true);

// The runner hands globalCss BOTH the code-guard string AND a cssContext when
// globalCss is a function; mirror that here so scope-aware rules are exercised.
const cssContext = {
    messageSelector: (registeredRecipe.messageSelectors || []).join(', '),
    messageSelectors: registeredRecipe.messageSelectors || [],
    codeGuardSelectors: registeredRecipe.codeGuardSelectors || [],
    excludeSelectors: registeredRecipe.excludeSelectors || [],
    recipeVersion: 1,
    supportedRecipeVersion: 1
};
const css = registeredRecipe.globalCss((registeredRecipe.codeGuardSelectors || []).join(', '), cssContext);
check('css: scoped RTL class supplies Vazirmatn', /\.rastchin-rtl-text\s*\{[\s\S]*font-family:\s*"Vazirmatn"/.test(css), true);
check('css: code guard remains LTR', /direction:\s*ltr\s*!important/.test(css), true);
check('css: code guard gets isolate', /unicode-bidi:\s*isolate\s*!important/.test(css), true);
check('css: code descendants keep monospace in RTL text', /\.rastchin-rtl-text\s+:is\([\s\S]*?\)\s+\*\s*\{[\s\S]*ui-monospace/.test(css), true);

// --- REGRESSION (v1.1.45 bug): globalCss must emit an !important alignment rule.
// The engine writes inline text-align/direction WITHOUT !important; NotebookLM's
// Angular-Material stylesheets set alignment with !important on the same
// containers, so without an !important override here the Persian answer
// paragraphs keep NotebookLM's native (centred/left) alignment. The OLD recipe's
// globalCss emitted NO alignment rule at all — these assertions FAIL on it. ---

// Drop the code-guard block (it is intentionally `direction: ltr !important`)
// so the alignment checks only see the PROSE rules.
const proseCss = css.replace(
    new RegExp(`${(registeredRecipe.codeGuardSelectors || []).join(', ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[\\s\\S]*?\\}`),
    ''
);
check('css regression: emits text-align right !important for prose',
    /text-align:\s*right\s*!important/.test(proseCss), true);
check('css regression: emits direction rtl !important for prose',
    /direction:\s*rtl\s*!important/.test(proseCss), true);
// The alignment rule must be keyed off what the engine actually MARKS: the rtl
// class and/or the dir="rtl" attribute it sets — not a bare tag/app container.
check('css regression: alignment rule scoped to engine-marked rtl class',
    /\.rastchin-rtl-text[^{]*\{[^}]*text-align:\s*right\s*!important/.test(css)
    || /\[dir="rtl"\][^{]*\{[^}]*text-align:\s*right\s*!important/.test(css), true);
// Raised specificity: a single .class can lose an !important contest to a more
// specific Material !important rule, so the recipe pairs the class with the
// [dir="rtl"] attribute (compound selector) to win the cascade reliably.
check('css regression: alignment rule raises specificity via [dir="rtl"] compound',
    /\[dir="rtl"\]\.rastchin-rtl-text|\.rastchin-rtl-text\[dir="rtl"\]/.test(css), true);
// List indentation must also be !important so Material list padding can't win.
check('css regression: list padding uses !important',
    /\.rastchin-rtl-text\s+(?:ul|ol)[^{]*\{[^}]*padding-right:[^;]*!important/.test(css), true);

// --- chrome must NOT be flipped by globalCss: no broad `body *`/`* { direction:rtl }`
// sweep, and no bare button/toolbar/input alignment override. The only RTL
// alignment rules are gated behind the engine's own rtl class / dir attribute. ---
check('css chrome-safe: no universal direction:rtl sweep',
    /(^|[^-\w])\*\s*\{[^}]*direction:\s*rtl/.test(css), false);
check('css chrome-safe: no body-wide direction:rtl sweep',
    /\bbody\b[^{]*\{[^}]*direction:\s*rtl/.test(css), false);
// Every `direction: rtl !important` / `text-align: right !important` occurrence
// must be gated by the rtl class or the dir="rtl" attribute (engine-controlled),
// never a bare button/toolbar/input/icon selector.
{
    const blocks = css.match(/[^{}]*\{[^}]*\}/g) || [];
    const rtlAlignBlocks = blocks.filter(b => /direction:\s*rtl\s*!important|text-align:\s*right\s*!important/.test(b));
    const chromeLeak = rtlAlignBlocks.find(b => /\b(button|input|textarea|select|mat-icon|svg|\[role="toolbar"\]|\[role="button"\])\b/.test(b.split('{')[0]));
    check('css chrome-safe: no rtl-align rule targets bare chrome selectors', chromeLeak || null, null);
    const ungated = rtlAlignBlocks.find(b => !/rastchin-rtl-text|\[dir="rtl"\]/.test(b.split('{')[0]));
    check('css chrome-safe: every rtl-align rule is gated by rtl class or dir attr', ungated || null, null);
}

// --- discovery: chat/source content is found; notebook chrome/cards are not ---
{
    const chat = el('div', { cls: 'chat-message' }, el('p', {}, t('پاسخ فارسی')));
    const sourceNote = el('div', { cls: 'source-note' }, el('span', {}, t('یادداشت منبع فارسی')));
    const projectButton = el('button', { cls: 'project-button-title' }, t('عنوان پروژه فارسی'));
    const notebookCard = el('div', { cls: 'NotebookCard' }, t('کارت دفتر فارسی'));
    const app = el('main', {}, projectButton, notebookCard, chat, sourceNote);
    const candidates = collect(app);

    check('discovery: finds chat message content', candidates.has(chat), true);
    check('discovery: finds source note content', candidates.has(sourceNote), true);
    check('discovery: does not select main chrome root', candidates.has(app), false);
    check('discovery: does not select project button chrome', candidates.has(projectButton), false);
    check('discovery: does not select notebook card chrome', candidates.has(notebookCard), false);
}

// --- current NotebookLM prose can render with generated classes: generic p/dir=auto fallbacks style it ---
{
    const engine = makeEngine();
    const paragraph = el('p', {}, t('پاراگراف فارسی NotebookLM باید از راست شروع شود'));
    const shell = el('div', {}, paragraph);
    const candidates = collect(shell);
    check('fallback discovery: generic paragraph is collected', candidates.has(paragraph), true);

    registeredRecipe.applyToMessage(paragraph, engine);
    check('fallback apply: generic paragraph dir=rtl', paragraph.getAttribute('dir'), 'rtl');
    check('fallback apply: generic paragraph align right', paragraph.style.textAlign, 'right');
    check('fallback apply: generic paragraph font class', paragraph.classList.contains('rastchin-rtl-text'), true);
}

{
    const engine = makeEngine();
    const autoText = el('div', { attrs: { dir: 'auto' } }, t('متن فارسی داخل div با dir auto'));
    const candidates = collect(el('div', {}, autoText));
    check('fallback discovery: dir auto text is collected', candidates.has(autoText), true);

    registeredRecipe.applyToMessage(autoText, engine);
    check('fallback apply: dir auto text becomes rtl', autoText.getAttribute('dir'), 'rtl');
}

{
    const engine = makeEngine();
    const generatedSpan = el('span', {}, t('متن فارسی داخل ساختار بدون کلاس مشخص'));
    const generatedDiv = el('div', {}, t('پاراگراف فارسی بدون کلاس NotebookLM'));
    const buttonText = el('span', {}, t('دکمه فارسی نباید تغییر کند'));
    const button = el('button', {}, buttonText);
    const shell = el('div', {}, generatedSpan, generatedDiv, button);
    const candidates = collect(shell);

    check('fallback discovery: generated span is collected', candidates.has(generatedSpan), true);
    check('fallback discovery: generated div is collected', candidates.has(generatedDiv), true);
    check('fallback discovery: button text is ignored', candidates.has(buttonText), false);

    registeredRecipe.applyToMessage(generatedSpan, engine);
    registeredRecipe.applyToMessage(generatedDiv, engine);
    check('fallback apply: generated span dir=rtl', generatedSpan.getAttribute('dir'), 'rtl');
    check('fallback apply: generated div dir=rtl', generatedDiv.getAttribute('dir'), 'rtl');
    check('fallback apply: button text untouched', buttonText.getAttribute('dir'), null);
}

// --- chat/output Persian text gets RTL, Vazirmatn class, and inline Bidi isolation ---
{
    const engine = makeEngine();
    const answer = el('p', {}, t('این پاسخ درباره CRM و گزارش‌ها است'));
    const chat = el('div', {
        cls: 'chat-message',
        computedStyle: { display: 'flex', flexDirection: 'row' }
    }, answer);

    const handled = registeredRecipe.applyToMessage(chat, engine);
    check('chat apply: handled by recipe', handled, true);
    check('chat apply: answer dir=rtl', answer.getAttribute('dir'), 'rtl');
    check('chat apply: answer direction style', answer.style.direction, 'rtl');
    check('chat apply: answer text align', answer.style.textAlign, 'right');
    check('chat apply: answer unicode-bidi plaintext', answer.style.unicodeBidi, 'plaintext');
    check('chat apply: answer has RTL font class', answer.classList.contains('rastchin-rtl-text'), true);
    check('chat apply: Latin run isolated', wrappers(answer).map(w => concatText(w)), ['CRM']);
    check('chat apply: layout wrapper not flipped', chat.getAttribute('dir'), null);
}

// --- REGRESSION (v1.1.45 bug): a realistic NotebookLM/Angular-Material answer.
// The live DOM nests the answer prose deep inside generated mat-mdc-* / ng-*
// wrappers and a markdown render container; the actual text lives in <p> leaves.
// The recipe must reach those <p> leaves (dir=rtl + class + inline right-align)
// while the Material chrome around them — a mat-mdc-icon-button with a Persian
// aria label and a source-list chip — stays completely untouched. ---
{
    const engine = makeEngine();
    const para1 = el('p', {}, t('این پاسخ تولید شده درباره گزارش‌های CRM است'));
    const para2 = el('p', {}, t('پاراگراف دوم پاسخ که باید کاملاً از راست تراز شود'));
    // markdown render container with generated/changing classes around the leaves.
    const markdown = el('div', {
        cls: 'markdown ng-star-inserted',
        computedStyle: { display: 'block' }
    }, para1, para2);
    // The chat-message container itself is a flex layout row (NOT a text leaf).
    const messageContent = el('div', {
        cls: 'mat-mdc-card message-content mdc-card',
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, markdown);
    // Material icon button chrome with a Persian label that must NOT flip.
    const copyBtnLabel = el('span', {}, t('کپی کردن پاسخ'));
    const copyBtn = el('button', { cls: 'mat-mdc-icon-button' }, copyBtnLabel);
    const chat = el('chat-message', {
        computedStyle: { display: 'flex', flexDirection: 'row' }
    }, copyBtn, messageContent);

    // Engine discovery must reach the buried <p> leaves but not the button label.
    const candidates = collect(chat);
    check('material answer: discovers buried p leaf 1', candidates.has(para1), true);
    check('material answer: discovers buried p leaf 2', candidates.has(para2), true);
    check('material answer: does not discover icon-button label', candidates.has(copyBtnLabel), false);

    const handled = registeredRecipe.applyToMessage(chat, engine);
    check('material answer: handled by recipe', handled, true);
    check('material answer: leaf 1 dir=rtl', para1.getAttribute('dir'), 'rtl');
    check('material answer: leaf 1 inline right-align', para1.style.textAlign, 'right');
    check('material answer: leaf 1 inline direction rtl', para1.style.direction, 'rtl');
    check('material answer: leaf 1 has rtl class', para1.classList.contains('rastchin-rtl-text'), true);
    check('material answer: leaf 2 dir=rtl', para2.getAttribute('dir'), 'rtl');
    check('material answer: leaf 2 inline right-align', para2.style.textAlign, 'right');
    check('material answer: leaf 2 has rtl class', para2.classList.contains('rastchin-rtl-text'), true);
    check('material answer: Latin CRM run isolated in leaf 1', wrappers(para1).map(w => concatText(w)), ['CRM']);
    // Chrome stays untouched: flex layout wrappers and the icon button label.
    check('material answer: chat-message wrapper not flipped', chat.getAttribute('dir'), null);
    check('material answer: message-content flex wrapper not flipped', messageContent.getAttribute('dir'), null);
    check('material answer: icon-button label not flipped', copyBtnLabel.getAttribute('dir'), null);
    check('material answer: icon-button label has no rtl class', copyBtnLabel.classList.contains('rastchin-rtl-text'), false);
}

// --- source-note Persian text is styled at the text leaf, not the source-note wrapper ---
{
    const engine = makeEngine();
    const label = el('span', {}, t('یادداشت منبع درباره React است'));
    const sourceNote = el('div', {
        attrs: { 'data-testid': 'source-note' },
        computedStyle: { display: 'grid' }
    }, label);

    registeredRecipe.applyToMessage(sourceNote, engine);
    check('source note: leaf dir=rtl', label.getAttribute('dir'), 'rtl');
    check('source note: leaf has RTL font class', label.classList.contains('rastchin-rtl-text'), true);
    check('source note: Latin run isolated', wrappers(label).map(w => concatText(w)), ['React']);
    check('source note: wrapper not flipped', sourceNote.getAttribute('dir'), null);
}

// --- code inside Persian output stays code-like and is not wrapped/styled ---
{
    const engine = makeEngine();
    const code = el('code', {}, t('const label = "فارسی";'));
    const paragraph = el('p', {}, t('نمونه POS برای خروجی '), code);
    const output = el('div', { cls: 'output-content' }, paragraph);

    registeredRecipe.applyToMessage(output, engine);
    check('code guard: paragraph dir=rtl', paragraph.getAttribute('dir'), 'rtl');
    check('code guard: paragraph Latin run isolated', wrappers(paragraph).map(w => concatText(w)), ['POS']);
    check('code guard: code has no dir', code.getAttribute('dir'), null);
    check('code guard: code has no RTL class', code.classList.contains('rastchin-rtl-text'), false);
    check('code guard: code not isolated', wrappers(code).length, 0);
}

// --- transition back to English restores the previously styled source leaf ---
{
    const engine = makeEngine();
    const label = el('span', {}, t('متن فارسی با POS'));
    const sourceNote = el('div', { cls: 'source-note' }, label);

    registeredRecipe.applyToMessage(sourceNote, engine);
    replaceText(label, 'English only POS');
    registeredRecipe.applyToMessage(sourceNote, engine);

    check('restore: leaf dir removed', label.getAttribute('dir'), null);
    check('restore: leaf class removed', label.classList.contains('rastchin-rtl-text'), false);
    check('restore: isolation removed', wrappers(label).length, 0);
}

// --- REGRESSION (v1.1.46 incomplete): some Persian answer lines stayed left.
// The live answer body nests each visual line in generated div/span leaves;
// resolveTextTarget marks the nearest stylable ancestor, but when that ancestor
// is a row-flex/grid LAYOUT container the walk overshoots to a higher block,
// leaving the actual line leaves UNMARKED. Those leaves keep NotebookLM's own
// Material `text-align:left/center !important`, so they render left while the
// marked ancestor is right-aligned (the "some lines RTL, adjacent lines left"
// screenshot bug). The fix forces EVERY prose-text leaf inside a marked
// `.rastchin-rtl-text` block to direction:rtl/text-align:right via a scoped
// descendant !important rule. These assertions inspect that emitted rule. ---
{
    // The descendant rule must exist, be scoped under the engine-marked rtl
    // class, force BOTH direction:rtl and text-align:right with !important, and
    // cover the common prose leaf tags (div/span/p/li are the ones the live
    // answer uses for individual lines).
    const descendantRule = (css.match(/\.rastchin-rtl-text\s+:is\([^)]*\)[^{]*\{[^}]*\}/g) || [])
        .find(b => /\bspan\b/.test(b.split('{')[0]) && /\bdiv\b/.test(b.split('{')[0]));
    check('line-leaf regression: descendant prose rule exists', !!descendantRule, true);
    check('line-leaf regression: descendant rule scoped under rtl class',
        !!descendantRule && /^\s*\.rastchin-rtl-text\s/.test(descendantRule), true);
    check('line-leaf regression: descendant rule forces text-align right !important',
        !!descendantRule && /text-align:\s*right\s*!important/.test(descendantRule), true);
    check('line-leaf regression: descendant rule forces direction rtl !important',
        !!descendantRule && /direction:\s*rtl\s*!important/.test(descendantRule), true);
    check('line-leaf regression: descendant rule covers p/li/div/span leaves',
        !!descendantRule && /\bp\b/.test(descendantRule.split('{')[0])
            && /\bli\b/.test(descendantRule.split('{')[0])
            && /\bdiv\b/.test(descendantRule.split('{')[0])
            && /\bspan\b/.test(descendantRule.split('{')[0]), true);
    // The descendant rule must NOT reach into code subtrees — code stays LTR.
    check('line-leaf regression: descendant rule fences out code subtrees',
        !!descendantRule && /:not\(:is\([^)]*\)\)\s*:not\(:is\([^)]*\)\s*\*\)/.test(descendantRule.split('{')[0]), true);
    // And it must NOT add any padding/margin to the prose leaves — only
    // alignment/direction. A wide right padding/margin here would re-introduce
    // the user's marked right-side gap.
    check('line-leaf regression: descendant rule adds no padding',
        !!descendantRule && !/padding/.test(descendantRule), true);
    check('line-leaf regression: descendant rule adds no margin',
        !!descendantRule && !/margin/.test(descendantRule), true);
}

// --- REGRESSION: no broad wide right padding/margin is forced on marked prose.
// The user reported an unwanted right-side gap INSIDE the answer area. The only
// spacing RastChin injects is the conservative list-only RTL indent
// (`.rastchin-rtl-text ul/ol { padding-right }`). There must be NO bare
// `.rastchin-rtl-text { padding-right/margin-right: <wide> }` on the prose block
// itself, which is what would create the marked gap. ---
{
    const blocks = css.match(/[^{}]*\{[^}]*\}/g) || [];
    // Any rule that forces a right padding/margin must be the list-only rule.
    const rightSpacing = blocks.filter(b => /padding-right|margin-right/.test(b));
    const nonListSpacing = rightSpacing.find(b => {
        const sel = b.split('{')[0];
        // list rule selector ends in ul/ol; anything else forcing right spacing is suspect.
        return !/\b(ul|ol)\b/.test(sel);
    });
    check('right-gap regression: only list ul/ol carries injected right padding/margin',
        nonListSpacing || null, null);
    // The bare prose block class must not get a wide right padding/margin.
    const bareProseGap = blocks.find(b =>
        /^\s*\.rastchin-rtl-text\s*\{/.test(b) && /padding-right|margin-right/.test(b));
    check('right-gap regression: no wide right padding/margin on bare prose block',
        bareProseGap || null, null);
}

// --- REGRESSION: nested div/span line leaves under a marked answer block.
// applyToMessage must mark line leaves it can reach; the descendant CSS above
// covers any leaf the walk overshoots. Here every line is a div leaf directly
// bearing Persian text, wrapped in a markdown render container. Each leaf must
// end up marked dir=rtl + rtl class, and the marked subtree is right-aligned. ---
{
    const engine = makeEngine();
    const lineGreeting = el('div', {}, t('سلام، این یک خط پاسخ فارسی است'));
    const lineShort = el('div', {}, t('سلام'));
    const lineConsult = el('div', {}, t('مشاوره مالیاتیش مطرح کنه و بررسی بشه'));
    const lineDetail = el('div', {}, t('در ادامه، جزئیات هر دو کیس کاری توضیح داده می‌شود'));
    const lineTopic = el('div', {}, t('موضوع: بررسی ساختار حقوقی و مالیاتی شرکت'));
    const markdown = el('div', {
        cls: 'markdown ng-star-inserted',
        computedStyle: { display: 'block' }
    }, lineTopic, lineGreeting, lineShort, lineConsult, lineDetail);
    const answer = el('div', {
        cls: 'message-content',
        computedStyle: { display: 'flex', flexDirection: 'column' }
    }, markdown);

    const handled = registeredRecipe.applyToMessage(answer, engine);
    check('nested lines: handled by recipe', handled, true);
    check('nested lines: "سلام،" greeting marked rtl', lineGreeting.getAttribute('dir'), 'rtl');
    check('nested lines: "سلام،" greeting right-aligned', lineGreeting.style.textAlign, 'right');
    check('nested lines: short "سلام" line marked rtl', lineShort.getAttribute('dir'), 'rtl');
    check('nested lines: "مشاوره مالیاتیش" line marked rtl', lineConsult.getAttribute('dir'), 'rtl');
    check('nested lines: "در ادامه..." line marked rtl', lineDetail.getAttribute('dir'), 'rtl');
    check('nested lines: "در ادامه..." line right-aligned', lineDetail.style.textAlign, 'right');
    check('nested lines: "موضوع:" heading line marked rtl', lineTopic.getAttribute('dir'), 'rtl');
    check('nested lines: every line carries rtl class',
        [lineTopic, lineGreeting, lineShort, lineConsult, lineDetail]
            .every(l => l.classList.contains('rastchin-rtl-text')), true);
    // The column-flex layout wrappers stay untouched (not flipped).
    check('nested lines: markdown container not flipped', markdown.getAttribute('dir'), null);
    check('nested lines: message-content flex wrapper not flipped', answer.getAttribute('dir'), null);
}

// --- REGRESSION (v1.1.47 live NotebookLM): text in inline spans looked "right"
// in diagnostics but stayed visually left because text-align on an inline span
// does not align the line box. Promote inline generated answer spans to their
// nearest safe block line container, while avoiding broad wrappers with chrome. ---
{
    const engine = makeEngine();
    const inlineAnswerText = el('span', {
        computedStyle: { display: 'inline' }
    }, t('در این تماس، نام و هویت دقیق هر دو طرف کامل مشخص نشده است'));
    const lineBlock = el('div', {
        computedStyle: { display: 'block' }
    }, inlineAnswerText);
    const output = el('div', {
        cls: 'output-content',
        computedStyle: { display: 'block' }
    }, lineBlock);

    registeredRecipe.applyToMessage(output, engine);
    check('inline-span promotion: block line gets dir=rtl', lineBlock.getAttribute('dir'), 'rtl');
    check('inline-span promotion: block line right-aligned', lineBlock.style.textAlign, 'right');
    check('inline-span promotion: block line has rtl class', lineBlock.classList.contains('rastchin-rtl-text'), true);
    check('inline-span promotion: inline leaf is not the alignment target', inlineAnswerText.getAttribute('dir'), null);
    check('inline-span promotion: output wrapper not flipped', output.getAttribute('dir'), null);
}

{
    const engine = makeEngine();
    const inlineAnswerText = el('span', {
        computedStyle: { display: 'inline' }
    }, t('پیشاپیش از بررسی دقیق شما و ارائه راهکارهای منطقی، قانونی و مطمئن سپاسگزارم'));
    const citationIcon = el('mat-icon', { attrs: { 'aria-hidden': 'true' } }, t('۱'));
    const lineBlock = el('div', {
        computedStyle: { display: 'block' }
    }, inlineAnswerText, citationIcon);
    const output = el('div', {
        cls: 'output-content',
        computedStyle: { display: 'block' }
    }, lineBlock);

    registeredRecipe.applyToMessage(output, engine);
    check('inline-span passive icon: block line gets dir=rtl', lineBlock.getAttribute('dir'), 'rtl');
    check('inline-span passive icon: block line right-aligned', lineBlock.style.textAlign, 'right');
    check('inline-span passive icon: icon untouched', citationIcon.getAttribute('dir'), null);
    check('inline-span passive icon: output wrapper not flipped', output.getAttribute('dir'), null);
}

{
    const engine = makeEngine();
    const inlineAnswerText = el('span', {
        computedStyle: { display: 'inline' }
    }, t('متن فارسی داخل wrapper عمومی'));
    const chromeText = el('span', {}, t('دکمه فارسی'));
    const chromeButton = el('button', {}, chromeText);
    const mixedWrapper = el('div', {
        computedStyle: { display: 'block' }
    }, inlineAnswerText, chromeButton);

    registeredRecipe.applyToMessage(mixedWrapper, engine);
    check('inline-span safety: broad wrapper with chrome not flipped', mixedWrapper.getAttribute('dir'), null);
    check('inline-span safety: inline fallback still styled', inlineAnswerText.getAttribute('dir'), 'rtl');
    check('inline-span safety: chrome text untouched', chromeText.getAttribute('dir'), null);
}

// --- REGRESSION: a heading followed by a prose line — both must be RTL. ---
{
    const engine = makeEngine();
    const heading = el('h3', {}, t('موضوع: ساختار حقوقی و مالیاتی شرکت'));
    const prose = el('p', {}, t('در ادامه، جزئیات هر دو کیس کاری بررسی می‌شود'));
    const body = el('div', { cls: 'output-content', computedStyle: { display: 'block' } }, heading, prose);

    registeredRecipe.applyToMessage(body, engine);
    check('heading+prose: heading marked rtl', heading.getAttribute('dir'), 'rtl');
    check('heading+prose: heading right-aligned', heading.style.textAlign, 'right');
    check('heading+prose: prose marked rtl', prose.getAttribute('dir'), 'rtl');
    check('heading+prose: prose right-aligned', prose.style.textAlign, 'right');
}

// --- REGRESSION: chrome (button/source/studio) is NOT marked or flipped. ---
{
    // Persian-labelled chrome must be rejected by isNotebookLMTextBlock.
    const studioCardTitle = el('span', {}, t('استودیو فارسی'));
    const studioCard = el('button', { cls: 'NotebookCard project-button' }, studioCardTitle);
    const toolbarBtn = el('button', { attrs: { 'role': 'button' } }, t('اشتراک‌گذاری'));
    const sourceCtrl = el('mat-icon', {}, t('منبع'));
    check('chrome-safe: studio card not a text block', exported.isNotebookLMTextBlock(studioCard), false);
    check('chrome-safe: studio card title not a text block', exported.isNotebookLMTextBlock(studioCardTitle), false);
    check('chrome-safe: toolbar button not a text block', exported.isNotebookLMTextBlock(toolbarBtn), false);
    check('chrome-safe: source control icon not a text block', exported.isNotebookLMTextBlock(sourceCtrl), false);
    // chromeSelector must still catch these so the engine excludes them.
    check('chrome-safe: button matches chrome selector', toolbarBtn.matches(exported.chromeSelector), true);
    check('chrome-safe: notebook card matches chrome selector', studioCard.matches(exported.chromeSelector), true);

    // Even when reached via applyToMessage, chrome stays untouched.
    const engine = makeEngine();
    registeredRecipe.applyToMessage(studioCard, engine);
    check('chrome-safe: studio card title not flipped', studioCardTitle.getAttribute('dir'), null);
    check('chrome-safe: studio card title has no rtl class',
        studioCardTitle.classList.contains('rastchin-rtl-text'), false);
}

// --- REGRESSION: a code block inside a Persian answer stays LTR (untouched). ---
{
    const engine = makeEngine();
    const codeBlock = el('pre', { cls: 'code-block' }, el('code', {}, t('const مالیات = 1;')));
    const prose = el('p', {}, t('این نمونه کد برای محاسبه مالیات است'));
    const answer = el('div', { cls: 'output-content', computedStyle: { display: 'block' } }, prose, codeBlock);

    registeredRecipe.applyToMessage(answer, engine);
    check('code untouched: prose marked rtl', prose.getAttribute('dir'), 'rtl');
    check('code untouched: pre has no dir', codeBlock.getAttribute('dir'), null);
    check('code untouched: pre has no rtl class', codeBlock.classList.contains('rastchin-rtl-text'), false);
    // The emitted code-guard CSS keeps code LTR.
    check('code untouched: code guard rule forces ltr', /direction:\s*ltr\s*!important/.test(css), true);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
