(() => {
    'use strict';

    const host = window.__RASTCHIN_DESKTOP_HOST__ || window.location.hostname || 'desktop.rastchin.tools';
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const MONO_FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

    // Conservative, product-neutral blocks found in local Electron renderers.
    // This adapter never makes a whole application root RTL; it only evaluates
    // individual prose/list/table-cell blocks and leaves interactive chrome alone.
    const roots = [
        'main',
        '[role="main"]',
        '#root',
        '#app',
        '[data-testid*="conversation" i]',
        '[data-testid*="thread" i]',
        '[data-testid*="message" i]',
        '[data-testid*="response" i]',
        '[data-message-id]'
    ];
    const blocks = [
        'p', 'li', 'ul', 'ol', 'blockquote',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'figcaption', 'td', 'th', '[role="listitem"]', '[role="cell"]',
        '[role="columnheader"]', '[role="rowheader"]'
    ];
    const messageSelectors = [];
    for (const root of roots) {
        for (const block of blocks) messageSelectors.push(`${root} ${block}`);
    }
    messageSelectors.push(
        '[data-testid*="message" i]',
        '[data-testid*="response" i]',
        '[data-message-id]'
    );

    const codeGuards = [
        'code', 'pre', 'kbd', 'samp',
        '[role="code"]', '[data-testid*="code" i]',
        '[class*="code-block" i]', '[class*="language-"]',
        '.monaco-editor', '.cm-editor', '.ace_editor'
    ];
    const chromeGuards = [
        'nav', 'aside', 'header',
        'button', '[role="button"]', '[role="toolbar"]', '[role="menu"]',
        '[role="menubar"]', '[role="tablist"]', '[role="navigation"]',
        'input', 'textarea', '[contenteditable]:not([contenteditable="false"])',
        '[role="textbox"]', 'svg', '[role="img"]'
    ];

    RastChinRecipe.runPlatformRecipe({
        version: 1,
        storageKey: 'desktopEnabled',
        hosts: [host],
        messageSelectors,
        textSelectors: [],
        codeGuardSelectors: codeGuards,
        excludeSelectors: chromeGuards,
        rtlRegex: /\p{Script=Arabic}/u,
        rtlClass: 'rastchin-desktop-rtl',
        rtlStyle: { unicodeBidi: 'isolate' },
        inlineIsolate: true,
        streamingSelector: '.result-streaming, [data-is-streaming="true"], [data-message-status="in_progress"]',
        globalCss: codeGuard => `
            .rastchin-desktop-rtl {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
                font-family: ${CONTENT_FONT_STACK} !important;
            }
            .rastchin-desktop-rtl:is(ul, ol) {
                padding-inline-start: 2rem !important;
                padding-inline-end: 0 !important;
            }
            .rastchin-desktop-rtl:is(td, th, [role="cell"], [role="columnheader"], [role="rowheader"]) {
                direction: rtl !important;
                text-align: right !important;
            }
            ${codeGuard}, ${codeGuard} * {
                direction: ltr !important;
                text-align: left !important;
                font-family: ${MONO_FONT_STACK} !important;
            }
        `
    });
})();
