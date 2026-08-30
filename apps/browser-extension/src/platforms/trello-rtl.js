// scripts/trello-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-trello-rtl';
    const MODIFIED_CLASS = 'rastchin-trello-rtl';

    const CARD_DIALOG_SELECTORS = [
        '[role="dialog"]',
        '.window-overlay .window',
        '.card-detail-window',
        '.js-card-detail-window'
    ];

    const BOARD_CARD_TITLE_SELECTOR = 'a[data-testid="card-name"]';
    const CARD_BACK_TITLE_SELECTOR = '#card-back-name';
    const CARD_BACK_TITLE_INPUT_SELECTOR = 'textarea[data-testid="card-back-title-input"]';
    const CHECKLIST_ITEM_SELECTOR = '[data-testid="check-item-container"]';

    const HOME_FEED_COMMENT_DOCUMENT_SELECTORS = [
        '.ak-renderer-document',
        'p[data-renderer-start-pos]'
    ];

    const HOME_FEED_PREVIEW_TEXT_TARGET_SELECTORS = [
        'a[href*="/c/"]'
    ];

    const HOME_FEED_COMPOSER_SELECTORS = [
        '.ProseMirror[role="textbox"][contenteditable="true"]',
        '#ak-editor-textarea[contenteditable="true"]',
        '[data-testid="list-card-composer-textarea"][contenteditable="true"]'
    ];

    const DESCRIPTION_ROOT_SELECTORS = [
        '[data-testid="card-back-description"]',
        '[data-testid*="description"] [data-testid*="content"]',
        '.window-main-col .js-desc-content',
        '.window-main-col .js-description-content',
        '.window-main-col .description-content',
        '.window-main-col .card-detail-desc',
        '.window-main-col .js-desc .markeddown',
        '[data-testid="card-back-description"] .markeddown',
        '.window-main-col .editable .current'
    ];

    const CHECKLIST_TEXT_SELECTORS = [
        '[data-testid="check-item-name"] .ak-renderer-document p',
        '[data-testid="check-item-name"] [data-renderer-start-pos]'
    ];

    const COMMENT_ROOT_SELECTORS = [
        '[data-testid="card-back-activity"] [data-testid*="comment"]',
        '[data-testid*="activity"] [data-testid*="comment"]',
        '[data-testid*="comment-card"]',
        '[data-testid*="comment-content"]',
        '[data-testid*="comment-container"]',
        '.comment-container',
        '.current-comment',
        '.js-comment-text',
        '.action-comment',
        '.phenom.mod-comment-type .phenom-desc',
        '.phenom-comment .phenom-desc',
        '.phenom-desc .current-comment',
        '.window-sidebar .comment-container',
        '.window-sidebar .current-comment',
        '.window-sidebar .js-comment-text',
        '.window-sidebar .action-comment',
        '.window-sidebar .phenom.mod-comment-type .phenom-desc',
        '.window-sidebar .phenom-comment .phenom-desc',
        '.window-sidebar .phenom-desc'
    ];

    const TEXT_BLOCK_SELECTOR = [
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
        'div',
        'span'
    ].join(', ');

    const BLOCK_CHILD_SELECTOR = [
        'p',
        'li',
        'blockquote',
        'ul',
        'ol',
        'table',
        'pre',
        'div'
    ].join(', ');

    const CODE_GUARD_SELECTORS = [
        'code',
        'pre',
        '[class*="code"]',
        '[class*="Code"]',
        '[class*="language-"]',
        '[class*="hljs"]',
        '.cm-editor',
        '.monaco-editor',
        '[role="code"]'
    ];

    const INTERACTIVE_SELECTOR = [
        'button',
        'input',
        'textarea',
        'select',
        '[contenteditable]:not([contenteditable="false"])',
        '[role="button"]',
        '[role="textbox"]'
    ].join(', ');

    const modifiedElements = new Set();
    const originalStyles = new WeakMap();

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(Boolean)));
    }

    function queryAll(root, selectors) {
        const result = [];
        selectors.forEach(selector => {
            try {
                root.querySelectorAll?.(selector).forEach(element => result.push(element));
            } catch (_) {}
        });
        return uniqueElements(result);
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.isConnected) return false;
        if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden';
    }

    function isCodeLike(element) {
        return element instanceof HTMLElement && !!element.closest(CODE_GUARD_SELECTORS.join(', '));
    }

    function isInteractiveChrome(element) {
        return element instanceof HTMLElement && !!element.closest(INTERACTIVE_SELECTOR);
    }

    function findSectionByHeading(dialog, labelRegex) {
        const headings = Array.from(dialog.querySelectorAll('h1, h2, h3, h4, [role="heading"]'));
        const heading = headings.find(item => labelRegex.test((item.textContent || '').trim()));
        if (!heading) return [];

        const scopeSelectors = ['[data-testid="card-back-description"]', '.window-module', '.js-desc', '.editable', 'section'];
        for (const selector of scopeSelectors) {
            const section = heading.closest(selector);
            if (section) return [section];
        }
        return [];
    }

    function findDescriptionRoots(dialog) {
        const direct = queryAll(dialog, DESCRIPTION_ROOT_SELECTORS);
        if (direct.length) return direct;
        return findSectionByHeading(dialog, /^description$/i);
    }

    function findCommentRoots(dialog) {
        return queryAll(dialog, COMMENT_ROOT_SELECTORS);
    }

    function hasDescendant(root, selector) {
        try {
            return Boolean(root?.querySelector?.(selector));
        } catch (_) {
            return false;
        }
    }

    function hasReplyAction(root) {
        const buttons = Array.from(root?.querySelectorAll?.('button') || []);
        return buttons.some(button => ((button.textContent || '').trim().toLowerCase() === 'reply'));
    }

    function isHomeFeedCommentCard(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.tagName !== 'SECTION') return false;
        if (!hasDescendant(element, '.ak-renderer-document')) return false;
        if (!hasDescendant(element, 'button[aria-label="Actions"]')) return false;
        if (!hasDescendant(element, 'button[aria-label="Add reaction"]') && !hasReplyAction(element)) return false;
        return true;
    }

    function findHomeFeedCommentRoots(section) {
        if (!isHomeFeedCommentCard(section)) return [];
        const rendererRoots = queryAll(section, ['.ak-renderer-document']);
        if (rendererRoots.length) return rendererRoots;
        return queryAll(section, ['p[data-renderer-start-pos]']);
    }

    function hrefOf(element) {
        if (!(element instanceof HTMLElement)) return '';
        return String(element.getAttribute?.('href') || element.href || '');
    }

    function isHomeFeedPreviewLink(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.tagName !== 'A') return false;
        const href = hrefOf(element);
        if (!href || !/\/c\/[A-Za-z0-9]+/i.test(href)) return false;
        if (!hasDescendant(element, '[data-test-class="checklist-badge"]')
            && !hasDescendant(element, '[data-test-class="badge-card-subscribed"]')
            && !hasDescendant(element, '[title]')) {
            return false;
        }
        return true;
    }

    function isHomeFeedComposer(element) {
        if (!(element instanceof HTMLElement)) return false;
        const isKnownComposer = HOME_FEED_COMPOSER_SELECTORS.some(selector => element.matches?.(selector));
        if (!isKnownComposer) return false;
        if (element.matches?.('[data-testid="list-card-composer-textarea"][contenteditable="true"]')) {
            return true;
        }
        if (element.matches?.('#ak-editor-textarea[contenteditable="true"]')
            && element.closest?.('[data-testid="editor-content-container"], .ak-editor-content-area')) {
            return true;
        }
        if (!element.closest?.('[data-testid="click-wrapper"], [data-editor-click-wrapper="true"]')) return false;
        const wrapper = element.closest('[data-testid="click-wrapper"], [data-editor-click-wrapper="true"]');
        if (!wrapper) return false;
        const actionButtons = Array.from(wrapper.parentElement?.querySelectorAll?.('button') || []);
        return actionButtons.some(button => {
            const label = (button.textContent || '').trim().toLowerCase();
            return label === 'save' || label === 'cancel' || label === 'reply' || label === 'dismiss';
        });
    }

    function isBoardCardTitle(element) {
        return element instanceof HTMLElement && element.matches?.(BOARD_CARD_TITLE_SELECTOR);
    }

    function isCardBackTitle(element) {
        return element instanceof HTMLElement && element.matches?.(CARD_BACK_TITLE_SELECTOR);
    }

    function isCardBackTitleInput(element) {
        return element instanceof HTMLElement && element.matches?.(CARD_BACK_TITLE_INPUT_SELECTOR);
    }

    function isChecklistItem(element) {
        return element instanceof HTMLElement && element.matches?.(CHECKLIST_ITEM_SELECTOR);
    }

    function isCardDialog(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!CARD_DIALOG_SELECTORS.some(selector => element.matches?.(selector))) return false;
        return findDescriptionRoots(element).length > 0 || findCommentRoots(element).length > 0;
    }

    function hasBlockChild(element) {
        return Array.from(element.children || []).some(child => (
            child.matches?.(BLOCK_CHILD_SELECTOR) && (child.textContent || '').trim().length > 0
        ));
    }

    function isTextBlock(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!isVisible(element)) return false;
        if (isCodeLike(element) || isInteractiveChrome(element)) return false;
        if (!(element.textContent || '').trim()) return false;
        if (hasBlockChild(element)) return false;
        return true;
    }

    function getTextTargets(root) {
        const targets = [];
        if (isTextBlock(root)) targets.push(root);
        root.querySelectorAll?.(TEXT_BLOCK_SELECTOR).forEach(element => {
            if (isTextBlock(element)) targets.push(element);
        });
        return uniqueElements(targets);
    }

    function setImportant(element, property, value) {
        element.style.setProperty(property, value, 'important');
    }

    function applyRTL(element) {
        if (element.getAttribute(MODIFIED_ATTR) === 'true') return;

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
            // Isolate Latin runs inside RTL card text (titles/descriptions/comments
            // mix Persian with English/SaaS/domain tokens). engine.isolateInline is
            // a no-op unless the recipe opts in via inlineIsolate.
            engine.isolateInline?.(element);
        } else {
            engine.clearInline?.(element);
            restoreElement(element);
        }
    }

    function processRoot(root, engine) {
        getTextTargets(root).forEach(target => processTextTarget(target, engine));
    }

    function processChecklistRoot(root, engine) {
        if (!isChecklistItem(root)) return true;
        // The checkbox lives in a sibling label. Style only the renderer's text
        // leaf so direction never changes Trello's checkbox/flex positioning.
        queryAll(root, CHECKLIST_TEXT_SELECTORS)
            .forEach(target => processTextTarget(target, engine));
        return true;
    }

    function processCommentRoot(root, engine) {
        processTextTarget(root, engine);
        processRoot(root, engine);
    }

    function processCardDialog(dialog, engine) {
        if (!isCardDialog(dialog)) return true;
        findDescriptionRoots(dialog).forEach(root => processRoot(root, engine));
        findCommentRoots(dialog).forEach(root => processCommentRoot(root, engine));
        return true;
    }

    function processHomeFeedCommentCard(section, engine) {
        if (!isHomeFeedCommentCard(section)) return true;
        findHomeFeedCommentRoots(section).forEach(root => processCommentRoot(root, engine));
        return true;
    }

    function processHomeFeedPreviewLink(link, engine) {
        if (!isHomeFeedPreviewLink(link)) return true;
        processRoot(link, engine);
        return true;
    }

    function processHomeFeedComposer(element, engine) {
        if (!isHomeFeedComposer(element)) return true;
        processTextTarget(element, engine);
        return true;
    }

    function processBoardCardTitle(element, engine) {
        if (!isBoardCardTitle(element)) return true;
        processTextTarget(element, engine);
        return true;
    }

    function processCardBackTitle(element, engine) {
        if (!isCardBackTitle(element)) return true;
        processTextTarget(element, engine);
        return true;
    }

    function processCardBackTitleInput(element, engine) {
        if (!isCardBackTitleInput(element)) return true;
        // Trello keeps this textarea visually over the static h2 title, so it
        // must be styled directly rather than excluded as generic UI input.
        const text = String(element.value || element.textContent || '').trim();
        if (engine.needsRTL(text)) applyRTL(element);
        else restoreElement(element);
        return true;
    }

    function cleanUpStyles() {
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
    }

    const recipe = {
        version: 1,
        storageKey: 'trelloEnabled',
        inlineIsolate: true,
        hosts: ['trello.com', 'www.trello.com'],
        messageSelectors: [...CARD_DIALOG_SELECTORS, BOARD_CARD_TITLE_SELECTOR, CARD_BACK_TITLE_SELECTOR, CARD_BACK_TITLE_INPUT_SELECTOR, CHECKLIST_ITEM_SELECTOR],
        excludeSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: /\p{Script=Arabic}/u,
        rtlStyle: { unicodeBidi: 'plaintext' },
        isMessageElement: element =>
            isCardDialog(element)
            || isHomeFeedCommentCard(element)
            || isHomeFeedPreviewLink(element)
            || isHomeFeedComposer(element)
            || isBoardCardTitle(element)
            || isCardBackTitle(element)
            || isCardBackTitleInput(element)
            || isChecklistItem(element),
        isCodeLike,
        applyToMessage: (container, engine) => {
            if (processCardDialog(container, engine) !== true) return false;
            if (processHomeFeedCommentCard(container, engine) !== true) return false;
            if (processHomeFeedPreviewLink(container, engine) !== true) return false;
            if (processHomeFeedComposer(container, engine) !== true) return false;
            if (processBoardCardTitle(container, engine) !== true) return false;
            if (processCardBackTitle(container, engine) !== true) return false;
            if (processCardBackTitleInput(container, engine) !== true) return false;
            return processChecklistRoot(container, engine);
        },
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
                unicode-bidi: isolate;
            }

            .${MODIFIED_CLASS},
            .${MODIFIED_CLASS} p,
            .${MODIFIED_CLASS} h1,
            .${MODIFIED_CLASS} h2,
            .${MODIFIED_CLASS} h3,
            .${MODIFIED_CLASS} h4,
            .${MODIFIED_CLASS} h5,
            .${MODIFIED_CLASS} h6,
            .${MODIFIED_CLASS} div,
            .${MODIFIED_CLASS} span,
            .${MODIFIED_CLASS} li,
            .${MODIFIED_CLASS} blockquote {
                direction: rtl !important;
                text-align: right !important;
                font-family: "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
            }

            .${MODIFIED_CLASS} a {
                unicode-bidi: isolate;
            }

            .${MODIFIED_CLASS} ul,
            .${MODIFIED_CLASS} ol {
                padding-right: 2rem;
                padding-left: 0;
            }
        `
    };

    if (typeof window !== 'undefined' && typeof window.__TRELLO_RTL_TEST__ === 'function') {
        window.__TRELLO_RTL_TEST__({
            recipe,
            isCardDialog,
            isHomeFeedCommentCard,
            isHomeFeedPreviewLink,
            isHomeFeedComposer,
            findDescriptionRoots,
            processChecklistRoot,
            isBoardCardTitle,
            isCardBackTitle,
            isCardBackTitleInput,
            isChecklistItem,
            findCommentRoots,
            checklistTextSelectors: CHECKLIST_TEXT_SELECTORS,
            findHomeFeedCommentRoots,
            getTextTargets,
            commentRootSelectors: COMMENT_ROOT_SELECTORS,
            homeFeedCommentDocumentSelectors: HOME_FEED_COMMENT_DOCUMENT_SELECTORS,
            homeFeedPreviewTextTargetSelectors: HOME_FEED_PREVIEW_TEXT_TARGET_SELECTORS,
            homeFeedComposerSelectors: HOME_FEED_COMPOSER_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
