'use strict';
// Regression suite for Notion's scoped content-block recipe contract.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { El, el, t } = require('./engine-harness');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'notion-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'www.notion.so' },
        getComputedStyle: node => node.__computedStyle || {},
        __NOTION_RTL_TEST__(api) { exported = api; }
    },
    HTMLElement: El,
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

function mutableStyle() {
    const properties = new Map();
    return {
        setProperty(name, value, priority) { properties.set(name, { value, priority }); },
        getPropertyValue(name) { return properties.get(name)?.value || ''; },
        getPropertyPriority(name) { return properties.get(name)?.priority || ''; },
        removeProperty(name) { properties.delete(name); }
    };
}

function directionEngine() {
    return {
        collectDirectionText: target => target.textContent || '',
        applyRTL(target) {
            target.setAttribute('dir', 'rtl');
            target.style.direction = 'rtl';
            target.style.textAlign = 'right';
        }
    };
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: Notion recipe test hook did not run');
    process.exit(1);
}

check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'notionEnabled');
check('recipe: host notion.so', registeredRecipe.hosts.includes('notion.so'), true);
check('recipe: host www.notion.so', registeredRecipe.hosts.includes('www.notion.so'), true);
check('recipe: host app.notion.so', registeredRecipe.hosts.includes('app.notion.so'), true);
check('recipe: host app.notion.com', registeredRecipe.hosts.includes('app.notion.com'), true);
check('recipe: custom notion.site suffix', registeredRecipe.hostSuffixes.includes('.notion.site'), true);
check('recipe: text block selector', registeredRecipe.messageSelectors.includes('.notion-text-block'), true);
check('recipe: callout selector', registeredRecipe.messageSelectors.includes('.notion-callout-block'), true);
check('recipe: generic block selector', registeredRecipe.messageSelectors.includes('[data-block-id]'), true);
check('recipe: current property-value selector', registeredRecipe.messageSelectors.includes('[data-testid="property-value"]'), true);
check('recipe: editable leaf selector', registeredRecipe.messageSelectors.includes('[data-content-editable-leaf="true"]'), true);
check('recipe: database views use scoped predicate instead of static ancestor exclusion', registeredRecipe.excludeSelectors.includes('.notion-collection_view-block'), false);
check('recipe: table views use scoped predicate instead of static ancestor exclusion', registeredRecipe.excludeSelectors.includes('.notion-table-block'), false);
check('recipe: page block no longer excludes all content', registeredRecipe.excludeSelectors.includes('.notion-page-block'), false);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has scoped code/out-of-scope guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: does not define RTL style overrides', registeredRecipe.rtlStyle, undefined);

check('host: www.notion.so supported', exported.isSupportedHost('www.notion.so'), true);
check('host: app.notion.so supported', exported.isSupportedHost('app.notion.so'), true);
check('host: app.notion.com supported', exported.isSupportedHost('app.notion.com'), true);
check('host: custom notion.site supported', exported.isSupportedHost('team.notion.site'), true);
check('host: unrelated host unsupported', exported.isSupportedHost('example.com'), false);
check('scope: exports text block selectors', exported.textBlockSelectors.includes('.notion-text-block'), true);
check('scope: exports out-of-scope selectors', exported.outOfScopeSelectors.includes('.notion-table-block'), true);
check('scope: exports database scope selectors', exported.databaseScopeSelectors.includes('.notion-table-view'), true);

