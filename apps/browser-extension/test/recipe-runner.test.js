'use strict';
// Regression suite for the recipe runner (src/core/recipe-runner.js).
// Run: `node test/recipe-runner.test.js` (or via `pnpm test`). Exits non-zero on failure.
// Covers buildEngineConfig (pure config + isCodeLike, incl. the no-code-guard
// safety path) and runPlatformRecipe (host gate, engine build, no-chatbotConfig
// fallback, subscribe/toggle, <style> inject/remove idempotency, beforeunload
// cleanup) via light mocks of window/document/RTLEngine/chatbotConfig, plus a
// static manifest load-order assertion. Browser-only behavior is NOT covered here.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RUNNER_PATH = path.join(__dirname, '..', 'src', 'core', 'recipe-runner.js');
const MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');
const source = fs.readFileSync(RUNNER_PATH, 'utf8');

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (got !== expected) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- mocks ---
function makeRTLEngineClass(instances) {
    return class {
        constructor(cfg) {
            this.cfg = cfg;
            this.enabled = true;
            this.log = [];
            instances.push(this);
        }
        setEnabled(v) { this.enabled = v; this.log.push('setEnabled:' + v); }
        init() { this.log.push('init'); }
        scheduleScan() { this.log.push('scheduleScan'); }
        restoreStyles() { this.log.push('restoreStyles'); }
    };
}

function makeDocument() {
    const head = { children: [] };
    const body = { __isBody: true, children: [] };
    head.appendChild = node => { head.children.push(node); return node; };
    body.appendChild = node => { body.children.push(node); return node; };
    return {
        head,
        body,
        documentElement: {},
        querySelectorAll: selector => selector ? [{ selector }] : [],
        createElement: tag => {
            const node = { tagName: String(tag).toUpperCase(), textContent: '', style: {}, attrs: {} };
            node.setAttribute = (name, value) => { node.attrs[name] = value; };
            node.remove = () => {
                const i = head.children.indexOf(node);
                if (i >= 0) head.children.splice(i, 1);
                const j = body.children.indexOf(node);
                if (j >= 0) body.children.splice(j, 1);
            };
            return node;
        }
    };
}

function makeWindow({ hostname, withConfig }) {
    const w = {
        location: { hostname },
        listeners: {},
        addEventListener: (type, handler) => { w.listeners[type] = handler; }
    };
    if (withConfig) {
        w.subCallback = null;
        w.unsubscribed = false;
        w.chatbotConfig = {
            subscribe: cb => { w.subCallback = cb; return () => { w.unsubscribed = true; }; }
        };
    }
    return w;
}

