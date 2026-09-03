// Linear issue, comment, document, and rich-editor Persian direction support.
(() => {
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
    const LETTER_REGEX = /\p{L}/u;
    const RTL_CLASS = 'rastchin-linear-rtl';
    const EDITOR_ROOT_SELECTOR = '.ProseMirror';
    const ISSUE_VIEW_SELECTOR = '[data-view-id="issue-view"]';
    const ISSUE_TITLE_SELECTORS = [
        '[aria-label="Issue title"]',
        '[aria-label*="Issue"][aria-label*="title"]',
        '[data-testid*="issue-title"]'
    ];
    const ISSUE_TITLE_SELECTOR = ISSUE_TITLE_SELECTORS.join(', ');

    // Linear uses ProseMirror for issue descriptions, comments, documents,
    // project/initiative content, and agent sessions. The semantic fallbacks
    // cover read-only versions of the same surfaces and issue titles.
    const MESSAGE_SELECTORS = [
        ISSUE_VIEW_SELECTOR,
        EDITOR_ROOT_SELECTOR,
        '[aria-label="Issue title"]',
        '[aria-label*="Issue"][aria-label*="title"]',
        '[aria-label="Issue description"]',
        '[aria-label*="Issue"][aria-label*="description"]',
        '[aria-label="Comment"]',
        '[aria-label="Reply"]',
        '[data-comment-thread-container]',
        '[data-comment-input-editor-container]',
        '[data-testid*="issue-title"]',
        '[data-testid*="issue-description"]',
        '[data-testid*="comment-content"]',
        '[data-testid*="comment-body"]',
        '[data-testid*="document-content"]',
        '[data-testid*="project-description"]',
        '[data-testid*="initiative-description"]',
        '[data-testid*="agent-message"]',
        '[aria-label*="Issue title"]',
        '[aria-label*="Issue description"]',
        '[aria-label*="Comment"][contenteditable]',
        '[role="article"]',
        'main article'
    ];

    const CONTENT_BLOCK_SELECTORS = [
        'p',
        'li',
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
        'td',
        'th',
        '.text-node'
    ];
    const CONTENT_BLOCK_SELECTOR = CONTENT_BLOCK_SELECTORS.join(', ');

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '[data-language]',
        '[data-node-type="codeBlock"]',
        '[data-testid*="code"]',
        '[class*="code-block"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.cm-editor',
        '.monaco-editor',
        '.ace_editor'
    ];

    const UI_GUARD_SELECTORS = [
        ...CODE_GUARD_SELECTORS,
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="navigation"]',
        '[role="tab"]',
        'nav',
        'aside',
        'input',
        'textarea',
        'select',
        '[aria-hidden="true"]'
    ];
    const UI_GUARD_SELECTOR = UI_GUARD_SELECTORS.join(', ');
    const HARD_GUARD_SELECTORS = [
        ...CODE_GUARD_SELECTORS,
        '[aria-hidden="true"]'
    ];
    const HARD_GUARD_SELECTOR = HARD_GUARD_SELECTORS.join(', ');

    // Linear mounts the issue view inside host-level interactive and aside-like
    // surfaces. An engine exclusion uses closest(), so excluding those wrappers
    // here would discard the entire issue before this adapter can inspect it.
    // Keep UI protection in isGuarded(), scoped to the nearest managed content
    // boundary. Recipe-runner still adds the code guards to the engine.
    const ENGINE_EXCLUDE_SELECTORS = [];

    const MANAGED_CONTENT_ROOT_SELECTORS = [
        ISSUE_VIEW_SELECTOR,
        `${ISSUE_VIEW_SELECTOR} [role="textbox"]`,
        EDITOR_ROOT_SELECTOR,
        '[aria-label="Issue title"]',
        '[aria-label*="Issue"][aria-label*="title"]',
        '[aria-label="Issue description"]',
        '[aria-label*="Issue"][aria-label*="description"]',
        '[aria-label="Comment"]',
        '[aria-label="Reply"]',
        '[data-comment-thread-container]',
        '[data-comment-input-editor-container]',
        '[data-testid*="issue-title"]',
        '[data-testid*="issue-description"]',
        '[data-testid*="comment-content"]',
        '[data-testid*="comment-body"]',
        '[data-testid*="document-content"]'
    ];
    const MANAGED_CONTENT_ROOT_SELECTOR = MANAGED_CONTENT_ROOT_SELECTORS.join(', ');

    function directTextOf(element) {
        if (!element?.childNodes) return '';
        let text = '';
        element.childNodes.forEach?.(node => {
            if (node?.nodeType === 3) text += node.textContent || '';
        });
        return text.replace(/\s+/g, ' ').trim();
    }

    function needsLinearRTL(text, engine) {
        if (!text) return false;
        const stripped = typeof engine?.stripLtrTokens === 'function'
            ? engine.stripLtrTokens(text)
            : String(text);
        const rtlRegex = engine?.rtlRegex || /\p{Script=Arabic}/u;
        for (const char of stripped) {
            if (!LETTER_REGEX.test(char)) continue;
            return rtlRegex.test(char);
        }
        return false;
    }

    function isGuarded(element) {
        if (!element || typeof element.closest !== 'function') return true;
        try {
            // Code and hidden surfaces remain protected even when they contain
            // an editor-shaped node. Interactive property controls are handled
            // by the scoped UI guards below; Linear's generic details-section
            // wrapper also owns issue descriptions and must not be excluded.
            if (element.closest(HARD_GUARD_SELECTOR)) return true;

            const managedRoot = element.closest(MANAGED_CONTENT_ROOT_SELECTOR);
            if (managedRoot) {
                // Ignore an interactive wrapper *outside* the known editor or
                // comment root, but continue to protect controls nested inside
                // the content itself.
                let current = element;
                while (current && current !== managedRoot) {
                    if (current.matches?.(UI_GUARD_SELECTOR)) return true;
                    current = current.parentElement;
                }
                return false;
            }

            return Boolean(element.closest(UI_GUARD_SELECTOR));
        } catch (_) {
            return true;
        }
    }

    function isEditorRoot(element) {
        return Boolean(element?.matches?.(EDITOR_ROOT_SELECTOR));
    }

    function directionTextOf(element, engine) {
        if (element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA') {
            return String(element.value || '').trim();
        }
        return engine.collectDirectionText(element).trim();
    }

    function applyRTL(target, engine) {
        engine.applyRTL(target);

        // Linear's stylex rules can be injected after the extension stylesheet.
        // Inline important declarations make the owned text block deterministic
        // without changing any ancestor layout or control surface.
        target.style?.setProperty?.('direction', 'rtl', 'important');
        target.style?.setProperty?.('text-align', 'right', 'important');
        target.style?.setProperty?.('unicode-bidi', 'isolate', 'important');
    }

    function collectTargets(root, engine) {
        const targets = new Set();
        const add = element => {
            if (element && !isGuarded(element)) targets.add(element);
        };

        if (root.matches?.(CONTENT_BLOCK_SELECTOR)) add(root);
        root.querySelectorAll?.(CONTENT_BLOCK_SELECTOR).forEach(add);

        // The current issue title is a single-line editor and may render its
        // text directly instead of through a paragraph. Discover it from the
        // stable issue-view root as well as when it is scanned independently.
        if (root.matches?.(ISSUE_TITLE_SELECTOR)) add(root);
        root.querySelectorAll?.(ISSUE_TITLE_SELECTOR).forEach(add);

        // Issue titles and an empty/single-line ProseMirror paragraph may be bare
        // text containers. Only mark the exact discovery/editor root, never a
        // generic descendant div that may own Linear's flex layout.
        const directText = directTextOf(root);
        if (directText && !isGuarded(root)
            && (isEditorRoot(root) || engine.needsRTL(directText) || engine.styledElements?.has(root))) {
            targets.add(root);
        }

        return targets;
    }

    function applyLinearContent(root, engine) {
        if (!root || root.nodeType !== 1 || !root.isConnected) return true;
        collectTargets(root, engine).forEach(target => {
            const text = directionTextOf(target, engine);
            if (engine.needsRTL(text)) applyRTL(target, engine);
            else engine.restoreElement(target);
        });
        return true;
    }

    const recipe = {
        version: 1,
        storageKey: 'linearEnabled',
        // ProseMirror owns its text nodes. Never insert <bdi> wrappers into the
        // editor DOM; block-level isolation preserves the editor state model.
        inlineIsolate: false,
        hosts: ['linear.app'],
        rtlRegex: /\p{Script=Arabic}/u,
        messageSelectors: MESSAGE_SELECTORS,
        textSelectors: CONTENT_BLOCK_SELECTORS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        excludeSelectors: ENGINE_EXCLUDE_SELECTORS,
        applyToMessage: applyLinearContent,
        needsRTL: needsLinearRTL,
        rtlClass: RTL_CLASS,
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => `
            ${codeGuard},
            ${codeGuard} * {
                direction: ltr !important;
                text-align: left !important;
                font-family: ${MONO_FONT_STACK} !important;
            }

            html body .${RTL_CLASS}[dir="rtl"] {
                direction: rtl !important;
                text-align: right !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }

            .${RTL_CLASS}[dir="rtl"] :is(strong, em, b, i, a, span) {
                font-family: ${CONTENT_FONT_STACK};
            }

            .ProseMirror .${RTL_CLASS}[dir="rtl"],
            .ProseMirror.${RTL_CLASS}[dir="rtl"] {
                caret-color: currentColor;
            }

            ul:has(> .${RTL_CLASS}[dir="rtl"]),
            ol:has(> .${RTL_CLASS}[dir="rtl"]) {
                padding-inline-start: 2rem;
            }

            table:has(.${RTL_CLASS}[dir="rtl"]) {
                direction: ltr;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__LINEAR_RTL_TEST__ === 'function') {
        window.__LINEAR_RTL_TEST__({
            recipe,
            issueViewSelector: ISSUE_VIEW_SELECTOR,
            issueTitleSelectors: ISSUE_TITLE_SELECTORS,
            messageSelectors: MESSAGE_SELECTORS,
            contentBlockSelectors: CONTENT_BLOCK_SELECTORS,
            codeGuardSelectors: CODE_GUARD_SELECTORS,
            uiGuardSelectors: UI_GUARD_SELECTORS,
            engineExcludeSelectors: ENGINE_EXCLUDE_SELECTORS,
            managedContentRootSelectors: MANAGED_CONTENT_ROOT_SELECTORS,
            collectTargets,
            directionTextOf,
            isGuarded
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
