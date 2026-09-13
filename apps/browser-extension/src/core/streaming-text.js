// Shared text-only behavior for live-stream chat adapters. Never rewrite chat
// text/children: emotes, mentions and framework-owned editors retain identity.
var RastChinStreamText = (() => {
    function createRecipe(options) {
        const fontUrl = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
        const selectors = options.messageSelectors.join(', ');
        const composerSelector = options.composerSelector;
        const guards = [
            'pre', 'code', 'kbd', 'samp', 'button', '[role="button"]',
            '[role="menu"]', '[role="toolbar"]', 'nav', 'video', 'svg',
            '[data-emote-id]', '[data-a-target="emote-name"]',
            '[data-a-target="chat-message-username"]'
        ];
        let inputListener = null;

        return {
            ...options,
            version: 1,
            messageSelectors: [...options.messageSelectors, composerSelector],
            textSelectors: [],
            excludeSelectors: guards,
            inlineIsolate: false,
            observeCharacterData: true,
            rtlRegex: /\p{Script=Arabic}/u,
            rtlStyle: { unicodeBidi: 'isolate' },
            needsRTL(text, engine) {
                // Ignore leading URLs and @mentions; the first prose letter
                // decides direction, so English-first messages stay native.
                const prose = engine.stripLtrTokens(text).replace(/@[\p{L}\p{N}_]+/gu, ' ');
                const firstLetter = prose.match(/\p{L}/u)?.[0];
                return Boolean(firstLetter && /\p{Script=Arabic}/u.test(firstLetter));
            },
            applyToMessage(element, engine) {
                if (!element.matches(selectors) && !element.matches(composerSelector)) return true;
                // Unknown editors are out of scope. Known composers are styled
                // at the outer boundary only, including Slate's aria-hidden line.
                const editor = element.closest('[contenteditable="true"]');
                if (editor && !element.matches(composerSelector)) return true;
                const text = editor ? element.textContent : engine.collectDirectionText(element);
                if (engine.needsRTL(text || '')) engine.applyRTL(element);
                else engine.restoreElement(element);
                return true;
            },
            onEnable(engine) {
                if (inputListener) return;
                inputListener = event => {
                    const composer = event.target?.closest?.(composerSelector);
                    if (composer) engine.scheduleScan(composer);
                };
                document.addEventListener('input', inputListener, true);
            },
            onDisable() {
                if (inputListener) document.removeEventListener('input', inputListener, true);
                inputListener = null;
            },
            globalCss: () => `
                @font-face {
                    font-family: "Vazirmatn";
                    src: url(${JSON.stringify(fontUrl)}) format("truetype-variations");
                    font-weight: 100 900;
                    font-display: swap;
                    unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200D;
                }
                .${options.rtlClass} {
                    direction: rtl !important;
                    text-align: right !important;
                    unicode-bidi: isolate !important;
                    font-family: "Vazirmatn", system-ui, sans-serif !important;
                }
                /* A message is an independent run after the username/badges,
                   not a direction change on the chat row or virtualized list. */
                span.${options.rtlClass} {
                    display: inline-block;
                    max-width: 100%;
                    vertical-align: top;
                }
                .${options.rtlClass} a { unicode-bidi: isolate; }
            `
        };
    }
    return { createRecipe };
})();