// Builds a fresh contextified sandbox (no HTMLElement defined, so the runner's
// `typeof HTMLElement` guard path is exercised, as in a real Node run).
function makeCtx({ hostname, withConfig, withDebug } = {}) {
    const instances = [];
    const window = makeWindow({ hostname, withConfig });
    const document = makeDocument();
    const ctx = {
        window,
        document,
        RTLEngine: makeRTLEngineClass(instances),
        localStorage: { getItem: key => (withDebug && key === 'rastchin:debug' ? '1' : null) },
        setInterval: fn => { fn(); return 1; },
        clearInterval: () => {},
        console: { ...console, warn: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return { api: ctx.RastChinRecipe, instances, window, document };
}

const recipe = {
    version: 1,
    storageKey: 'chatgptEnabled',
    hosts: ['chat.openai.com', 'chatgpt.com'],
    hostSuffixes: ['.chatgpt.test'],
    rtlRegex: /\p{Script=Arabic}/u,
    messageSelectors: ['[data-testid="conversation-turn"]', '[data-message-author-role]'],
    textSelectors: ['p', 'div', 'span'],
    codeGuardSelectors: ['code', 'pre'],
    excludeSelectors: ['input', 'textarea'],
    rtlClass: 'rastchin-rtl-text',
    rtlStyle: { unicodeBidi: 'isolate' },
    observeCharacterData: false,
    globalCss: codeGuard => `${codeGuard} { direction: ltr !important; }`
};

// --- buildEngineConfig (pure) ---
{
    const { api } = makeCtx();
    check('api: exposes supported recipe version', api.RECIPE_VERSION, 1);
    const cfg = api.buildEngineConfig(recipe);
    check('buildEngineConfig: messageSelectors passthrough', eq(cfg.messageSelectors, recipe.messageSelectors), true);
    check('buildEngineConfig: excludeSelectors = excludes + codeGuards', eq(cfg.excludeSelectors, ['input', 'textarea', 'code', 'pre']), true);
    check('buildEngineConfig: textSelectors passthrough', eq(cfg.textSelectors, recipe.textSelectors), true);
    check('buildEngineConfig: rtlRegex preserved', cfg.rtlRegex, recipe.rtlRegex);
    check('buildEngineConfig: rtlClass passthrough', cfg.rtlClass, recipe.rtlClass);
    check('buildEngineConfig: rtlStyle default unicodeBidi', cfg.rtlStyle.unicodeBidi, 'isolate');
    check('buildEngineConfig: observeCharacterData passthrough', cfg.observeCharacterData, false);
    check('buildEngineConfig: isCodeLike(null) -> true', cfg.isCodeLike(null), true);
    check('buildEngineConfig: isCodeLike(code-matching node) -> true', cfg.isCodeLike({ closest: () => ({}) }), true);
    check('buildEngineConfig: isCodeLike(plain node) -> false', cfg.isCodeLike({ closest: () => null }), false);
}

// --- buildEngineConfig: recipe WITHOUT code guards (empty-selector safety) ---
{
    const { api } = makeCtx();
    const noGuard = { ...recipe, codeGuardSelectors: undefined };
    const cfg = api.buildEngineConfig(noGuard);
    check('no-guard: excludeSelectors == recipe.excludeSelectors', eq(cfg.excludeSelectors, ['input', 'textarea']), true);
    // closest must NOT be called (closest('') would throw a SyntaxError in-browser).
    const throwingNode = { closest: () => { throw new Error('closest should not be called without code guards'); } };
    let threw = false;
    let result;
    try { result = cfg.isCodeLike(throwingNode); } catch (e) { threw = true; }
    check('no-guard: isCodeLike does not call closest', threw, false);
    check('no-guard: isCodeLike(plain node) -> false', result, false);
}

// --- runPlatformRecipe: unsupported recipe version gate ---
{
    const { api, instances, document } = makeCtx({ hostname: 'chatgpt.com', withConfig: false });
    const handle = api.runPlatformRecipe({ ...recipe, version: 999 });
    check('version gate: returns null for unsupported recipe version', handle, null);
    check('version gate: no engine constructed', instances.length, 0);
    check('version gate: no <style> appended', document.head.children.length, 0);
}

// --- runPlatformRecipe: missing recipe version defaults to current version ---
{
    const { api, instances } = makeCtx({ hostname: 'chatgpt.com', withConfig: false });
    const legacyRecipe = { ...recipe };
    delete legacyRecipe.version;
    api.runPlatformRecipe(legacyRecipe);
    check('version gate: missing version remains backward-compatible', instances.length, 1);
}

// --- runPlatformRecipe: host gate ---
{
    const { api, instances, document } = makeCtx({ hostname: 'evil.example.com', withConfig: false });
    const handle = api.runPlatformRecipe(recipe);
    check('host gate: returns null on non-matching host', handle, null);
    check('host gate: no engine constructed', instances.length, 0);
    check('host gate: no <style> appended', document.head.children.length, 0);
}

// --- runPlatformRecipe: host match + no-chatbotConfig fallback ---
{
    const { api, instances, document } = makeCtx({ hostname: 'chatgpt.com', withConfig: false });
    api.runPlatformRecipe(recipe);
    check('fallback: exactly one engine constructed', instances.length, 1);
    const engine = instances[0];
    check('fallback: engine.init() called', engine.log.includes('init'), true);
    check('fallback: setEnabled(false) at setup', engine.log.includes('setEnabled:false'), true);
    check('fallback: enabled immediately (no config)', engine.enabled, true);
    check('fallback: scheduleScan called', engine.log.includes('scheduleScan'), true);
    check('fallback: one <style> appended', document.head.children.length, 1);
    check('fallback: globalCss applied with code guard', document.head.children[0].textContent.includes('code, pre { direction: ltr'), true);
}

// --- runPlatformRecipe: optional host suffix match ---
{
    const { api, instances } = makeCtx({ hostname: 'workspace.chatgpt.test', withConfig: false });
    const handle = api.runPlatformRecipe(recipe);
    check('host suffix: returns a handle on suffix match', typeof handle === 'object' && handle !== null, true);
    check('host suffix: engine constructed', instances.length, 1);
}

// --- runPlatformRecipe: opt-in debug overlay ---
{
    const { api, document } = makeCtx({ hostname: 'chatgpt.com', withConfig: false, withDebug: true });
    const handle = api.runPlatformRecipe(recipe);
    check('debug: overlay appended to body', document.body.children.length, 1);
    check('debug: overlay marks itself', document.body.children[0].attrs['data-rastchin-debug'], 'true');
    check('debug: overlay includes recipe key', document.body.children[0].textContent.includes('recipe: chatgptEnabled v1'), true);
    handle.removeDebugOverlay();
    check('debug: removeDebugOverlay removes overlay', document.body.children.length, 0);
}

// --- runPlatformRecipe: subscribe + toggle ---
{
    const { api, instances, window, document } = makeCtx({ hostname: 'chat.openai.com', withConfig: true });
    const handle = api.runPlatformRecipe(recipe);
    const engine = instances[0];
    check('subscribe: returns a handle', typeof handle === 'object' && handle !== null, true);
    check('subscribe: not enabled until toggled on', engine.enabled, false);
    check('subscribe: no <style> before toggle', document.head.children.length, 0);
    check('subscribe: callback registered', typeof window.subCallback, 'function');

    window.subCallback({ key: 'someOtherKey', enabled: true });
    check('subscribe: wrong key is a no-op (still disabled)', engine.enabled, false);
    check('subscribe: wrong key adds no <style>', document.head.children.length, 0);

    window.subCallback({ key: 'chatgptEnabled', enabled: true });
    check('subscribe: correct key enables', engine.enabled, true);
    check('subscribe: enable injects one <style>', document.head.children.length, 1);
    check('subscribe: enable schedules a scan', engine.log.includes('scheduleScan'), true);

    // idempotency: a second enable must not inject a second <style>.
    window.subCallback({ key: 'chatgptEnabled', enabled: true });
    check('subscribe: re-enable is idempotent (still one <style>)', document.head.children.length, 1);

    window.subCallback({ key: 'chatgptEnabled', enabled: false });
    check('subscribe: disable restores styles', engine.log.includes('restoreStyles'), true);
    check('subscribe: disable removes <style>', document.head.children.length, 0);
    check('subscribe: disabled flag', engine.enabled, false);
}

// --- runPlatformRecipe: beforeunload cleanup ---
{
    const { api, window, document } = makeCtx({ hostname: 'chatgpt.com', withConfig: true });
    api.runPlatformRecipe(recipe);
    window.subCallback({ key: 'chatgptEnabled', enabled: true });
    check('beforeunload: handler registered', typeof window.listeners.beforeunload, 'function');
    window.listeners.beforeunload();
    check('beforeunload: <style> removed', document.head.children.length, 0);
    check('beforeunload: unsubscribed', window.unsubscribed, true);
}

// --- buildEngineConfig: function hooks (custom-walker) ---
{
    const { api } = makeCtx();
    const applyToMessage = () => true;
    const needsRTL = () => true;
    const isMessageElement = () => true;
    const isCodeLike = () => 'custom';
    const cfg = api.buildEngineConfig({ ...recipe, applyToMessage, needsRTL, isMessageElement, isCodeLike });
    check('hooks: applyToMessage forwarded', cfg.applyToMessage, applyToMessage);
    check('hooks: needsRTL forwarded', cfg.needsRTL, needsRTL);
    check('hooks: isMessageElement forwarded', cfg.isMessageElement, isMessageElement);
    check('hooks: recipe.isCodeLike overrides default', cfg.isCodeLike, isCodeLike);

    // Absent hooks must NOT appear on the config so the engine falls back to its
    // own defaults (it branches on `typeof config.<hook> === 'function'`).
    const cfgBare = api.buildEngineConfig(recipe);
    check('hooks: applyToMessage absent when not provided', 'applyToMessage' in cfgBare, false);
    check('hooks: needsRTL absent when not provided', 'needsRTL' in cfgBare, false);
    check('hooks: isMessageElement absent when not provided', 'isMessageElement' in cfgBare, false);
    check('hooks: default isCodeLike present when not provided', typeof cfgBare.isCodeLike, 'function');
}

// --- runPlatformRecipe: lifecycle hooks (onEnable/onDisable) ---
{
    const { api, window } = makeCtx({ hostname: 'chatgpt.com', withConfig: true });
    let enableCalls = 0;
    let disableCalls = 0;
    api.runPlatformRecipe({
        ...recipe,
        onEnable: () => { enableCalls += 1; },
        onDisable: () => { disableCalls += 1; }
    });
    check('lifecycle: onEnable not called before toggle', enableCalls, 0);
    check('lifecycle: onDisable not called before toggle', disableCalls, 0);

    window.subCallback({ key: 'chatgptEnabled', enabled: true });
    check('lifecycle: onEnable called on enable', enableCalls, 1);
    check('lifecycle: onDisable not called on enable', disableCalls, 0);

    window.subCallback({ key: 'chatgptEnabled', enabled: false });
    check('lifecycle: onDisable called on disable', disableCalls, 1);
    check('lifecycle: onEnable not re-called on disable', enableCalls, 1);
}

// --- runPlatformRecipe: globalCss receives (codeGuard, ctx) ---
{
    const { api, window } = makeCtx({ hostname: 'chatgpt.com', withConfig: true });
    let receivedCodeGuard = null;
    let receivedCtx = null;
    api.runPlatformRecipe({
        ...recipe,
        globalCss: (codeGuard, ctx) => { receivedCodeGuard = codeGuard; receivedCtx = ctx; return ''; }
    });
    window.subCallback({ key: 'chatgptEnabled', enabled: true });
    check('globalCss: first arg is the code-guard string', receivedCodeGuard, 'code, pre');
    check('globalCss: ctx object provided', receivedCtx !== null && typeof receivedCtx === 'object', true);
    check('globalCss: ctx.messageSelectors matches recipe', eq(receivedCtx && receivedCtx.messageSelectors, recipe.messageSelectors), true);
    check('globalCss: ctx.codeGuardSelectors matches recipe', eq(receivedCtx && receivedCtx.codeGuardSelectors, recipe.codeGuardSelectors), true);
    check('globalCss: ctx.recipeVersion provided', receivedCtx && receivedCtx.recipeVersion, 1);
    check('globalCss: ctx.supportedRecipeVersion provided', receivedCtx && receivedCtx.supportedRecipeVersion, 1);
}

// --- manifest load order (static) ---
{
    // Asserts the load-order CONTRACT for every recipe-converted platform, NOT an
    // exact entry count or a fixed converted-platform set — so converting another
    // platform (adding the runner to its entry) doesn't trigger a spurious failure.
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const entries = manifest.content_scripts || [];
    const findByMatch = m => entries.find(e => Array.isArray(e.matches) && e.matches.includes(m));
    const platformOf = js => js.find(p => p.startsWith('src/platforms/')) || '';

    // Contract: any entry that loads the runner must load it AFTER rtl-engine.js
    // and BEFORE its platform script.
    const runnerEntries = entries.filter(e => Array.isArray(e.js) && e.js.includes('src/core/recipe-runner.js'));
    check('manifest: all supported platforms load the runner', runnerEntries.length >= 12, true);
    runnerEntries.forEach(e => {
        const js = e.js;
        const label = platformOf(js) || (e.matches && e.matches[0]) || 'entry';
        const idxRunner = js.indexOf('src/core/recipe-runner.js');
        const idxEngine = js.indexOf('src/core/rtl-engine.js');
        const idxPlatform = js.indexOf(platformOf(js));
        check(`manifest: ${label} loads runner after rtl-engine`, idxEngine > -1 && idxRunner > idxEngine, true);
        check(`manifest: ${label} loads runner before platform script`, idxPlatform > -1 && idxRunner < idxPlatform, true);
    });

    // Every supported platform must load the runner.
    const chatgpt = findByMatch('https://chatgpt.com/*');
    const claude = findByMatch('https://claude.ai/*');
    const copilot = findByMatch('https://copilot.microsoft.com/*');
    const github = findByMatch('https://github.com/*');
    const vsMarketplace = findByMatch('https://marketplace.visualstudio.com/*');
    const perplexity = findByMatch('https://perplexity.ai/*');
    const qwen = findByMatch('https://qwen.ai/*');
    const arena = findByMatch('https://arena.ai/*');
    const gemini = findByMatch('https://gemini.google.com/*');
    const deepseek = findByMatch('https://chat.deepseek.com/*');
    const aistudio = findByMatch('https://aistudio.google.com/*');
    const notebooklm = findByMatch('https://notebook.google.com/*');
    const trello = findByMatch('https://trello.com/*');
    const notion = findByMatch('https://www.notion.so/*');
    check('manifest: chatgpt loads recipe-runner.js', !!chatgpt && chatgpt.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: claude loads recipe-runner.js', !!claude && claude.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: copilot loads recipe-runner.js', !!copilot && copilot.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: Microsoft Copilot no longer owns github.com', !!copilot && !copilot.matches.some(match => match.includes('github.com')), true);
    check('manifest: GitHub loads recipe-runner.js', !!github && github.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: GitHub uses its dedicated platform recipe', !!github && github.js.at(-1) === 'src/platforms/github-rtl.js', true);
    check('manifest: VS Marketplace loads recipe-runner.js',
        !!vsMarketplace && vsMarketplace.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: VS Marketplace uses its dedicated platform recipe',
        !!vsMarketplace && vsMarketplace.js.at(-1) === 'src/platforms/visual-studio-marketplace-rtl.js', true);
    check('manifest: VS Marketplace does not load global font-inject',
        !!vsMarketplace && !vsMarketplace.js.includes('src/core/font-inject.js'), true);
    check('manifest: perplexity loads recipe-runner.js', !!perplexity && perplexity.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: qwen loads recipe-runner.js', !!qwen && qwen.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: arena loads recipe-runner.js', !!arena && arena.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: gemini loads recipe-runner.js', !!gemini && gemini.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: deepseek loads recipe-runner.js', !!deepseek && deepseek.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: aistudio loads recipe-runner.js', !!aistudio && aistudio.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: notebooklm loads recipe-runner.js', !!notebooklm && notebooklm.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: trello loads recipe-runner.js', !!trello && trello.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: trello does not load global font-inject', !!trello && !trello.js.includes('src/core/font-inject.js'), true);
    check('manifest: trello does not load global auto-direction', !!trello && !trello.js.includes('src/core/auto-direction.js'), true);
    check('manifest: notion loads recipe-runner.js', !!notion && notion.js.includes('src/core/recipe-runner.js'), true);
    check('manifest: notion does not load global font-inject', !!notion && !notion.js.includes('src/core/font-inject.js'), true);
    check('manifest: notion does not load global auto-direction', !!notion && !notion.js.includes('src/core/auto-direction.js'), true);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
} else {
    console.log(`\n${failures} FAILED of ${total}`);
    process.exit(1);
}
