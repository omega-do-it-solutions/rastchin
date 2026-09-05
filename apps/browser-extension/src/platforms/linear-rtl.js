// Linear issue, comment, document, and rich-editor Persian direction support.
(() => {
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
    const LETTER_REGEX = /\p{L}/u;
    const RTL_CLASS = 'rastchin-linear-rtl';
    const EDITOR_ROOT_SELECTOR = '.ProseMirror';
    const ISSUE_VIEW_SELECTOR = '[data-view-id="issue-view"]';
    const BOARD_CARD_SELECTOR = 'a[data-board-item="true"][href*="/issue/"]';
    const EDITOR_SCOPE_ATTRIBUTE = 'data-rastchin-linear-editor';
    const editorScopes = new Map();
    let nextEditorScope = 0;
    let editorStyle = null;
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
        BOARD_CARD_SELECTOR,
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
        BOARD_CARD_SELECTOR,
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

        // Current board cards put their title in a Text span next to the status
        // control, without an issue-title label or paragraph. Only select that
        // text sibling, leaving card layout, identifiers and badges alone.
        const cards = [...(root.querySelectorAll?.(BOARD_CARD_SELECTOR) || [])];
        if (root.matches?.(BOARD_CARD_SELECTOR)) cards.push(root);
        cards.forEach(card => {
            const row = card.querySelector?.('[data-menu-open]')?.parentElement;
            row?.querySelectorAll('span[class*="-Text-"]').forEach(span => {
                if (span.parentElement === row) add(span);
            });
        });

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

    function editorSelector(editor, target, id) {
        const path = [];
        let node = target;
        while (node && node !== editor) {
            const siblings = [...node.parentElement.childNodes].filter(child => child.nodeType === 1);
            path.unshift(`${node.tagName.toLowerCase()}:nth-child(${siblings.indexOf(node) + 1})`);
            node = node.parentElement;
        }
        return `[${EDITOR_SCOPE_ATTRIBUTE}="${id}"] > ${path.join(' > ')}`;
    }

    function updateEditorRules(editor, engine) {
        let scope = editorScopes.get(editor);
        if (!scope) {
            scope = { id: ++nextEditorScope, original: editor.getAttribute(EDITOR_SCOPE_ATTRIBUTE), css: '' };
            editorScopes.set(editor, scope);
            // ProseMirror permits attributes on its root. Its content DOM must
            // not be mutated: that triggers reconciliation and discards RTL.
            editor.setAttribute(EDITOR_SCOPE_ATTRIBUTE, String(scope.id));
        }
        const rules = [];
        const rtlLists = new Set();
        collectTargets(editor, engine).forEach(target => {
            if (target === editor || target.closest(EDITOR_ROOT_SELECTOR) !== editor) return;
            const rtl = engine.needsRTL(directionTextOf(target, engine));
            const selector = editorSelector(editor, target, scope.id);
            // Explicit LTR also prevents English children of Persian list items
            // from inheriting the parent's direction. No user text enters CSS.
            rules.push(`html body ${selector} { direction: ${rtl ? 'rtl' : 'ltr'} !important; text-align: ${rtl ? 'right' : 'left'} !important; unicode-bidi: isolate !important; font-family: ${CONTENT_FONT_STACK} !important; }`);
            if (rtl && target.tagName === 'LI' && target.parentElement.matches('ul, ol')) {
                rtlLists.add(target.parentElement);
                if (target.parentElement.matches('ul.list-node')
                    && target.parentElement.getAttribute('data-type') !== 'todo_list') {
                    // Linear replaces native bullets with a ::before counter
                    // positioned using physical left. Mirror its existing inset
                    // without replacing its content or touching editor nodes.
                    rules.push(`html body ${selector}::before { left: auto !important; right: calc((-1 * var(--editor-list-inset, 1.5em)) + (var(--editor-bullet-disc-offset, 0.5em) / 2)) !important; }`);
                }
            }
        });
        // A mixed list keeps its LTR geometry, so reserve space on the opposite
        // edge too for the markers belonging to its RTL items.
        rtlLists.forEach(list => rules.push(`html body ${editorSelector(editor, list, scope.id)} { direction: ltr !important; padding-inline-end: 2rem; }`));
        scope.css = rules.join('\n');
    }

    function renderEditorRules() {
        editorScopes.forEach((scope, editor) => {
            if (!editor.isConnected) {
                restoreEditorScope(editor, scope);
                editorScopes.delete(editor);
            }
        });
        const css = [...editorScopes.values()].map(scope => scope.css).join('\n');
        if (!css) {
            editorStyle?.parentNode?.removeChild(editorStyle);
            editorStyle = null;
            return;
        }
        if (!editorStyle) {
            editorStyle = document.createElement('style');
            editorStyle.setAttribute('data-rastchin-linear-directions', '');
            (document.head || document.documentElement).appendChild(editorStyle);
        }
        if (editorStyle.textContent !== css) editorStyle.textContent = css;
    }

    function restoreEditorScope(editor, scope) {
        if (scope.original === null) editor.removeAttribute(EDITOR_SCOPE_ATTRIBUTE);
        else editor.setAttribute(EDITOR_SCOPE_ATTRIBUTE, scope.original);
    }

    function clearEditorRules() {
        editorScopes.forEach((scope, editor) => restoreEditorScope(editor, scope));
        editorScopes.clear();
        renderEditorRules();
    }

    function applyLinearContent(root, engine) {
        if (!root || root.nodeType !== 1 || !root.isConnected) return true;
        const editors = new Set(root.querySelectorAll(EDITOR_ROOT_SELECTOR));
        const owner = root.closest(EDITOR_ROOT_SELECTOR);
        if (owner) editors.add(owner);
        collectTargets(root, engine).forEach(target => {
            const editor = target.closest(EDITOR_ROOT_SELECTOR);
            if (editor && target !== editor) {
                editors.add(editor);
                return;
            }
            const text = directionTextOf(target, engine);
            if (engine.needsRTL(text)) applyRTL(target, engine);
            else engine.restoreElement(target);
        });
        editors.forEach(editor => {
            if (!isGuarded(editor)) updateEditorRules(editor, engine);
        });
        renderEditorRules();
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
        onDisable: clearEditorRules,
        needsRTL: needsLinearRTL,
        rtlClass: RTL_CLASS,
        rtlStyle: { unicodeBidi: 'isolate' },
        globalCss: codeGuard => `
            .ProseMirror {
                font-family: ${CONTENT_FONT_STACK} !important;
                caret-color: currentColor;
            }

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