{
    // Mirrors the current app.notion.com DOM reported from DevTools:
    // property-value(button) > wrapper > notion-table-view-cell > row >
    // notion-collection-item > notion-table-view.
    const textSpan = el('span', {}, t('Quick Task — آماده‌سازی لپ‌تاپ و workflow Codex برای MasterTube'));
    textSpan.textContent = 'Quick Task — آماده‌سازی لپ‌تاپ و workflow Codex برای MasterTube';
    const leaf = el('div', {
        role: 'button',
        attrs: { 'data-testid': 'property-value' },
        computedStyle: { display: 'block' }
    }, textSpan);
    leaf.textContent = 'Quick Task — آماده‌سازی لپ‌تاپ و workflow Codex برای MasterTube';
    const inner = el('div', { computedStyle: { display: 'flex' } }, leaf);
    const cell = el('div', { cls: 'notion-table-view-cell', computedStyle: { display: 'flex' } }, inner);
    const row = el('div', { cls: 'notion-table-view-row', computedStyle: { display: 'flex' } }, cell);
    const item = el('div', {
        cls: 'notion-selectable notion-page-block notion-collection-item',
        attrs: { 'data-block-id': 'row-id' },
        computedStyle: { display: 'flex' }
    }, row);
    el('div', { cls: 'notion-table-view', computedStyle: { display: 'block' } }, item);

    check('database: rich-text leaf is a safe font target', exported.isDatabaseTextTarget(leaf), true);
    check('database: nested rich-text span is readable inside the safe target', exported.isWithinDatabaseTextTarget(textSpan), true);
    check('database: nested rich-text span passes the database exclusion', exported.isOutOfScope(textSpan), false);
    check('database: nested rich-text span is not itself the styled target', exported.isDatabaseTextTarget(textSpan), false);
    check('database: rich-text leaf passes the database exclusion', exported.isOutOfScope(leaf), false);
    check('database: cell layout remains excluded', exported.isOutOfScope(cell), true);
    check('database: cell layout is not treated as a text block', exported.isNotionTextBlock(cell), false);
    check('database: rich-text leaf is treated as a text block', exported.isNotionTextBlock(leaf), true);

    leaf.style = mutableStyle();
    const engine = directionEngine();
    registeredRecipe.applyToMessage(leaf, engine);
    check('database: Persian rich-text leaf receives RTL', leaf.getAttribute('dir'), 'rtl');
    check('database: Persian rich-text leaf is right aligned', leaf.style.textAlign, 'right');
    check('database: Persian rich-text leaf receives Vazirmatn', leaf.style.getPropertyValue('font-family').includes('Vazirmatn'), true);
    check('database: cell layout receives no direction', cell.getAttribute('dir'), null);
    check('database: row layout receives no direction', row.getAttribute('dir'), null);
    check('database: collection item layout receives no direction', item.getAttribute('dir'), null);
}

{
    // Current internal-page title: editable H1 text leaf inside a flex page block.
    const title = el('h1', {
        role: 'textbox',
        attrs: { 'data-content-editable-leaf': 'true', contenteditable: 'false' },
        computedStyle: { display: 'block' }
    }, t('Quick Task — آماده‌سازی لپ‌تاپ و workflow Codex برای MasterTube'));
    title.textContent = 'Quick Task — آماده‌سازی لپ‌تاپ و workflow Codex برای MasterTube';
    title.style = mutableStyle();
    const titleBlock = el('div', {
        cls: 'notion-selectable notion-page-block',
        attrs: { 'data-block-id': 'page-id' },
        computedStyle: { display: 'flex' }
    }, title);
    titleBlock.textContent = title.textContent;

    check('page title: H1 is a safe direction target', exported.isDirectionTarget(title), true);
    check('page title: flex wrapper is not a direction target', exported.isDirectionTarget(titleBlock), false);
    registeredRecipe.applyToMessage(title, directionEngine());
    check('page title: mixed Persian title receives RTL', title.getAttribute('dir'), 'rtl');
    check('page title: mixed Persian title is right aligned', title.style.textAlign, 'right');
    check('page title: flex wrapper direction is untouched', titleBlock.getAttribute('dir'), null);
}

{
    // Internal-page property: inline spans live inside a block property-value;
    // direction belongs on the block, never the span or cell/row layout.
    const valueSpan = el('span', { computedStyle: { display: 'inline' } }, t('شروع شوند، friction را آماده کن'));
    valueSpan.textContent = 'شروع شوند، friction را آماده کن';
    valueSpan.style = mutableStyle();
    const propertyValue = el('div', {
        role: 'button',
        attrs: { 'data-testid': 'property-value' },
        computedStyle: { display: 'block' }
    }, valueSpan);
    propertyValue.textContent = valueSpan.textContent;
    propertyValue.style = mutableStyle();
    const propertyCell = el('div', { role: 'cell', computedStyle: { display: 'flex' } }, propertyValue);

    check('page property: property-value is a safe direction target', exported.isDirectionTarget(propertyValue), true);
    check('page property: inline span is not a direction target', exported.isDirectionTarget(valueSpan), false);
    registeredRecipe.applyToMessage(propertyValue, directionEngine());
    check('page property: block value receives RTL', propertyValue.getAttribute('dir'), 'rtl');
    check('page property: block value is right aligned', propertyValue.style.textAlign, 'right');
    check('page property: inline span direction is untouched', valueSpan.getAttribute('dir'), null);
    check('page property: cell layout direction is untouched', propertyCell.getAttribute('dir'), null);
}

const css = registeredRecipe.globalCss('code, pre');
check('css: embeds Vazirmatn font-face', css.includes('@font-face') && css.includes('Vazirmatn'), true);
check('css: scope class for modified Notion blocks', css.includes('rastchin-notion-font'), true);
check('css: targets Notion editable leaves', css.includes('[data-content-editable-leaf="true"]'), true);
check('css: does not force RTL direction', css.includes('direction: rtl'), false);
check('css: does not force right alignment', css.includes('text-align: right'), false);
check('css: does not force code direction', css.includes('direction: ltr'), false);

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
