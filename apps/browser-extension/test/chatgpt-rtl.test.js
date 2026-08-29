'use strict';
// Regression suite for ChatGPT's recipe: narrow selectors (streaming safety),
// scoped response font, and NO text-node wrapping / heavy inline mutation.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// --- no text-node wrapping / custom mutation path ---
check('recipe: no custom applyToMessage (engine sets dir only, never wraps)', typeof registeredRecipe.applyToMessage, 'undefined');
check('source: never replaces live text nodes (no replaceChild)', /replaceChild/.test(source), false);
check('source: never wraps text in injected spans (no createElement)', /createElement\(/.test(source), false);

// --- code / url / email / table preserved ---
check('codeGuard: protects code', registeredRecipe.codeGuardSelectors.includes('code'), true);
check('codeGuard: protects pre', registeredRecipe.codeGuardSelectors.includes('pre'), true);
check('bidi: isolate keeps inline LTR runs (url/email/code) readable', registeredRecipe.rtlStyle.unicodeBidi, 'isolate');
check('composer: excluded from RTL', registeredRecipe.excludeSelectors.includes('[data-type="unified-composer"]'), true);
check('composer: editable excluded', registeredRecipe.excludeSelectors.includes('[contenteditable="true"]'), true);

// --- scoped response font (font-inject skips response, recipe supplies the font) ---
const css = registeredRecipe.globalCss((registeredRecipe.codeGuardSelectors || []).join(', '), { messageSelectors });
check('css: code guard stays LTR', /direction:\s*ltr\s*!important/.test(css), true);
check('css: supplies Vazirmatn response font', css.includes('"Vazirmatn"'), true);
check('css: response font scoped to the font-inject-skipped containers', css.includes(':is([data-message-author-role], [data-testid="conversation-turn"])'), true);
check('css: response font also targets the container itself (bare-div user bubble)', css.includes(':is([data-message-author-role], [data-testid="conversation-turn"]),'), true);
check('css: response font element list includes div (bare-div user text)', css.includes('h6, div, span,'), true);
check('css: code keeps a monospace stack inside messages', css.includes('ui-monospace'), true);
check('css: code descendants keep monospace despite response div/span font rule', /:is\(code,[\s\S]*?\)\s+\*\s*\{[\s\S]*?ui-monospace/.test(css), true);

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

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
}
