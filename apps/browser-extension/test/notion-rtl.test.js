'use strict';
// Regression suite for Notion's scoped content-block recipe contract.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'notion-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        location: { hostname: 'www.notion.so' },
        __NOTION_RTL_TEST__(api) { exported = api; }
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
    console.error('FATAL: Notion recipe test hook did not run');
    process.exit(1);
}

check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'notionEnabled');
check('recipe: host notion.so', registeredRecipe.hosts.includes('notion.so'), true);
check('recipe: host www.notion.so', registeredRecipe.hosts.includes('www.notion.so'), true);
check('recipe: host app.notion.so', registeredRecipe.hosts.includes('app.notion.so'), true);
check('recipe: custom notion.site suffix', registeredRecipe.hostSuffixes.includes('.notion.site'), true);
check('recipe: text block selector', registeredRecipe.messageSelectors.includes('.notion-text-block'), true);
check('recipe: callout selector', registeredRecipe.messageSelectors.includes('.notion-callout-block'), true);
check('recipe: generic block selector', registeredRecipe.messageSelectors.includes('[data-block-id]'), true);
check('recipe: editable leaf selector', registeredRecipe.messageSelectors.includes('[data-content-editable-leaf="true"]'), true);
check('recipe: excludes database views', registeredRecipe.excludeSelectors.includes('.notion-collection_view-block'), true);
check('recipe: excludes tables', registeredRecipe.excludeSelectors.includes('.notion-table-block'), true);
check('recipe: page block no longer excludes all content', registeredRecipe.excludeSelectors.includes('.notion-page-block'), false);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has scoped code/out-of-scope guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: does not define RTL style overrides', registeredRecipe.rtlStyle, undefined);

check('host: www.notion.so supported', exported.isSupportedHost('www.notion.so'), true);
check('host: app.notion.so supported', exported.isSupportedHost('app.notion.so'), true);
check('host: custom notion.site supported', exported.isSupportedHost('team.notion.site'), true);
check('host: unrelated host unsupported', exported.isSupportedHost('example.com'), false);
check('scope: exports text block selectors', exported.textBlockSelectors.includes('.notion-text-block'), true);
check('scope: exports out-of-scope selectors', exported.outOfScopeSelectors.includes('.notion-table-block'), true);

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
