// scripts/notebooklm-rtl.js
(() => {
    const IS_RTL = /\p{Script=Arabic}/u;
    const CONTENT_FONT_STACK = '"Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

    const PROSE_TEXT_SELECTORS = [
        // NotebookLM's production DOM uses changing/generated class names in
        // some response bodies. These prose selectors catch the real paragraph
        // leaves while the chrome guard below keeps buttons/toolbars untouched.
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        '[dir="auto"]',
        '[role="article"]',
        '[aria-live] p',
        '[aria-live] li',
        '[aria-live] div',
        '[aria-live] span',
        '[class*="chat"] p',
        '[class*="chat"] li',
        '[class*="chat"] div',
        '[class*="Chat"] p',
        '[class*="Chat"] li',
        '[class*="Chat"] div'
    ];

    const MESSAGE_SELECTORS = [
        // Chat and generated answer/output text. Keep this list content-scoped:
        // broad app containers such as main/article/section also contain NotebookLM
        // chrome, source lists, and notebook cards.
        'chat-message',
        'chat-turn',
        'chat-output',
        'notebooklm-chat-message',
        'notebooklm-output',
        '[data-testid*="chat-message"]',
        '[data-testid*="chatMessage"]',
        '[data-testid*="chat-output"]',
        '[data-testid*="chatOutput"]',
        '[data-testid*="message-content"]',
        '[data-testid*="messageContent"]',
        '[data-testid*="response-content"]',
        '[data-testid*="responseContent"]',
        '[data-testid*="answer-content"]',
        '[data-testid*="answerContent"]',
        '[data-testid*="output-content"]',
        '[data-testid*="outputContent"]',
        '[data-test-id*="chat-message"]',
        '[data-test-id*="chatMessage"]',
        '[data-test-id*="chat-output"]',
        '[data-test-id*="chatOutput"]',
        '[data-test-id*="message-content"]',
        '[data-test-id*="messageContent"]',
        '[data-test-id*="response-content"]',
        '[data-test-id*="responseContent"]',
        '[data-test-id*="answer-content"]',
        '[data-test-id*="answerContent"]',
        '[data-test-id*="output-content"]',
        '[data-test-id*="outputContent"]',
        '[class*="chat-message"]',
        '[class*="chatMessage"]',
        '[class*="ChatMessage"]',
        '[class*="chat-output"]',
        '[class*="chatOutput"]',
        '[class*="ChatOutput"]',
        '[class*="message-content"]',
        '[class*="messageContent"]',
        '[class*="MessageContent"]',
        '[class*="response-content"]',
        '[class*="responseContent"]',
        '[class*="ResponseContent"]',
        '[class*="answer-content"]',
        '[class*="answerContent"]',
        '[class*="AnswerContent"]',
        '[class*="output-content"]',
        '[class*="outputContent"]',
        '[class*="OutputContent"]',

        // Source notes and rendered note bodies/citations.
        'source-note',
        'source-note-content',
        '[data-testid*="source-note"]',
        '[data-testid*="sourceNote"]',
        '[data-testid*="source-text"]',
        '[data-testid*="sourceText"]',
        '[data-testid*="source-content"]',
        '[data-testid*="sourceContent"]',
        '[data-testid*="citation-text"]',
        '[data-testid*="citationText"]',
        '[data-testid*="note-content"]',
        '[data-testid*="noteContent"]',
        '[data-test-id*="source-note"]',
        '[data-test-id*="sourceNote"]',
        '[data-test-id*="source-text"]',
        '[data-test-id*="sourceText"]',
        '[data-test-id*="source-content"]',
        '[data-test-id*="sourceContent"]',
        '[data-test-id*="citation-text"]',
        '[data-test-id*="citationText"]',
        '[data-test-id*="note-content"]',
        '[data-test-id*="noteContent"]',
        '[class*="source-note"]',
        '[class*="sourceNote"]',
        '[class*="SourceNote"]',
        '[class*="source-text"]',
        '[class*="sourceText"]',
        '[class*="SourceText"]',
        '[class*="source-content"]',
        '[class*="sourceContent"]',
        '[class*="SourceContent"]',
        '[class*="citation-text"]',
        '[class*="citationText"]',
        '[class*="CitationText"]',
        '[class*="note-content"]',
        '[class*="noteContent"]',
        '[class*="NoteContent"]',

        // Rendered prose containers used by generated answers and saved notes.
        '[data-testid*="markdown"]',
        '[data-test-id*="markdown"]',
        '[class*="markdown"]',
        '[class*="Markdown"]',
        '[class*="rendered-markdown"]',
        '[class*="renderedMarkdown"]',
        '[class*="RenderedMarkdown"]',

        ...PROSE_TEXT_SELECTORS
    ];

    const TEXTUAL_TAGS = new Set([
        'P',
        'DIV',
        'SPAN',
        'LI',
        'UL',
        'OL',
        'BLOCKQUOTE',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'FIGCAPTION',
        'DD',
        'DT',
        'A',
        'LABEL'
    ]);
    const INLINE_TEXT_TAGS = new Set([
        'A',
        'B',
        'EM',
        'I',
        'LABEL',
        'MARK',
        'S',
        'SMALL',
        'SPAN',
        'STRONG',
        'U'
    ]);
    const CODE_SELECTOR =
        "code, pre, [class*='code'], [class*='Code'], [class*='language-'], [class*='hljs'], .monaco-editor, .cm-editor, [role='code']";
    const CHROME_SELECTOR = [
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="navigation"]',
        '[role="banner"]',
        '[class*="NotebookCard"]',
        '[class*="notebook-card"]',
        '[class*="project-button"]',
        '[class*="ProjectButton"]',
        'input',
        'textarea',
        'select',
        '[contenteditable="true"]',
        'mat-icon',
        'svg',
        'canvas',
        'img',
        'video',
        '[aria-hidden="true"]'
    ].join(', ');
    const CONTAINER_CHROME_SELECTOR = [
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="navigation"]',
        '[role="banner"]',
        '[class*="NotebookCard"]',
        '[class*="notebook-card"]',
        '[class*="project-button"]',
        '[class*="ProjectButton"]',
        'input',
        'textarea',
        'select',
        '[contenteditable="true"]',
        'canvas',
        'video'
    ].join(', ');

    function isLayoutContainer(el) {
        if (!el || !(el instanceof HTMLElement) || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        const display = style.display || '';

        if (display.includes('grid') || display === 'table' || display === 'inline-grid') {
            return true;
        }

        if (display.includes('flex')) {
            const direction = style.flexDirection || 'row';
            return direction.startsWith('row');
        }

        return false;
    }

    function shouldStyleElement(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        if (!TEXTUAL_TAGS.has(el.tagName)) return false;
        if (isChromeLike(el)) return false;
        if (isLayoutContainer(el)) return false;
        return true;
    }

    function isInlineTextTarget(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        const display = window.getComputedStyle(el).display || '';
        return display === 'inline' || display === 'contents' || (!display && INLINE_TEXT_TAGS.has(el.tagName));
    }

    function isChromeLike(el) {
        return el instanceof HTMLElement && !!el.closest(CHROME_SELECTOR);
    }

    function hasChromeDescendant(el) {
        if (!el || !(el instanceof HTMLElement) || typeof el.querySelector !== 'function') return false;
        return !!el.querySelector(CONTAINER_CHROME_SELECTOR);
    }

    function resolveTextTarget(textNode) {
        let current = textNode.parentElement;
        let inlineFallback = null;
        while (current) {
            if (current.closest(CODE_SELECTOR) || isChromeLike(current)) {
                return { element: current, isCode: true };
            }

            if (shouldStyleElement(current)) {
                if (isInlineTextTarget(current)) {
                    if (!inlineFallback) inlineFallback = current;
                    current = current.parentElement;
                    continue;
                }
                if (inlineFallback && hasChromeDescendant(current)) {
                    current = current.parentElement;
                    continue;
                }
                return { element: current, isCode: false };
            }

            current = current.parentElement;
        }
        if (inlineFallback) {
            return { element: inlineFallback, isCode: false };
        }
        return null;
    }

    function isVisible(el) {
        if (!(el instanceof HTMLElement) || !el.isConnected) return false;
        if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden';
    }

    function matchesAny(el, selectors) {
        return selectors.some(selector => {
            try {
                return el.matches?.(selector);
            } catch (_) {
                return false;
            }
        });
    }

    function nodeText(node) {
        if (!node) return '';
        if (node.nodeType === 3) return node.textContent || '';
        let out = '';
        node.childNodes?.forEach?.(child => {
            out += nodeText(child);
        });
        return out;
    }

    function textOf(el) {
        if (!el) return '';
        return el.innerText || el.textContent || el.value || nodeText(el) || '';
    }

    function directTextOf(el) {
        if (!el || !el.childNodes) return textOf(el);
        let out = '';
        el.childNodes.forEach?.(node => {
            if (node?.nodeType === 3) out += node.textContent || '';
        });
        return out;
    }

    function elementChildCount(el) {
        if (!el || !el.childNodes) return 0;
        let count = 0;
        el.childNodes.forEach?.(node => {
            if (node?.nodeType === 1) count += 1;
        });
        return count;
    }

    function isTextualFallbackBlock(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (!TEXTUAL_TAGS.has(el.tagName)) return false;
        if (el.closest(CODE_SELECTOR) || isChromeLike(el)) return false;
        if (isLayoutContainer(el)) return false;

        const directText = directTextOf(el).replace(/\s+/g, ' ').trim();
        if (directText.length >= 3 && IS_RTL.test(directText)) return true;

        // Some NotebookLM response fragments are rendered as a single span/div
        // wrapper around only text nodes after hydration. Keep this fallback
        // leaf-like so we don't flip broad chat/page containers.
        if (elementChildCount(el) === 0) {
            const text = textOf(el).replace(/\s+/g, ' ').trim();
            return text.length >= 3 && IS_RTL.test(text);
        }

        return false;
    }

    function isNotebookLMTextBlock(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (!['notebook.google.com', 'notebooklm.google.com'].includes(window.location.hostname)) return false;
        if (!isVisible(el)) return false;
        if (el.closest(CODE_SELECTOR) || isChromeLike(el)) return false;
        const selectorMatched = matchesAny(el, MESSAGE_SELECTORS);
        const fallbackMatched = isTextualFallbackBlock(el);
        if (!selectorMatched && !fallbackMatched) return false;
        if (isLayoutContainer(el) && !matchesAny(el, PROSE_TEXT_SELECTORS)) return false;
        return IS_RTL.test(textOf(el));
    }

    function containsElement(root, child) {
        if (!root || !child) return false;
        if (root === child) return true;
        if (typeof root.contains === 'function') return root.contains(child);
        let current = child.parentElement;
        while (current) {
            if (current === root) return true;
            current = current.parentElement;
        }
        return false;
    }

    function reconcileStyledTargets(engine, root, desiredTargets) {
        if (!engine?.styledElements || !root) return;
        const desired = Array.from(desiredTargets);
        Array.from(engine.styledElements.keys()).forEach(styled => {
            if (!(styled instanceof HTMLElement) || !styled.isConnected) {
                engine.styledElements.delete(styled);
                return;
            }
            if (!containsElement(root, styled) || desiredTargets.has(styled)) return;

            const containsDesired = desired.some(target => target !== styled && containsElement(styled, target));
            if (containsDesired) {
                engine.restoreElement(styled);
            } else {
                engine.restoreSubtree(styled);
            }
        });
    }

    const recipe = {
        version: 1,
        hosts: ['notebook.google.com', 'notebooklm.google.com'],
        storageKey: 'notebooklmEnabled',
        inlineIsolate: true,
        messageSelectors: MESSAGE_SELECTORS,
        excludeSelectors: [CHROME_SELECTOR],
        textSelectors: [],
        codeGuardSelectors: [CODE_SELECTOR],
        rtlRegex: IS_RTL,
        rtlClass: 'rastchin-rtl-text',
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement: isNotebookLMTextBlock,
        isCodeLike: el => el instanceof HTMLElement && (!!el.closest(CODE_SELECTOR) || isChromeLike(el)),
        applyToMessage: (el, engine) => {
            if (!el || !(el instanceof HTMLElement) || !el.isConnected) return true;
            const text = engine.collectDirectionText(el);
            if (!engine.needsRTL(text)) {
                engine.restoreSubtree(el);
                return true;
            }

            const targets = new Set();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();

            while (node) {
                const content = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (content.length >= 3 && engine.needsRTL(content)) {
                    const target = resolveTextTarget(node);
                    if (target && !target.isCode) {
                        targets.add(target.element);
                    }
                }
                node = walker.nextNode();
            }

            reconcileStyledTargets(engine, el, targets);
            targets.forEach(target => engine.applyRTL(target));
            return true;
        },
        globalCss: (codeGuard, ctx) => {
            // The engine's applyRTL() writes inline `text-align: right` /
            // `direction: rtl` WITHOUT `!important`. NotebookLM is an Angular
            // Material app whose stylesheets set `text-align`/`direction` with
            // `!important` on the very containers our prose lives in, so a
            // non-important inline style loses the cascade war and Persian
            // answer paragraphs keep NotebookLM's native (centred/left)
            // alignment. The ONLY reliable override channel is an `!important`
            // rule here, scoped to the elements the engine marks (`dir="rtl"` +
            // the rtl class). Scope stays tight: the alignment rules target the
            // marked prose leaf or its [dir="rtl"] descendants — never bare
            // buttons/toolbars/inputs/code, which the engine never marks.
            const messageScope = ctx && Array.isArray(ctx.messageSelectors) && ctx.messageSelectors.length
                ? `:is(${ctx.messageSelectors.join(', ')})`
                : '';
            const rtlClass = '.rastchin-rtl-text';
            return `
            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
                font-family: ${MONO_FONT_STACK} !important;
            }

            /* Font / spacing for every marked prose leaf. */
            ${rtlClass} {
                font-family: ${CONTENT_FONT_STACK} !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                font-kerning: normal !important;
            }

            /* Win the alignment war: force RTL + right-align on every element
               the engine marks. The engine writes inline text-align/direction
               WITHOUT !important, so an Angular-Material !important alignment
               rule on the same container beats it. These rules use !important
               AND a raised specificity (the [dir="rtl"]+class compound, and a
               container-scoped variant) so they win even against a Material
               !important alignment rule. Scope stays on the marked leaf — never
               bare buttons/toolbars/inputs/code, which the engine never marks. */
            [dir="rtl"]${rtlClass},
            ${rtlClass}[dir="rtl"],
            ${messageScope ? `${messageScope} ${rtlClass}` : rtlClass} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
            }

            ${rtlClass} [dir="rtl"]:not(${codeGuard}) {
                direction: rtl !important;
                text-align: right !important;
            }

            /* Every prose line leaf INSIDE a marked block must follow it RTL.
               resolveTextTarget marks the nearest stylable ancestor of each
               Persian text node, but when that ancestor is a row-flex/grid
               layout container the walk overshoots to a higher block — leaving
               the actual visual line leaves (p/li/div/span that directly bear
               the text) unmarked. Those leaves still carry NotebookLM's own
               Angular-Material text-align:left/center !important, so they
               stay left/centred while their marked ancestor is right-aligned
               (the user-reported "some lines RTL, adjacent lines left" bug).
               This descendant rule forces the marked subtree's text leaves to
               inherit the block's direction. It is scoped UNDER the marked rtl
               class (never a bare app node) and excludes code so code stays
               LTR; chrome is excluded too because the engine never marks a
               chrome ancestor with the rtl class, and bidi <bdi dir="ltr">
               isolation wrappers keep their own dir for mixed-script runs.
               The :where(:not(GUARD):not(GUARD *)) fence excludes BOTH a code
               element and any element nested inside one, so an inline <span>
               within a <code> stays LTR. [dir="ltr"] (the <bdi> wrappers) is
               excluded so isolated Latin runs keep their own direction. */
            ${rtlClass} :is(p, li, div, span, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption):where(:not(:is(${codeGuard})):not(:is(${codeGuard}) *)):not([dir="ltr"]) {
                direction: rtl !important;
                text-align: right !important;
            }

            .rastchin-rtl-text :is(${codeGuard}),
            .rastchin-rtl-text :is(${codeGuard}) * {
                font-family: ${MONO_FONT_STACK} !important;
            }

            .rastchin-rtl-text ul,
            .rastchin-rtl-text ol {
                padding-right: 2rem !important;
                padding-left: 0 !important;
            }

            .rastchin-rtl-text li {
                text-align: right !important;
            }
        `;
        }
    };

    if (typeof window !== 'undefined' && typeof window.__NOTEBOOKLM_RTL_TEST__ === 'function') {
        window.__NOTEBOOKLM_RTL_TEST__({
            recipe,
            messageSelectors: MESSAGE_SELECTORS,
            proseSelectors: PROSE_TEXT_SELECTORS,
            codeSelector: CODE_SELECTOR,
            chromeSelector: CHROME_SELECTOR,
            isNotebookLMTextBlock,
            isTextualFallbackBlock
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
