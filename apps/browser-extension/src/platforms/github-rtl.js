(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-github-rtl';
    const MODIFIED_CLASS = 'rastchin-github-rtl';

    const MARKDOWN_ROOT_SELECTORS = [
        '.markdown-body',
        '[data-testid="markdown-body"]',
        '[data-testid="issue-body-viewer"]',
        '.comment-body',
        '.wiki-body'
    ];

    const TITLE_SELECTORS = [
        '[data-testid="issue-title"]',
        '[data-testid="pull-request-title"]',
        '.js-issue-title',
        '.js-pull-request-title',
        '.js-discussions-title-container h1'
    ];

    const REPOSITORY_ABOUT_SELECTORS = [
        // Current React repository sidebar (the CSS-module hash changes, the
        // semantic module/property prefix does not).
        '[class*="SidebarAbout-module__description__"]',
        // Legacy repository overview sidebar, still served on some account and
        // repository variants.
        '.BorderGrid-cell > p.f4.my-3',
        '.Layout-sidebar .BorderGrid-cell p.f4.my-3'
    ];

    const REPOSITORY_PREVIEW_SELECTORS = [
        // Current React organization repository directory, including its
        // default and compact layouts. The list/data class names are stable;
        // the surrounding CSS-module hashes are intentionally not targeted.
        '[data-listview-repos-list] .repos-list-description',
        // Server-rendered organization/profile lists and pinned cards.
        '#org-repositories [itemprop="description"]',
        '#user-repositories-list [itemprop="description"]',
        '.org-repos.repo-list [itemprop="description"]',
        '.pinned-item-list-item .pinned-item-desc',
        '[data-testid="repository-description"]'
    ];

    const EDITOR_SELECTORS = [
        // GitHub's issue/PR forms are actively migrating between server-rendered
        // and React implementations. Textareas are prose-authoring surfaces on
        // github.com; code editors are independently excluded by CODE_GUARD_SELECTORS.
        'textarea',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="plaintext-only"][role="textbox"]',
        'textarea.js-comment-field',
        'textarea[name="comment[body]"]',
        'textarea[name="issue[body]"]',
        'textarea[name="pull_request[body]"]',
        'textarea[name="discussion[body]"]',
        'textarea[name="release[body]"]',
        'input[name="issue[title]"]',
        'input[name="pull_request[title]"]',
        'input[aria-label="Add a title"]',
        '[data-testid*="title"] input[type="text"]',
        '[data-testid*="comment"] textarea',
        '[data-testid*="markdown"] textarea',
        '[data-testid*="issue"] textarea',
        '[data-testid*="discussion"] textarea',
        '[data-testid*="markdown"] [contenteditable="true"]',
        '.js-previewable-comment-form [contenteditable="true"]'
    ];

    // github.com/copilot used to share the Microsoft Copilot content-script
    // registration. Keeping its message selectors in this GitHub recipe gives
    // the whole github.com document one runtime, which remains correct across
    // GitHub's client-side navigation.
    const COPILOT_MESSAGE_SELECTORS = [
        '[data-message-id]',
        '[data-content="ai-message"]',
        '[data-content="user-message"]',
        '[data-testid*="message"]',
        '[class*="chat-turn"]',
        '[class*="ai-message"]',
        '[class*="message-item"]'
    ];

    const TEXT_TARGET_SELECTORS = [
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'td',
        'th',
        'dt',
        'dd',
        'summary',
        'figcaption'
    ];

    const COPILOT_TEXT_TARGET_SELECTORS = [
        ...TEXT_TARGET_SELECTORS,
        'div',
        'span'
    ];

    const BLOCK_CHILD_SELECTOR = [
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'table',
        'pre',
        'div'
    ].join(', ');

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        'kbd',
        'samp',
        '.highlight',
        '.blob-wrapper',
        '.blob-code',
        '.react-code-text',
        '.file-diff-split',
        '.js-diff-load-container',
        '.js-file-content',
        '[data-testid="code-cell"]',
        '[data-testid="diff-file"]',
        '[data-testid="diff-line"]',
        '.cm-editor',
        '.monaco-editor',
        '.ace_editor'
    ];

    const INTERACTIVE_GUARD_SELECTOR = [
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '.markdown-toolbar',
        '.timeline-comment-header',
        '.Label'
    ].join(', ');

    const MESSAGE_SELECTORS = [
        ...MARKDOWN_ROOT_SELECTORS,
        ...TITLE_SELECTORS,
        ...REPOSITORY_ABOUT_SELECTORS,
        ...REPOSITORY_PREVIEW_SELECTORS,
        ...EDITOR_SELECTORS,
        ...COPILOT_MESSAGE_SELECTORS
    ];

    const modifiedElements = new Set();
    const originalStyles = new WeakMap();
    let inputListener = null;
    let activeEngine = null;

    function selectorList(selectors) {
        return selectors.join(', ');
    }

    function matchesAny(element, selectors) {
        return selectors.some(selector => {
            try {
                return element.matches?.(selector);
            } catch (_) {
                return false;
            }
        });
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.isConnected) return false;
        if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden';
    }

    function isCodeLike(element) {
        return element instanceof HTMLElement && Boolean(element.closest?.(selectorList(CODE_GUARD_SELECTORS)));
    }

    function isEditor(element) {
        return element instanceof HTMLElement && matchesAny(element, EDITOR_SELECTORS);
    }

    function isTitle(element) {
        return element instanceof HTMLElement && matchesAny(element, TITLE_SELECTORS);
    }

    function isMarkdownRoot(element) {
        return element instanceof HTMLElement && matchesAny(element, MARKDOWN_ROOT_SELECTORS);
    }

    function isRepositoryAbout(element) {
        return element instanceof HTMLElement && matchesAny(element, REPOSITORY_ABOUT_SELECTORS);
    }

    function isRepositoryPreview(element) {
        return element instanceof HTMLElement && matchesAny(element, REPOSITORY_PREVIEW_SELECTORS);
    }

    function isCopilotPath() {
        return /^\/copilot(?:\/|$)/i.test(window.location.pathname || '');
    }

    function isCopilotMessage(element) {
        return isCopilotPath()
            && element instanceof HTMLElement
            && matchesAny(element, COPILOT_MESSAGE_SELECTORS);
    }

    function isInteractiveChrome(element) {
        return element instanceof HTMLElement && Boolean(element.closest?.(INTERACTIVE_GUARD_SELECTOR));
    }

    function isMessageElement(element) {
        if (!(element instanceof HTMLElement) || !isVisible(element) || isCodeLike(element)) return false;
        if (isEditor(element)) return true;
        if (!(element.textContent || '').trim()) return false;
        return isTitle(element)
            || isRepositoryAbout(element)
            || isRepositoryPreview(element)
            || isMarkdownRoot(element)
            || isCopilotMessage(element);
    }

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(Boolean)));
    }

    function hasBlockChild(element) {
        return Array.from(element.children || []).some(child => (
            child.matches?.(BLOCK_CHILD_SELECTOR) && (child.textContent || '').trim().length > 0
        ));
    }

    function isTextTarget(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isVisible(element) || isCodeLike(element) || isInteractiveChrome(element)) return false;
        if (!(element.textContent || '').trim()) return false;
        // Direction belongs on the list/table item itself so bullets and cell
        // alignment follow the prose even when GitHub inserts a nested <p>.
        if (['LI', 'TD', 'TH'].includes(element.tagName)) return true;
        return !hasBlockChild(element);
    }

    function getTextTargets(root, includeInlineLeaves = false) {
        const selectors = includeInlineLeaves ? COPILOT_TEXT_TARGET_SELECTORS : TEXT_TARGET_SELECTORS;
        const targets = [];

        if (matchesAny(root, selectors) && isTextTarget(root)) targets.push(root);

        selectors.forEach(selector => {
            try {
                root.querySelectorAll?.(selector).forEach(element => {
                    if (isTextTarget(element)) targets.push(element);
                });
            } catch (_) {}
        });

        // Some GitHub Markdown payloads are a single direct text node. Style the
        // root only when no safer block-level leaf exists.
        if (!targets.length && isTextTarget(root)) targets.push(root);
        return uniqueElements(targets);
    }

    function setImportant(element, property, value) {
        element.style.setProperty(property, value, 'important');
    }

    function rememberOriginal(element) {
        if (originalStyles.has(element)) return;
        originalStyles.set(element, {
            dir: element.getAttribute('dir'),
            direction: element.style.getPropertyValue('direction'),
            directionPriority: element.style.getPropertyPriority('direction'),
            textAlign: element.style.getPropertyValue('text-align'),
            textAlignPriority: element.style.getPropertyPriority('text-align'),
            unicodeBidi: element.style.getPropertyValue('unicode-bidi'),
            unicodeBidiPriority: element.style.getPropertyPriority('unicode-bidi'),
            fontFamily: element.style.getPropertyValue('font-family'),
            fontFamilyPriority: element.style.getPropertyPriority('font-family')
        });
    }

    function applyRTL(element) {
        if (!(element instanceof HTMLElement)) return;
        rememberOriginal(element);
        element.setAttribute('dir', 'rtl');
        element.setAttribute(MODIFIED_ATTR, 'true');
        element.classList.add(MODIFIED_CLASS);
        setImportant(element, 'direction', 'rtl');
        setImportant(element, 'text-align', 'right');
        setImportant(element, 'unicode-bidi', 'plaintext');
        setImportant(element, 'font-family', '"Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif');
        modifiedElements.add(element);
    }

    function restoreElement(element) {
        if (element.getAttribute?.(MODIFIED_ATTR) !== 'true') return;
        const original = originalStyles.get(element) || {};

        if (original.dir == null) element.removeAttribute('dir');
        else element.setAttribute('dir', original.dir);

        [
            ['direction', original.direction, original.directionPriority],
            ['text-align', original.textAlign, original.textAlignPriority],
            ['unicode-bidi', original.unicodeBidi, original.unicodeBidiPriority],
            ['font-family', original.fontFamily, original.fontFamilyPriority]
        ].forEach(([property, value, priority]) => {
            if (value) element.style.setProperty(property, value, priority || '');
            else element.style.removeProperty(property);
        });

        element.removeAttribute(MODIFIED_ATTR);
        element.classList.remove(MODIFIED_CLASS);
        originalStyles.delete(element);
        modifiedElements.delete(element);
    }

    function processTextTarget(element, engine) {
        const text = engine.collectDirectionText(element).trim();
        if (engine.needsRTL(text)) {
            applyRTL(element);
            engine.isolateInline?.(element);
        } else {
            engine.clearInline?.(element);
            restoreElement(element);
        }
    }

    function editorText(element) {
        if ('value' in element) return String(element.value || '');
        return String(element.innerText || element.textContent || '');
    }

    function processEditor(element, engine) {
        if (!isEditor(element) || isCodeLike(element)) return false;
        if (engine.needsRTL(editorText(element).trim())) applyRTL(element);
        else restoreElement(element);
        return true;
    }

    function processMessage(element, engine) {
        if (processEditor(element, engine)) return true;

        if (isTitle(element)) {
            processTextTarget(element, engine);
            return true;
        }

        if (isRepositoryAbout(element)) {
            processTextTarget(element, engine);
            return true;
        }

        if (isRepositoryPreview(element)) {
            processTextTarget(element, engine);
            return true;
        }

        if (isMarkdownRoot(element)) {
            getTextTargets(element).forEach(target => processTextTarget(target, engine));
            return true;
        }

        if (isCopilotMessage(element)) {
            getTextTargets(element, true).forEach(target => processTextTarget(target, engine));
            return true;
        }

        return true;
    }

    function resolveEditor(target) {
        if (!(target instanceof HTMLElement)) return null;
        if (isEditor(target)) return target;
        try {
            const closest = target.closest?.(selectorList(EDITOR_SELECTORS));
            return isEditor(closest) ? closest : null;
        } catch (_) {
            return null;
        }
    }

    function attachInputListener(engine) {
        if (inputListener) return;
        activeEngine = engine;
        inputListener = event => {
            const editor = resolveEditor(event.target);
            if (editor && activeEngine) processEditor(editor, activeEngine);
        };
        document.addEventListener('input', inputListener, true);
        document.addEventListener('compositionend', inputListener, true);
    }

    function detachInputListener() {
        if (!inputListener) return;
        document.removeEventListener('input', inputListener, true);
        document.removeEventListener('compositionend', inputListener, true);
        inputListener = null;
        activeEngine = null;
    }

    function cleanUpStyles() {
        detachInputListener();
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
    }

    const recipe = {
        version: 1,
        storageKey: 'githubEnabled',
        inlineIsolate: true,
        hosts: ['github.com'],
        messageSelectors: MESSAGE_SELECTORS,
        excludeSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: /\p{Script=Arabic}/u,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement,
        isCodeLike,
        applyToMessage: processMessage,
        onEnable: attachInputListener,
        onDisable: cleanUpStyles,
        globalCss: codeGuard => `
            @font-face {
                font-family: "Vazirmatn";
                src: url(${JSON.stringify(FONT_URL)}) format("truetype-variations");
                font-weight: 100 900;
                font-style: normal;
                font-display: swap;
                unicode-range:
                    U+0600-06FF,
                    U+0750-077F,
                    U+08A0-08FF,
                    U+FB50-FDFF,
                    U+FE70-FEFF,
                    U+200C,
                    U+200D,
                    U+0660-0669;
            }

            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
                font-family: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace !important;
            }

            .${MODIFIED_CLASS} {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            .${MODIFIED_CLASS} a {
                unicode-bidi: isolate;
            }

            .${MODIFIED_CLASS} ul,
            .${MODIFIED_CLASS} ol,
            [dir="rtl"] > ul,
            [dir="rtl"] > ol {
                padding-right: 2rem;
                padding-left: 0;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__GITHUB_RTL_TEST__ === 'function') {
        window.__GITHUB_RTL_TEST__({
            recipe,
            isEditor,
            isTitle,
            isRepositoryAbout,
            isRepositoryPreview,
            isMarkdownRoot,
            isCopilotMessage,
            isMessageElement,
            isCodeLike,
            getTextTargets,
            processEditor,
            editorSelectors: EDITOR_SELECTORS,
            titleSelectors: TITLE_SELECTORS,
            repositoryAboutSelectors: REPOSITORY_ABOUT_SELECTORS,
            repositoryPreviewSelectors: REPOSITORY_PREVIEW_SELECTORS,
            markdownRootSelectors: MARKDOWN_ROOT_SELECTORS,
            codeGuardSelectors: CODE_GUARD_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
