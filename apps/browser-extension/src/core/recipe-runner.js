// scripts/recipe-runner.js
'use strict';

// Declarative platform "recipe" runner. A recipe describes a platform's exact
// hosts, optional host suffixes, selectors, code guards, toggle key and global
// CSS; this runner turns it into a configured RTLEngine plus the standard DOM
// wiring (host gate, global <style>, enable/disable, chatbotConfig subscribe,
// beforeunload cleanup). Exposed as the shared global `RastChinRecipe` (same
// isolated-world var pattern as RTLEngine) so a one-line platform script can
// call RastChinRecipe.runPlatformRecipe(recipe).
var RastChinRecipe = (() => {
    const RECIPE_VERSION = 1;

    function recipeVersionOf(recipe) {
        return recipe.version === undefined ? RECIPE_VERSION : recipe.version;
    }

    function supportsRecipeVersion(recipe) {
        return recipeVersionOf(recipe) === RECIPE_VERSION;
    }

    function hostMatchesRecipe(recipe, hostname) {
        const suffixes = Array.isArray(recipe.hostSuffixes) ? recipe.hostSuffixes : [];
        return recipe.hosts.includes(hostname)
            || suffixes.some(suffix => typeof suffix === 'string' && hostname.endsWith(suffix));
    }

    function allowsOpaqueRelatedFrame(recipe) {
        if (recipe.allowOpaqueOriginFrames !== true) return false;
        if (window.location?.hostname) return false;
        try {
            return window.top !== window;
        } catch (_) {
            // Reading the WindowProxy identity is normally allowed across origins,
            // but fail closed if a host hardens access further.
            return false;
        }
    }

    function isDebugEnabled() {
        try {
            return localStorage.getItem('rastchin:debug') === '1';
        } catch (_) {
            return false;
        }
    }

    function countMatches(selector) {
        if (!selector || !document.querySelectorAll) return 0;
        try {
            return document.querySelectorAll(selector).length;
        } catch (_) {
            return 'invalid';
        }
    }

    function createDebugOverlay(recipe, engine, ctx) {
        if (!isDebugEnabled()) return () => {};
        const box = document.createElement('div');
        box.setAttribute('data-rastchin-debug', 'true');
        box.style.cssText = [
            'position:fixed',
            'z-index:2147483647',
            'right:12px',
            'bottom:12px',
            'max-width:320px',
            'padding:10px 12px',
            'border-radius:8px',
            'background:rgba(16,16,20,.92)',
            'color:#fff',
            'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
            'box-shadow:0 8px 24px rgba(0,0,0,.24)',
            'white-space:pre-wrap',
            'pointer-events:none'
        ].join(';');

        const update = () => {
            const messageCount = countMatches(ctx.messageSelector);
            const styledCount = engine.styledElements?.size || 0;
            const excludedCount = countMatches([...(ctx.excludeSelectors || []), ...(ctx.codeGuardSelectors || [])].join(', '));
            box.textContent = [
                `RastChin debug`,
                `recipe: ${recipe.storageKey || 'unknown'} v${ctx.recipeVersion}`,
                `host: ${window.location.hostname}`,
                `messages: ${messageCount}`,
                `styled: ${styledCount}`,
                `excluded: ${excludedCount}`
            ].join('\n');
        };

        (document.body || document.documentElement)?.appendChild(box);
        update();
        const timer = setInterval(update, 1000);
        return () => {
            clearInterval(timer);
            box.remove();
        };
    }

    // Pure: builds the RTLEngine config from a recipe. No DOM access, so it is
    // unit-testable on its own.
    function buildEngineConfig(recipe) {
        const codeGuard = (recipe.codeGuardSelectors || []).join(', ');
        const config = {
            messageSelectors: recipe.messageSelectors || [],
            excludeSelectors: [...(recipe.excludeSelectors || []), ...(recipe.codeGuardSelectors || [])],
            textSelectors: recipe.textSelectors || [],
            rtlRegex: recipe.rtlRegex,
            rtlClass: recipe.rtlClass,
            rtlStyle: recipe.rtlStyle || { unicodeBidi: 'isolate' },
            // A recipe may supply its own isCodeLike (e.g. a platform that also
            // treats certain UI subtrees as non-stylable); otherwise use the
            // default code-guard matcher.
            isCodeLike: typeof recipe.isCodeLike === 'function'
                ? recipe.isCodeLike
                : el => {
                    if (!el) return true;
                    // HTMLElement is undefined outside a browser (e.g. Node tests);
                    // guard so `el instanceof HTMLElement` never throws ReferenceError.
                    if (typeof HTMLElement !== 'undefined' && !(el instanceof HTMLElement)) return true;
                    // Empty selector would make el.closest('') throw a SyntaxError in
                    // the browser, so a recipe with no code guards treats nothing as code.
                    if (!codeGuard) return false;
                    return Boolean(el.closest && el.closest(codeGuard));
                }
        };
        // Forward optional walker hooks the engine already understands, so a
        // recipe can model a platform with a custom message walk / direction rule.
        if (typeof recipe.applyToMessage === 'function') config.applyToMessage = recipe.applyToMessage;
        if (typeof recipe.needsRTL === 'function') config.needsRTL = recipe.needsRTL;
        if (typeof recipe.isMessageElement === 'function') config.isMessageElement = recipe.isMessageElement;
        // Inline BiDi isolation opt-in (see src/core/bidi-isolate.js). streamingSelector
        // names the recipe's actively-streaming turn, left untouched until it settles.
        if (recipe.inlineIsolate !== undefined) config.inlineIsolate = recipe.inlineIsolate;
        if (recipe.observeCharacterData !== undefined) config.observeCharacterData = recipe.observeCharacterData;
        if (recipe.scanBeforePaint !== undefined) config.scanBeforePaint = recipe.scanBeforePaint;
        if (typeof recipe.streamingSelector === 'string') config.streamingSelector = recipe.streamingSelector;
        return config;
    }

    // DOM wiring. Returns a handle { engine, enable, disable, unsubscribe } so the
    // behavior is observable in tests; production callers ignore the return value.
    function runPlatformRecipe(recipe) {
        if (!recipe || !Array.isArray(recipe.hosts)) return null;
        if (!supportsRecipeVersion(recipe)) {
            console.warn?.(`RastChin: unsupported recipe version ${recipe.version}`);
            return null;
        }
        if (!hostMatchesRecipe(recipe, window.location.hostname) && !allowsOpaqueRelatedFrame(recipe)) return null;

        const codeGuard = (recipe.codeGuardSelectors || []).join(', ');
        const engine = new RTLEngine(buildEngineConfig(recipe));
        engine.setEnabled(false);

        // Context handed to a function `globalCss` so a recipe whose CSS must be
        // scoped to its own message/code selectors (not just the code guard) can
        // rebuild those scopes. The first arg stays the code-guard string so
        // existing `codeGuard => ...` recipes keep working unchanged.
        const cssContext = {
            messageSelector: (recipe.messageSelectors || []).join(', '),
            messageSelectors: recipe.messageSelectors || [],
            codeGuardSelectors: recipe.codeGuardSelectors || [],
            excludeSelectors: recipe.excludeSelectors || [],
            recipeVersion: recipeVersionOf(recipe),
            supportedRecipeVersion: RECIPE_VERSION
        };

        let globalStyle = null;

        function ensureGlobalStyle() {
            if (globalStyle) return;
            const style = document.createElement('style');
            style.textContent = typeof recipe.globalCss === 'function'
                ? recipe.globalCss(codeGuard, cssContext)
                : (recipe.globalCss || '');
            (document.head || document.documentElement).appendChild(style);
            globalStyle = style;
        }

        function removeGlobalStyle() {
            globalStyle?.remove();
            globalStyle = null;
        }

        function enable() {
            if (engine.enabled) return;
            engine.setEnabled(true);
            recipe.onEnable?.(engine);
            ensureGlobalStyle();
            engine.scheduleScan(document.body || document.documentElement || document);
        }

        function disable() {
            if (!engine.enabled) return;
            engine.setEnabled(false);
            engine.restoreStyles();
            // A recipe with custom per-element bookkeeping (e.g. a WeakMap of
            // applied directions) clears it here so a later re-enable re-applies
            // from a clean slate rather than skipping already-seen elements.
            recipe.onDisable?.(engine);
            removeGlobalStyle();
        }

        engine.init();

        const config = window.chatbotConfig;
        const removeDebugOverlay = createDebugOverlay(recipe, engine, cssContext);
        if (!config) {
            enable();
            return { engine, enable, disable, unsubscribe: () => {}, removeDebugOverlay };
        }

        // Some document_start recipes need the product's default-on behavior
        // before asynchronous chrome.storage resolves, otherwise the page can
        // paint one LTR frame. The eventual setting callback remains authoritative
        // and restores every touched element when the platform is disabled.
        if (recipe.enableBeforeSettings === true) enable();

        const unsubscribe = config.subscribe(({ key, enabled }) => {
            if (key !== recipe.storageKey) return;
            if (enabled) {
                enable();
            } else {
                disable();
            }
        });

        window.addEventListener(
            'beforeunload',
            () => {
                disable();
                unsubscribe();
                removeDebugOverlay();
            },
            { once: true }
        );

        return { engine, enable, disable, unsubscribe, removeDebugOverlay };
    }

    return { RECIPE_VERSION, buildEngineConfig, runPlatformRecipe };
})();
