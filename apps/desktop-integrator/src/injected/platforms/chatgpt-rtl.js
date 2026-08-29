// scripts/chatgpt-rtl.js
(() => {
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

    // Narrow, content-specific message containers. The previous list also carried the
    // broad `[data-testid="conversation-turn"]` turn wrapper (avatars, action bars,
    // model UI) and a bare `[data-message-author-role]`. Both widened the surface the
    // engine walks on every streaming mutation. We scope to the assistant/user message
    // bubbles and the rendered message text only.
    const MESSAGE_SELECTORS = [
        '[data-message-author-role="assistant"]',
        '[data-message-author-role="user"]',
        '[data-testid="assistant-turn"]',
        '[data-testid="user-turn"]',
        '[data-testid="message-text"]'
    ];

    // Block-level text containers only. `div`/`span` were removed: setting dir + inline
    // styles on every div/span inside a streaming assistant turn was a large, redundant
    // inline-mutation load on React-managed nodes. Block elements get dir=rtl +
    // unicode-bidi:isolate and the browser's bidi algorithm keeps inline LTR runs
    // (links, code, English) readable without per-span mutation.
    const TEXT_SELECTORS = [
        'p',
        'li',
        'ul',
        'ol',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'strong',
        'em',
        'table',
        'tr',
        'td',
        'th'
    ];

    // The response containers font-inject.js skips on ChatGPT. KEEP IN SYNC with
    // RESPONSE_SKIP_SELECTORS['chatgpt.com'] / ['chat.openai.com'] in
    // src/core/font-inject.js: the recipe stylesheet must supply the Persian font for
    // EVERYTHING inside these (including bare-<div> user-bubble text), because
    // font-inject no longer mutates them inline.
    const RESPONSE_CONTAINER_SELECTORS = [
        '[data-message-author-role]',
        '[data-testid="conversation-turn"]'
    ];

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '[data-testid="code-block"]',
        '[data-testid="code-snippet"]',
        '[class*="code-block"]',
        '[class*="CodeBlock"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.cm-editor',
        '.monaco-editor',
        '.react-code-block',
        '.ace_editor'
    ];

    const recipe = {
        version: 1,
        storageKey: 'chatgptEnabled',
        // Wrap Latin runs inside RTL text in <bdi>; skip the live streaming turn
        // (ChatGPT marks it) so we only restructure settled, React-committed DOM.
        inlineIsolate: true,
        streamingSelector: '.result-streaming, [data-is-streaming="true"], [data-message-status="in_progress"]',
        hosts: ['chat.openai.com', 'chatgpt.com'],
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: MESSAGE_SELECTORS,
        textSelectors: TEXT_SELECTORS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        excludeSelectors: [
            '[data-type="unified-composer"]',
            '[data-type="unified-composer"] *',
            'form[data-type="unified-composer"]',
            'input',
            'textarea',
            '[contenteditable="true"]'
        ],
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => {
            const responseScope = `:is(${RESPONSE_CONTAINER_SELECTORS.join(', ')})`;
            return `
            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
            }

            /*
             * Response font. font-inject.js skips inline font mutation inside the
             * ChatGPT response containers (redundant + a streaming-time hazard), so the
             * Persian Vazirmatn font is supplied here for EVERYTHING inside them — the
             * container itself and div/span included, because ChatGPT user-bubble text
             * often lives in a bare <div> that has no block ancestor. This is
             * font-family only (CSS), NOT the per-node dir mutation we removed from
             * textSelectors, so it is not a streaming hazard. The @font-face is still
             * injected document-wide by font-inject; code keeps its monospace stack.
             */
            ${responseScope},
            ${responseScope} :is(p, li, blockquote, h1, h2, h3, h4, h5, h6, div, span, strong, em, b, i, a, small, td, th) {
                font-family: ${CONTENT_FONT_STACK} !important;
            }

            ${responseScope} :is(${codeGuard}),
            ${responseScope} :is(${codeGuard}) * {
                font-family: ${MONO_FONT_STACK} !important;
            }

            [dir="rtl"] ul,
            [dir="rtl"] ol {
                padding-right: 2rem;
                padding-left: 0;
            }

            [dir="rtl"] table {
                direction: rtl;
            }

            [dir="rtl"] li,
            [dir="rtl"] button,
            [dir="rtl"] a {
                text-align: right;
            }
        `;
        }
    };

    if (typeof window !== 'undefined' && typeof window.__CHATGPT_RTL_TEST__ === 'function') {
        window.__CHATGPT_RTL_TEST__({
            recipe,
            messageSelectors: MESSAGE_SELECTORS,
            textSelectors: TEXT_SELECTORS,
            responseContainerSelectors: RESPONSE_CONTAINER_SELECTORS,
            codeGuardSelectors: CODE_GUARD_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
