'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEngine, el, t } = require('./engine-harness');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'platforms', 'linear-rtl.js'),
    'utf8'
);

let exported = null;
let registeredRecipe = null;
const head = el('head', {});
const ctx = {
    document: { head, createElement: tag => el(tag, {}) },
    window: {
        __LINEAR_RTL_TEST__(api) { exported = api; }
    },
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
    if (got !== expected) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: Linear recipe test hook did not run');
    process.exit(1);
}

function makeLinearEngine() {
    return makeEngine({
        messageSelectors: registeredRecipe.messageSelectors,
        textSelectors: registeredRecipe.textSelectors,
        excludeSelectors: [...registeredRecipe.excludeSelectors, ...registeredRecipe.codeGuardSelectors],
        rtlRegex: registeredRecipe.rtlRegex,
        rtlClass: registeredRecipe.rtlClass,
        rtlStyle: registeredRecipe.rtlStyle,
        needsRTL: registeredRecipe.needsRTL,
        isCodeLike: node => registeredRecipe.codeGuardSelectors.some(selector => node.closest?.(selector))
    });
}

check('recipe: storage key', registeredRecipe.storageKey, 'linearEnabled');
check('recipe: canonical host', registeredRecipe.hosts.includes('linear.app'), true);
check('recipe: custom block walker', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: ProseMirror text nodes are not structurally wrapped', registeredRecipe.inlineIsolate, false);
check('recipe: dedicated RTL marker', registeredRecipe.rtlClass, 'rastchin-linear-rtl');
check('selectors: stable issue view root', exported.messageSelectors.includes('[data-view-id="issue-view"]'), true);
check('selectors: ProseMirror editor', exported.messageSelectors.includes('.ProseMirror'), true);
check('selectors: current issue title label', exported.messageSelectors.includes('[aria-label="Issue title"]'), true);
check('selectors: current issue description label', exported.messageSelectors.includes('[aria-label="Issue description"]'), true);
check('selectors: current comment thread', exported.messageSelectors.includes('[data-comment-thread-container]'), true);
check('selectors: issue title', exported.messageSelectors.includes('[data-testid*="issue-title"]'), true);
check('selectors: issue description', exported.messageSelectors.includes('[data-testid*="issue-description"]'), true);
check('selectors: comments', exported.messageSelectors.includes('[data-testid*="comment-content"]'), true);
check('selectors: documents', exported.messageSelectors.includes('[data-testid*="document-content"]'), true);
check('guards: ProseMirror is not excluded', registeredRecipe.excludeSelectors.includes('.ProseMirror'), false);
check('guards: code blocks are protected', exported.codeGuardSelectors.includes('[data-node-type="codeBlock"]'), true);
check('guards: toolbars are protected', exported.uiGuardSelectors.includes('[role="toolbar"]'), true);
check('guards: generic details section content is not mistaken for Properties', exported.uiGuardSelectors.includes('[data-details-pane-section-content="true"]'), false);
check('managed roots: unlabeled issue textboxes are recognized', exported.managedContentRootSelectors.includes('[data-view-id="issue-view"] [role="textbox"]'), true);
check('engine guards: click-to-edit buttons do not prune known editors', registeredRecipe.excludeSelectors.includes('[role="button"]'), false);
check('engine guards: native buttons do not prune known editors', registeredRecipe.excludeSelectors.includes('button'), false);
check('engine guards: host asides do not prune the issue view', registeredRecipe.excludeSelectors.includes('aside'), false);
check('engine guards: host navigation does not prune the issue view', registeredRecipe.excludeSelectors.includes('nav'), false);
check('blocks: current Linear text-node class is covered', exported.contentBlockSelectors.includes('.text-node'), true);

const css = registeredRecipe.globalCss(registeredRecipe.codeGuardSelectors.join(', '));
check('css: marked Persian blocks override host alignment', css.includes('html body .rastchin-linear-rtl[dir="rtl"]'), true);
check('css: Persian blocks use Vazirmatn', css.includes('font-family: "Vazirmatn"'), true);
check('css: code remains LTR and monospace', css.includes('direction: ltr !important') && css.includes('ui-monospace'), true);
check('css: table geometry stays LTR', css.includes('table:has(.rastchin-linear-rtl[dir="rtl"])'), true);

{
    const title = el('div', { attrs: { 'data-testid': 'issue-title' } }, t('رفع مشکل RTL در Chrome'));
    const importantWrites = [];
    title.style.setProperty = (name, value, priority) => {
        importantWrites.push(`${name}:${value}:${priority}`);
    };
    const engine = makeLinearEngine();
    registeredRecipe.applyToMessage(title, engine);
    check('issue title: bare Persian title becomes RTL', title.getAttribute('dir'), 'rtl');
    check('issue title: marker class is applied', title.classList.contains('rastchin-linear-rtl'), true);
    check('issue title: direction is enforced against late Linear styles', importantWrites.includes('direction:rtl:important'), true);
    check('issue title: alignment is enforced against late Linear styles', importantWrites.includes('text-align:right:important'), true);
}

{
    // Current Linear issue page: the stable issue-view container is available
    // before its inner editors become direct engine candidates.
    const titleEditor = el(
        'div',
        { attrs: { 'aria-label': 'Issue title', contenteditable: 'true', role: 'textbox' } },
        t('آزمایش نمایش فارسی و RTL در Linear')
    );
    const description = el('p', { cls: 'text-node' }, t('این توضیح فارسی باید راست‌چین شود.'));
    const sectionHeading = el('h2', { cls: 'heading-node' }, t('موارد بررسی'));
    const listParagraph = el('p', { cls: 'text-node' }, t('این بند فهرست باید راست‌چین شود.'));
    const listItem = el('li', {}, listParagraph);
    const descriptionEditor = el(
        'div',
        { attrs: { role: 'textbox' } },
        description,
        sectionHeading,
        el('ul', {}, listItem)
    );
    const clickToEditDescription = el('div', { role: 'button' }, descriptionEditor);
    const descriptionSection = el(
        'div',
        { attrs: { 'data-details-pane-section-content': 'true' } },
        clickToEditDescription
    );
    const comment = el('p', {}, t('این نظر فارسی هم باید راست‌چین شود.'));
    const commentThread = el('div', { attrs: { 'data-comment-thread-container': 'true' } }, comment);
    const propertyText = el('p', {}, t('ویژگی رابط نباید تغییر کند'));
    const propertyControl = el('button', {}, propertyText);
    const properties = el(
        'div',
        { attrs: { 'data-details-pane-section-content': 'true' } },
        propertyControl
    );
    const issueContentPane = el('aside', {}, titleEditor, descriptionSection, commentThread);
    const issueView = el(
        'div',
        { attrs: { 'data-view-id': 'issue-view' } },
        issueContentPane,
        properties
    );
    const hostAside = el('aside', {}, issueView);
    const engine = makeLinearEngine();

    check('current issue view: host aside does not exclude discovery root', engine.isExcluded(issueView), false);
    registeredRecipe.applyToMessage(issueView, engine);
    check('current issue view: direct title editor becomes RTL', titleEditor.getAttribute('dir'), 'rtl');
    check('current issue view: unlabeled textbox paragraph becomes RTL', description.getAttribute('dir'), 'rtl');
    check('current issue view: unlabeled textbox heading becomes RTL', sectionHeading.getAttribute('dir'), 'rtl');
    check('current issue view: unlabeled textbox list item becomes RTL', listItem.getAttribute('dir'), 'rtl');
    check('current issue view: nested list paragraph becomes RTL', listParagraph.getAttribute('dir'), 'rtl');
    check('current issue view: comment paragraph becomes RTL', comment.getAttribute('dir'), 'rtl');
    check('current issue view: property control remains untouched', propertyText.getAttribute('dir'), null);
    check('current issue view: click-to-edit wrapper remains untouched', clickToEditDescription.getAttribute('dir'), null);
    check('current issue view: inner content pane remains untouched', issueContentPane.getAttribute('dir'), null);
    check('current issue view: owning layout remains untouched', issueView.getAttribute('dir'), null);
    check('current issue view: outer host aside remains untouched', hostAside.getAttribute('dir'), null);
}

{
    const titleInput = el('input', { attrs: { 'aria-label': 'Issue title' } });
    titleInput.value = 'عنوان فارسی ورودی';
    registeredRecipe.applyToMessage(titleInput, makeLinearEngine());
    check('issue title input: value text becomes RTL', titleInput.getAttribute('dir'), 'rtl');
}

{
    const titleLine = el('p', { cls: 'text-node' }, t('عنوان فارسی مسئله'));
    const titleEditor = el(
        'div',
        { cls: 'editor ProseMirror', attrs: { 'aria-label': 'Issue title', contenteditable: 'true', role: 'textbox' } },
        titleLine
    );
    const clickToEditSurface = el('div', { role: 'button' }, titleEditor);
    registeredRecipe.applyToMessage(titleEditor, makeLinearEngine());
    check('current title: editor content attributes are untouched', titleLine.getAttribute('dir'), null);
    check('current title: title root is RTL', titleEditor.getAttribute('dir'), 'rtl');
    check('current title: outer click surface remains untouched', clickToEditSurface.getAttribute('dir'), null);
}

{
    const english = el('p', {}, t('English release notes'));
    const persian = el('p', {}, t('توضیحات مسئله برای نسخه v1.2.3 و API جدید.'));
    const code = el('pre', { attrs: { 'data-node-type': 'codeBlock' } },
        el('code', {}, t('pnpm test --filter linear'))
    );
    const editor = el(
        'div',
        { cls: 'ProseMirror', attrs: { contenteditable: 'true', role: 'textbox' } },
        english,
        persian,
        code
    );
    const engine = makeLinearEngine();
    registeredRecipe.applyToMessage(editor, engine);

    check('editor: root layout remains untouched when child blocks exist', editor.getAttribute('dir'), null);
    check('editor: English paragraph remains native', english.getAttribute('dir'), null);
    check('editor: Persian paragraph attributes are untouched', persian.getAttribute('dir'), null);
    check('editor: Persian paragraph has no inline alignment', persian.style.textAlign || '', '');
    const scope = editor.getAttribute('data-rastchin-linear-editor');
    check('editor: Persian rule lives outside content', head.querySelector('style').textContent.includes(`[data-rastchin-linear-editor="${scope}"] > p:nth-child(2) { direction: rtl !important; text-align: right`), true);
    check('editor: English rule is explicit', head.querySelector('style').textContent.includes(`[data-rastchin-linear-editor="${scope}"] > p:nth-child(1) { direction: ltr`), true);
    check('editor: code block remains untouched', code.getAttribute('dir'), null);
}

{
    const persian = el('p', { cls: 'text-node' }, t('توضیحات فارسی مسئله در Linear'));
    const toolbarText = el('p', {}, t('متن رابط نباید راست‌چین شود'));
    const toolbar = el('div', { role: 'toolbar' }, toolbarText);
    const editor = el(
        'div',
        { cls: 'editor ProseMirror', attrs: { 'aria-label': 'Issue description', contenteditable: 'true', role: 'textbox' } },
        persian,
        toolbar
    );
    const clickToEditSurface = el('div', { role: 'button' }, editor);
    registeredRecipe.applyToMessage(editor, makeLinearEngine());
    check('current description: editor content attributes are untouched', persian.getAttribute('dir'), null);
    check('current description: click surface does not suppress editor CSS', editor.hasAttribute('data-rastchin-linear-editor'), true);
    check('current description: nested toolbar content stays untouched', toolbarText.getAttribute('dir'), null);
    check('current description: click surface remains untouched', clickToEditSurface.getAttribute('dir'), null);
}

{
    const persianCell = el('td', {}, t('وضعیت: انجام شد'));
    const englishCell = el('td', {}, t('Status: Done'));
    const table = el('table', {}, el('tr', {}, persianCell, englishCell));
    const document = el('div', { attrs: { 'data-testid': 'document-content' } }, table);
    registeredRecipe.applyToMessage(document, makeLinearEngine());
    check('table: table geometry remains untouched', table.getAttribute('dir'), null);
    check('table: Persian cell becomes RTL', persianCell.getAttribute('dir'), 'rtl');
    check('table: English cell remains native', englishCell.getAttribute('dir'), null);
}

{
    const comment = el('p', { cls: 'text-node' }, t('این نظر فارسی باید راست‌چین شود.'));
    const commentRoot = el('div', { attrs: { 'data-comment-thread-container': 'true' } }, comment);
    const clickSurface = el('div', { role: 'button' }, commentRoot);
    registeredRecipe.applyToMessage(commentRoot, makeLinearEngine());
    check('current comment: thread inside click surface becomes RTL', comment.getAttribute('dir'), 'rtl');
    check('current comment: outer click surface remains untouched', clickSurface.getAttribute('dir'), null);
}

{
    const actionText = el('p', {}, t('این متن متعلق به دکمه است'));
    const action = el('button', {}, actionText);
    const article = el('article', {}, action);
    registeredRecipe.applyToMessage(article, makeLinearEngine());
    check('regression: unrelated button content remains untouched', actionText.getAttribute('dir'), null);
}

{
    const comment = el('p', {}, t('این نظر باید راست‌چین نمایش داده شود.'));
    const commentRoot = el('article', { attrs: { 'data-testid': 'comment-content' } }, comment);
    const toolbar = el('div', { role: 'toolbar' }, el('button', {}, t('Reply')));
    commentRoot.append(toolbar);
    registeredRecipe.applyToMessage(commentRoot, makeLinearEngine());
    check('comment: Persian comment becomes RTL', comment.getAttribute('dir'), 'rtl');
    check('comment: toolbar remains untouched', toolbar.getAttribute('dir'), null);
}

{
    const englishFirst = el('p', {}, t('API status changed after اصلاح تنظیمات.'));
    const editor = el('div', { cls: 'ProseMirror' }, englishFirst);
    registeredRecipe.applyToMessage(editor, makeLinearEngine());
    check('mixed text: English-first paragraph remains native', englishFirst.getAttribute('dir'), null);
}

{
    const textNode = t('نظر فارسی اولیه');
    const paragraph = el('p', {}, textNode);
    const root = el('article', {}, paragraph);
    const engine = makeLinearEngine();
    registeredRecipe.applyToMessage(root, engine);
    textNode.textContent = 'English replacement';
    registeredRecipe.applyToMessage(root, engine);
    check('dynamic update: changed English content restores direction', paragraph.getAttribute('dir'), null);
    check('dynamic update: marker class is restored', paragraph.classList.contains('rastchin-linear-rtl'), false);
}

{
    const title = el('span', { cls: 'sc2sx-Text-c50a30fa' }, t('آزمایش فارسی در Linear'));
    const status = el('div', { attrs: { 'data-menu-open': 'false' } });
    const identifier = el('span', { cls: 'sc2sx-Text-c50a30fa' }, t('OME-64'));
    const badge = el('span', { cls: 'sc2sx-Text-c50a30fa' }, t('برچسب فارسی'));
    const card = el('a', { attrs: { 'data-board-item': 'true', href: '/omega-do/issue/OME-64/test' } },
        el('div', { attrs: { 'data-contextual-menu': 'true' } },
            el('div', {}, identifier, el('div', {}, status, title)), el('div', {}, badge)));
    const engine = makeLinearEngine();
    const candidates = new Set();
    engine.collectCandidates(card, candidates);
    check('board: card is discovered by the engine', candidates.has(card), true);
    candidates.forEach(candidate => registeredRecipe.applyToMessage(candidate, engine));
    check('board: title is RTL', title.getAttribute('dir'), 'rtl');
    check('board: card layout is unchanged', card.getAttribute('dir'), null);
    check('board: identifier is unchanged', identifier.getAttribute('dir'), null);
    check('board: unrelated Persian badge is unchanged', badge.getAttribute('dir'), null);
}

registeredRecipe.onDisable();
check('disable: editor stylesheet removed', head.childNodes.length, 0);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
}

console.log(`${failures} FAILURE(S) of ${total} assertions`);
process.exit(1);
