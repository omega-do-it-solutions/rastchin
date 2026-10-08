// scripts/chatgpt-rtl.js
(() => {
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

    const CONTENT_BLOCK_SELECTORS = [
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
        'figcaption',
        'dd',
        'dt',
        'table',
        'tr',
        'td',
        'th'
    ];
    const CONTENT_BLOCK_SELECTOR = CONTENT_BLOCK_SELECTORS.join(', ');
    const MAIN_CONTENT_SELECTORS = CONTENT_BLOCK_SELECTORS.map(selector => `main ${selector}`);
    const LETTER_REGEX = /\p{L}/u;
    const RTL_CLASS = 'rastchin-chatgpt-rtl';
    const RTL_CODE_MIN_RATIO = 0.4;
    const COMPOSER_SELECTORS = ['[data-composer-body]', '[data-composer-markdown]'];
    const MUTATION_UI_GUARD = [
        ...COMPOSER_SELECTORS, '[data-type="unified-composer"]', '#prompt-textarea',
        '[data-testid*="composer" i]', 'input', 'textarea', 'select',
        'nav', 'aside', '[role="navigation"]', '[role="menu"]',
        '[role="menuitem"]', '[role="toolbar"]', '[role="tooltip"]'
    ].join(', ');
    // Logged-out /uc/ chats use CSS-module message bodies and a clickable
    // user bubble. Match the semantic suffix inside the known thread shell,
    // not the build-specific hash or arbitrary buttons elsewhere on the page.
    const ANONYMOUS_MESSAGE_SELECTOR = 'main .wm-app-thread [class*="_messageCopy"]';
    const USER_BUBBLE_SELECTOR = 'main .wm-app-thread button[class*="_userMessage"]';
    const CONVERSATION_LAYOUT_SELECTOR = [
        'main .wm-app-thread ol[class*="_messageList"]',
        'main .wm-app-thread li[class*="_messageTurn"]'
    ].join(', ');
    const DOCUMENT_ROOT_SELECTORS = [
        '[data-testid*="canvas"]',
        '[data-testid*="artifact"]',
        '[role="document"]',
        '.ProseMirror'
    ];

    // Conversation/message roots are discovery boundaries only. The custom walker
    // below applies direction to prose leaves, never to these layout wrappers.
    // Direct `main` prose selectors cover anonymous `/uc/` conversations that can
    // render without the older role/message hooks.
    const MESSAGE_SELECTORS = [
        '[data-message-author-role="assistant"]',
        '[data-message-author-role="user"]',
        '[data-message-id]',
        '[data-chatgpt-selection-message-id]',
        '[data-markdown-text-style="assistant-message"]',
        '[data-testid="assistant-turn"]',
        '[data-testid="user-turn"]',
        '[data-testid="message-text"]',
        '[data-testid^="conversation-turn"]',
        'main article',
        ANONYMOUS_MESSAGE_SELECTOR,
        ...DOCUMENT_ROOT_SELECTORS,
        ...MAIN_CONTENT_SELECTORS
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
        '[data-message-id]',
        '[data-chatgpt-selection-message-id]',
        '[data-markdown-text-style="assistant-message"]',
        '[data-testid^="conversation-turn"]',
        'main article',
        ANONYMOUS_MESSAGE_SELECTOR
    ];

    const NATIVE_CODE_BODY_SELECTOR = '[data-markdown-copy="code-block"] .chatgpt-code-scrollport';
    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        NATIVE_CODE_BODY_SELECTOR,
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
    const CODE_GUARD_SELECTOR = CODE_GUARD_SELECTORS.join(', ');
    const CODE_BLOCK_SURFACE_SELECTORS = [
        '.cm-editor',
        'pre',
        '[data-markdown-copy="code-block"]',
        '[data-testid="code-block"]',
        '[data-testid="code-snippet"]',
        '.react-code-block'
    ];
    const CODE_BLOCK_SURFACE_SELECTOR = CODE_BLOCK_SURFACE_SELECTORS.join(', ');
    const PLAIN_TEXT_LANGUAGES = new Set(['text', 'txt', 'plain', 'plaintext', 'markdown', 'md']);
    const TECHNICAL_CODE_SIGNAL = /(?:^|\n)\s*(?:const|let|var|function|class|interface|type|import|export|def|return|if|for|while|SELECT|INSERT|UPDATE|DELETE)\b|[{};]{2,}/m;

    const CONTENT_UI_GUARD_SELECTORS = [
        ...CODE_GUARD_SELECTORS,
        '[data-markdown-copy="exclude"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="navigation"]',
        'nav',
        'aside',
        '[role="tooltip"]',
        ...COMPOSER_SELECTORS,
        '[data-type="unified-composer"]',
        '#prompt-textarea',
        '[data-testid*="composer" i]',
        'input',
        'textarea',
        'select',
        '[aria-hidden="true"]'
    ];
    const CONTENT_UI_GUARD = CONTENT_UI_GUARD_SELECTORS.join(', ');

    function directTextOf(element) {
        if (!element?.childNodes) return '';
        let text = '';
        element.childNodes.forEach?.(node => {
            if (node?.nodeType === 3) text += node.textContent || '';
        });
        return text.replace(/\s+/g, ' ').trim();
    }

    function rawTextOf(element) {
        if (!element?.childNodes) return element?.textContent || '';
        let text = '';
        const visit = node => {
            if (!node) return;
            if (node.nodeType === 3) {
                text += node.textContent || '';
                return;
            }
            if (node.nodeType !== 1) return;
            if (node.tagName === 'BR') text += '\n';
            node.childNodes?.forEach?.(visit);
        };
        visit(element);
        return text;
    }

    function isPersianDominantText(text, minimumRatio = RTL_CODE_MIN_RATIO) {
        let rtlLetters = 0;
        let totalLetters = 0;
        for (const char of String(text || '')) {
            if (!LETTER_REGEX.test(char)) continue;
            totalLetters += 1;
            if (/\p{Script=Arabic}/u.test(char)) rtlLetters += 1;
        }
        return rtlLetters >= 2
            && totalLetters > 0
            && (rtlLetters / totalLetters) >= minimumRatio;
    }

    function declaredCodeLanguage(surface) {
        const candidates = [];
        let current = surface;
        let hops = 0;
        while (current && hops < 5) {
            candidates.push(current);
            current = current.parentElement;
            hops += 1;
        }
        surface?.querySelectorAll?.('[data-language], [class*="language-"]').forEach(element => candidates.push(element));

        for (const element of candidates) {
            const attribute = element.getAttribute?.('data-language')
                || element.getAttribute?.('data-code-language');
            if (attribute) return String(attribute).trim().toLowerCase();
            const className = typeof element.className === 'string' ? element.className : '';
            const match = className.match(/(?:^|\s)language-([\w-]+)/i);
            if (match) return match[1].toLowerCase();
        }
        // The code-only renderer exposes its language in the separate copy/wrap
        // header. Read that label, never the prose body or action-button text.
        const nativeBlock = surface?.closest?.('[data-markdown-copy="code-block"]');
        if (nativeBlock) {
            const labelElement = nativeBlock.querySelector?.('[data-markdown-copy="exclude"] .truncate');
            const label = rawTextOf(labelElement).trim().toLowerCase();
            if (label === 'plain text') return 'plaintext';
            // Unknown/missing labels remain technical, rather than turning a
            // programming block containing Persian comments into prose.
            return label || 'unknown';
        }
        return '';
    }

    // ChatGPT renders fenced `text` blocks through CodeMirror or a code-only
    // scrollport and gives the viewer explicit LTR direction. Only override it
    // when the block is Persian-dominant prose. Programming languages and
    // code-shaped content retain the normal LTR/monospace code guard.
    function isPersianProseCodeSurface(surface) {
        if (!surface) return false;
        const language = declaredCodeLanguage(surface);
        if (language && !PLAIN_TEXT_LANGUAGES.has(language)) return false;

        const text = rawTextOf(surface).trim();
        if (!text || TECHNICAL_CODE_SIGNAL.test(text)) return false;

        return isPersianDominantText(text);
    }

    function resolveCodeSurface(element) {
        if (!element) return null;
        const closestEditor = element.closest?.('.cm-editor');
        if (closestEditor) return closestEditor;
        const nestedEditor = element.querySelector?.('.cm-editor');
        if (nestedEditor) return nestedEditor;
        const closestPre = element.closest?.('pre');
        if (closestPre) return closestPre;
        const nestedPre = element.querySelector?.('pre');
        if (nestedPre) return nestedPre;
        const nativeBody = element.closest?.(NATIVE_CODE_BODY_SELECTOR)
            || element.closest?.('[data-markdown-copy="code-block"]')?.querySelector?.('.chatgpt-code-scrollport');
        if (nativeBody) return nativeBody;
        if (element.matches?.(CODE_BLOCK_SURFACE_SELECTOR)) return element;
        return null;
    }

    function collectCodeSurfaces(root) {
        const surfaces = new Set();
        const add = candidate => {
            const surface = resolveCodeSurface(candidate);
            if (surface) surfaces.add(surface);
        };
        if (root?.matches?.(CODE_BLOCK_SURFACE_SELECTOR)) add(root);
        root?.querySelectorAll?.(CODE_BLOCK_SURFACE_SELECTOR).forEach(add);
        return surfaces;
    }

    function needsListRTL(element, text, engine) {
        if (element.matches?.('li')) {
            return engine.needsRTL(text) || isPersianDominantText(text);
        }
        if (!element.matches?.('ul, ol')) return engine.needsRTL(text);

        const items = Array.from(element.childNodes || [])
            .filter(child => child?.nodeType === 1 && child.tagName === 'LI');
        if (!items.length) return engine.needsRTL(text) || isPersianDominantText(text);

        const rtlItems = items.filter(item => {
            const itemText = engine.collectDirectionText(item).trim();
            return engine.needsRTL(itemText) || isPersianDominantText(itemText);
        }).length;
        return rtlItems > (items.length / 2);
    }

    function isProtectedCodeLike(element) {
        if (!element || typeof element.closest !== 'function') return true;
        let guard;
        try {
            guard = element.closest(CODE_GUARD_SELECTOR);
        } catch (_) {
            return true;
        }
        if (!guard) return false;
        const surface = resolveCodeSurface(guard);
        // Inline code has no block surface and always keeps its technical style.
        if (!surface) return true;
        // A previously styled block must remain scannable so regeneration from
        // Persian prose to technical code can restore its native presentation.
        if (surface.classList?.contains(RTL_CLASS)) return false;
        return !isPersianProseCodeSurface(surface);
    }

    function applyCodeSurfaceDirection(surface, engine) {
        if (!surface) return;
        if (!isPersianProseCodeSurface(surface)) {
            engine.restoreElement(surface);
            return;
        }
        engine.rememberStyle(surface);
        if (surface.getAttribute('dir') !== 'rtl') surface.setAttribute('dir', 'rtl');
        if (surface.style.direction !== 'rtl') surface.style.direction = 'rtl';
        if (surface.style.textAlign !== 'right') surface.style.textAlign = 'right';
        // `plaintext` recalculates each newline-separated line while keeping
        // embedded URLs, identifiers and English phrases readable.
        if (surface.style.unicodeBidi !== 'plaintext') surface.style.unicodeBidi = 'plaintext';
        if (!surface.classList.contains(RTL_CLASS)) surface.classList.add(RTL_CLASS);
    }

    // A product-name prefix is a label, not an English sentence. Keep short
    // Persian descriptions such as "Self-hosted است." RTL without turning an
    // ordinary English sentence containing a Persian word into RTL.
    function hasLatinLabelPrefix(text) {
        const match = String(text).trim().match(/^([A-Za-z][A-Za-z\d\s/+=_.():\p{Sc}-]*?)\s*(\p{Script=Arabic}[\s\S]*)$/u);
        if (!match) return false;
        const words = match[1].match(/[A-Za-z][A-Za-z\d-]*/g) || [];
        const labelShape = words.length > 1 || /[=/+()_-]|[A-Z].*[A-Z]/.test(match[1]);
        const persianPredicate = /(?:^|\s)(?:است|هست|بود|باشد|دارد|می[\u200c\s]?\p{Script=Arabic}+)(?:[.!؟،\s]|$)/u.test(match[2]);
        const persianWords = match[2].match(/\p{Script=Arabic}+/gu) || [];
        return words.length > 0 && words.length <= 12
            && words.every(word => /^[A-Z][A-Za-z\d-]*$/.test(word))
            && ((labelShape && (isPersianDominantText(text) || persianWords.length >= 3)) || persianPredicate);
    }

    // Persian-first prose and Latin labels followed by a Persian description use
    // RTL. English sentences with incidental Persian retain their direction.
    function needsChatGptRTL(text, engine) {
        if (!text) return false;
        const stripped = typeof engine?.stripLtrTokens === 'function'
            ? engine.stripLtrTokens(text)
            : String(text);
        const rtlRegex = engine?.rtlRegex || /\p{Script=Arabic}/u;
        for (const char of stripped) {
            if (!LETTER_REGEX.test(char)) continue;
            return rtlRegex.test(char) || hasLatinLabelPrefix(stripped);
        }
        return false;
    }

    function isContentGuarded(element) {
        if (!element || typeof element.closest !== 'function') return true;
        try {
            if (element.closest(CONTENT_UI_GUARD)) return true;
            const button = element.closest('button, [role="button"]');
            if (!button) return false;
            const message = element.closest(ANONYMOUS_MESSAGE_SELECTOR);
            // Only the bubble's prose may change; the clickable layout itself
            // and any nested action buttons remain untouched.
            return !message || button === element || !button.matches(USER_BUBBLE_SELECTOR)
                || message.closest('button, [role="button"]') !== button;
        } catch (_) {
            return true;
        }
    }

    function isLayoutContainer(element) {
        if (element.matches?.(CONVERSATION_LAYOUT_SELECTOR)) return true;
        return element.matches?.('div, span')
            && Boolean(element.querySelector?.(CONTENT_BLOCK_SELECTOR));
    }

    function fallbackTextTarget(element, root) {
        if (!element || element === root || element.tagName === 'DIV') return element;
        let current = element.parentElement;
        while (current) {
            if (current.matches?.(CONTENT_BLOCK_SELECTOR)) return current;
            if (current.tagName === 'DIV' && !isContentGuarded(current)) {
                return isLayoutContainer(current) ? element : current;
            }
            if (current === root) break;
            current = current.parentElement;
        }
        return element;
    }

    function collectContentTargets(root, engine) {
        const targets = new Set();
        const add = element => {
            if (!element || isContentGuarded(element)) return;
            if (isLayoutContainer(element)) {
                // Streaming can turn a previously bare prose DIV into a
                // Markdown wrapper. Remove our old direction before English
                // siblings inherit it; never force direction on turn layouts.
                engine.restoreElement(element);
                return;
            }
            targets.add(element);
        };

        if (root.matches?.(CONTENT_BLOCK_SELECTOR)) add(root);
        root.querySelectorAll?.(CONTENT_BLOCK_SELECTOR).forEach(add);

        const fallbackElements = [];
        if (root.matches?.('div, span')) fallbackElements.push(root);
        root.querySelectorAll?.('div, span').forEach(element => fallbackElements.push(element));
        fallbackElements.forEach(element => {
            if (isLayoutContainer(element)) {
                engine.restoreElement(element);
                return;
            }
            const directText = directTextOf(element);
            if (!directText) return;
            const target = fallbackTextTarget(element, root);
            if (!target || isContentGuarded(target)) return;
            // Keep bare-div/span support narrow. Structured prose blocks were already
            // collected above; this fallback exists for ChatGPT's plain user/message
            // lines whose text is not wrapped in a paragraph.
            if (engine.needsRTL(directText) || engine.styledElements?.has(target)) {
                add(target);
            }
        });

        return targets;
    }

    function explicitColumnAlignment(target, engine) {
        const cell = target.closest?.('td, th');
        if (!cell) return '';
        const original = engine.styledElements?.get(cell)?.styleTextAlign ?? cell.style.textAlign;
        const alignment = String(original || cell.getAttribute('align') || cell.getAttribute('data-d-align') || '').toLowerCase();
        return { left: 'left', right: 'right', center: 'center', start: 'left', end: 'right' }[alignment] || '';
    }

    function applyChatGptContent(root, engine) {
        if (!root || root.nodeType !== 1 || !root.isConnected) return true;
        if (root.closest?.(MUTATION_UI_GUARD)) return true;
        const targets = collectContentTargets(root, engine);
        // Read direction before changing styles. Interleaved reads/writes force
        // layout once per block on long responses containing tables and code.
        const directions = Array.from(targets, target => {
            const text = engine.collectDirectionText(target).trim();
            // Markdown's explicit column alignment belongs to the table, not
            // to the language of a cell. Read the original inline value before
            // applying/restoring our direction styles on repeated scans.
            return [target, needsListRTL(target, text, engine), explicitColumnAlignment(target, engine)];
        });
        collectCodeSurfaces(root).forEach(surface => applyCodeSurfaceDirection(surface, engine));
        directions.forEach(([target, rtl, cellAlignment]) => {
            if (rtl) {
                engine.applyRTL(target);
                if (cellAlignment && target.style.textAlign !== cellAlignment) target.style.textAlign = cellAlignment;
            } else {
                engine.restoreElement(target);
                // English items, continuations and table cells must not inherit
                // direction from a Persian list, quotation or table ancestor.
                if (target.parentElement?.closest?.(`.${RTL_CLASS}`)) {
                    engine.rememberStyle(target);
                    if (target.getAttribute('dir') !== 'ltr') target.setAttribute('dir', 'ltr');
                    if (target.style.direction !== 'ltr') target.style.direction = 'ltr';
                    const alignment = cellAlignment || 'left';
                    if (target.style.textAlign !== alignment) target.style.textAlign = alignment;
                }
            }
        });
        // The turn/document wrapper is a discovery boundary only. Returning true
        // prevents the shared engine from applying direction to a flex/layout root.
        return true;
    }

    function shouldScanMutation(mutation, engine) {
        const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
        if (!target || target.closest?.(MUTATION_UI_GUARD)) return false;
        if (mutation.type === 'attributes') {
            // Only streaming transitions need an attribute-triggered rescan.
            // Hover classes and RastChin's own marker are not content changes.
            if (mutation.attributeName === 'class') {
                const wasStreaming = String(mutation.oldValue || '').split(/\s+/).includes('result-streaming');
                return wasStreaming !== target.classList.contains('result-streaming');
            }
            return mutation.oldValue !== target.getAttribute(mutation.attributeName);
        }
        if (target.closest?.(engine.messageSelector)) return true;
        if (mutation.type !== 'childList') return false;
        const containsMessage = node => {
            if (node.nodeType !== 1 || node.closest?.(MUTATION_UI_GUARD)) return false;
            // Detached fallback turns no longer match `main article/main p`.
            // Their marker still identifies removed content so snapshots can be
            // released when navigating to an empty chat.
            if (engine.styledElements?.has(node) || node.querySelector?.(`.${RTL_CLASS}`)) return true;
            if (node.matches?.(engine.messageSelector)) return true;
            return Array.from(node.querySelectorAll?.(engine.messageSelector) || [])
                .some(child => !child.closest?.(MUTATION_UI_GUARD));
        };
        return Array.from(mutation.addedNodes || []).some(containsMessage)
            || Array.from(mutation.removedNodes || []).some(containsMessage);
    }

    function isEmbeddedDocumentRoot(element) {
        if (!element || element.tagName !== 'BODY') return false;
        if (typeof window === 'undefined' || typeof window.top === 'undefined') return false;
        try {
            return window.top !== window;
        } catch (_) {
            return false;
        }
    }

    const recipe = {
        version: 1,
        storageKey: 'chatgptEnabled',
        // Keep renderer-owned Text nodes intact, including settled responses.
        // Native bidi joins Latin words across ChatGPT's per-word spans. One
        // injected BDI per span reverses "Open Notebook" and breaks references
        // the renderer needs for subsequent updates/removals.
        inlineIsolate: false,
        streamingSelector: '.result-streaming, [data-is-streaming="true"], [data-message-status="in_progress"]',
        hosts: ['chat.openai.com', 'chatgpt.com'],
        allowOpaqueOriginFrames: true,
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: MESSAGE_SELECTORS,
        isMessageElement: isEmbeddedDocumentRoot,
        coalesceCandidateSubtrees: true,
        shouldScanMutation,
        textSelectors: TEXT_SELECTORS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        codeGuardsAreExclusions: false,
        excludeSelectors: [
            ...COMPOSER_SELECTORS,
            'nav', 'aside', '[role="navigation"]', '[role="tooltip"]',
            '[data-type="unified-composer"]',
            '[data-type="unified-composer"] *',
            'form[data-type="unified-composer"]',
            '#prompt-textarea',
            '#prompt-textarea *',
            '[data-testid*="composer" i]',
            '[data-testid*="composer" i] *',
            'input',
            'textarea'
        ],
        applyToMessage: applyChatGptContent,
        needsRTL: needsChatGptRTL,
        isCodeLike: isProtectedCodeLike,
        rtlClass: RTL_CLASS,
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => {
            const responseScope = `:is(${RESPONSE_CONTAINER_SELECTORS.join(', ')})`;
            const markedResponseScope = `html body .${RTL_CLASS}[dir="rtl"]`;
            const markedCodeScope = `html body :is(.cm-editor, pre, ${NATIVE_CODE_BODY_SELECTOR}, [data-testid="code-block"], [data-testid="code-snippet"], .react-code-block).${RTL_CLASS}[dir="rtl"]`;
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

            /*
             * A Persian-dominant fenced plain-text block is prose presented in
             * a code-box surface, not executable source code. The adapter marks
             * only that surface; keep copy/tool controls outside this override.
             */
            ${markedCodeScope},
            ${markedCodeScope} .cm-scroller,
            ${markedCodeScope} .cm-content,
            ${markedCodeScope} .cm-content *,
            ${markedCodeScope} code,
            ${markedCodeScope} code * {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }

            /*
             * ChatGPT can apply logical/start alignment with !important in host
             * styles. Keep the override limited to elements the engine has already
             * classified as Persian; English/code descendants retain their guards.
             */
            ${markedResponseScope} {
                direction: rtl !important;
            }

            ${markedResponseScope}:not(td):not(th) {
                text-align: right !important;
            }

            /* The native table renderer puts prose in paragraphs. Honor the
             * column alignment propagated to these leaves instead of letting
             * the ordinary Persian paragraph rule force them to the right.
             */
            html body :is(td, th) .${RTL_CLASS}[dir="rtl"][style*="text-align: center"] {
                text-align: center !important;
            }
            html body :is(td, th) .${RTL_CLASS}[dir="rtl"][style*="text-align: left"] {
                text-align: left !important;
            }

            /* ChatGPT cells have only padding-inline-end. Once a Persian cell
             * becomes RTL its padding moves left; a neighbouring LTR cell has
             * zero left padding, so their text touches at the shared boundary.
             * Add the missing inset only to RTL cells, preserving host end
             * padding (including the table controls' extra reserved space).
             */
            html body :is(td, th).${RTL_CLASS}[dir="rtl"] {
                padding-inline-start: 0.75rem !important;
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
            codeGuardSelectors: CODE_GUARD_SELECTORS,
            collectCodeSurfaces,
            isPersianDominantText,
            isPersianProseCodeSurface,
            isProtectedCodeLike,
            needsListRTL
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
