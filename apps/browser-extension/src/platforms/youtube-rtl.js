// src/platforms/youtube-rtl.js
(() => {
    const FONT_URL = chrome.runtime.getURL("src/assets/fonts/Vazirmatn[wght].ttf");
    const MODIFIED_ATTR = 'data-rastchin-youtube-rtl';
    const MODIFIED_CLASS = 'rastchin-youtube-rtl';
    const CAPTION_DIR_RTL_CLASS = 'rastchin-youtube-caption-dir-rtl';
    const CAPTION_DIR_LTR_CLASS = 'rastchin-youtube-caption-dir-ltr';
    const LEGACY_CAPTION_CLASSES = [
        'rastchin-youtube-bg-pending',
        'rastchin-youtube-bg-ready',
        'rastchin-youtube-roll',
        'rastchin-youtube-seen'
    ];
    const FONT_SIZE_KEY = 'youtubeCaptionFontSize';
    const COLOR_KEY = 'youtubeCaptionColor';
    const DEFAULT_COLOR = '#ffd400';
    // Caption size is two SAFE presets — small + medium (v1.1.33). v1.1.31 hands the
    // caption window back to YouTube (no height/overflow/line-height override), so an
    // over-large font could make YouTube's own fixed-height rolling window clip the
    // second line. Capping the ceiling at MEDIUM (120% => 18px; a 2-line block ≈
    // 18 × 1.3 × 2 = 46.8px) keeps a cue well inside the ~52–62px native rolling
    // window seen on auto-translated Persian cues; small sits below it. The earlier
    // large (130% => 19.5px) and the old free slider (up to 24px) are gone — anything
    // bigger is the clip. Stored under the SAME youtubeCaptionFontSize key, so EVERY
    // value snaps into {100,120} (130/140/160 -> 120, <100 -> 100, in-between -> the
    // nearer preset) with no migration. Keep these two values in lockstep with the
    // side-panel presets (CAPTION_SIZE_PRESETS there) and the crop QA in
    // scripts/qa-youtube-caption-e2e.mjs.
    const CAPTION_SIZE_PRESETS = { small: 100, medium: 120 };
    const CAPTION_SIZE_VALUES = [
        CAPTION_SIZE_PRESETS.small,
        CAPTION_SIZE_PRESETS.medium
    ];
    const DEFAULT_FONT_SIZE = CAPTION_SIZE_PRESETS.medium; // 120 => 18px
    const MIN_FONT_SIZE = CAPTION_SIZE_PRESETS.small;      // 100 => 15px
    const MAX_FONT_SIZE = CAPTION_SIZE_PRESETS.medium;     // 120 => 18px (was large/130)
    // The size is STORED as a percentage but APPLIED at runtime as an absolute px,
    // so the on-video caption matches the side-panel preview exactly. The
    // preview pill is `font-size: calc(15px * scale)` (10.5px on narrow screens); we
    // mirror that 15px base here, so 120% => 18px. Applying the raw `%` made YouTube
    // resolve it against its own player-size-dependent caption base, which rendered
    // far smaller than the preview advertised. Keep CAPTION_BASE_PX in sync with the
    // preview base (.cap-preview__pill font-size in side-panel.html).
    //
    // Accepted tradeoff: a fixed px does NOT scale with the player like YouTube's
    // native captions do — exact preview parity is preferred over player-proportional
    // sizing. So the cue can read a touch small in fullscreen on a very large monitor
    // and a touch large in a tiny inline embed / PiP. The narrow tier below keys off
    // the VIEWPORT (matching the preview's own 680px media query, so preview<->on-video
    // stay in lockstep), not the player element. Revisit with a container query if
    // player-proportional sizing is ever judged more important than preview parity.
    const CAPTION_BASE_PX = 15;
    const CAPTION_BASE_PX_NARROW = 10.5;
    function nearestCaptionSizePreset(percent) {
        const clamped = clampNumber(percent, MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE);
        return CAPTION_SIZE_VALUES.reduce((best, value) =>
            Math.abs(value - clamped) < Math.abs(best - clamped) ? value : best, CAPTION_SIZE_PRESETS.small);
    }
    const captionFontPx = percent => (nearestCaptionSizePreset(percent) / 100) * CAPTION_BASE_PX;
    const DEFAULT_FONT_PX = captionFontPx(DEFAULT_FONT_SIZE); // 18
    const CAPTION_CONTAINER_SELECTOR = '.ytp-caption-window-container';
    const CAPTION_WINDOW_SELECTOR = '.caption-window';
    const CAPTION_WINDOW_SELECTORS = [
        CAPTION_CONTAINER_SELECTOR,
        CAPTION_WINDOW_SELECTOR
    ];

    const CAPTION_SEGMENT_SELECTOR = '.ytp-caption-segment';

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

    // ── YouTube UI-prose RTL (v1.1.24) ───────────────────────────────────────
    // A second, clearly-bounded section of this recipe: element-scoped Persian
    // RTL + Vazirmatn for YouTube's OWN UI text (video titles, descriptions,
    // channel names, metadata snippets, section/playlist titles, search). It is
    // strictly per-element — the whole-page layout, grid, sidebar, masthead,
    // toolbar and player chrome stay LTR. Captions remain owned by the caption
    // section above; prose rides the ENGINE's default walk (collectDirectionText
    // → needsRTL → applyRTL + inline BiDi isolation) via a distinct rtlClass, so
    // the two paths never share styling or bookkeeping.
    const PROSE_CLASS = 'rastchin-youtube-prose-rtl';
    const PROSE_FONT_CLASS = 'rastchin-youtube-prose-font';
    const SEARCH_RTL_CLASS = 'rastchin-youtube-search-rtl';
    const PROSE_FONT_STACK = '"Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const PROSE_LETTER_REGEX = /\p{L}/u;

    // Text-holders only — a leaf title/name node, or a self-contained TEXT block
    // (the description/snippet content wrapper). NEVER a flex/page-layout
    // container: dir=rtl on a text block is safe, but on a grid/sidebar/masthead
    // wrapper it would mirror the layout. Kept short and ID/tag-anchored so the
    // per-mutation querySelectorAll stays cheap on the busy SPA.
    const PROSE_SELECTORS = [
        // Card titles — home grid, search results, sidebar/related, playlist rows
        '#video-title',
        'a#video-title-link',
        'yt-formatted-string#video-title',
        'ytd-playlist-panel-video-renderer #video-title',
        // Modern lockup card title (home rich-grid + watch-page right sidebar/
        // related). The yt-lockup-view-model layout has NO #video-title; the title
        // is the <a class="…wiz__title"> under the metadata view-model's <h3>. The
        // h3 scope keeps this to the TITLE only — channel/view-count/date metadata
        // rows are not under an h3, so they are not flipped. Never the macro
        // yt-lockup-view-model root or the rich-grid/sidebar layout wrapper.
        'yt-lockup-metadata-view-model h3 .yt-lockup-metadata-view-model-wiz__title',
        // Live YouTube build (June 2026) uses camelCase view-model classes rather
        // than the dashed/wiz class names above. The text can be on the <a>
        // title leaf or on the inner attributed-string span; keep both scoped
        // under metadata-view-model > h3 so bylines/metadata rows stay untouched.
        'yt-lockup-metadata-view-model h3 .ytLockupMetadataViewModelTitle',
        'yt-lockup-metadata-view-model h3 .ytAttributedStringHost',
        // Watch-page primary title (current + older layouts)
        'ytd-watch-metadata #title h1 yt-formatted-string',
        'ytd-watch-metadata h1 yt-formatted-string',
        'h1.ytd-watch-metadata yt-formatted-string',
        'ytd-video-primary-info-renderer #title h1 yt-formatted-string',
        // Watch-page description (collapsed + expanded), incl. structured chapters.
        // The current DOM renders the description text into yt-attributed-string
        // #attributed-snippet-text (or #plain-snippet-text) INSIDE #content; the
        // #content/#snippet wrappers alone missed the leaf, so collapsed text kept
        // its system font and expanded text never flipped. Scoped under the
        // expander id/tag so they only ever hit the description text leaf, never
        // the #expand/#collapse ("...more") buttons (those are role=button chrome).
        'ytd-text-inline-expander > #content',
        '#description-inline-expander #snippet',
        '#description-inline-expander #snippet-text',
        '#description-inline-expander #attributed-snippet-text',
        '#description-inline-expander #plain-snippet-text',
        '#description-inline-expander span.ytAttributedStringHost',
        'ytd-text-inline-expander yt-attributed-string#attributed-snippet-text',
        'ytd-structured-description-content-renderer #content',
        // Channel / uploader name
        'ytd-channel-name #text',
        '#channel-name #text',
        // Search-results metadata snippet
        '.metadata-snippet-text',
        // Shelf / section / rich-section titles
        'ytd-rich-section-renderer #title',
        'ytd-shelf-renderer #title',
        'ytd-reel-shelf-renderer #title',
        // Playlist panel header title (watch + playlist pages)
        'ytd-playlist-panel-renderer #title-form #title',
        'ytd-playlist-panel-video-renderer span#video-title',
        // Comments are text prose, not YouTube chrome. Keep the selector on the
        // comment text leaf so author/action rows remain untouched.
        'ytd-comment-view-model #content-text',
        'ytd-comment-renderer #content-text',
        // Search suggestions dropdown rows (legacy + polymer + modern view-model).
        // The modern dropdown is yt-searchbox-suggestion rows whose text leaf is
        // .ytSuggestionComponentSuggestionText; the [role="option"] scope alone was
        // fragile (the role can sit on a different ancestor across builds), so the
        // suggestion text often kept its system font. Scope by the stable component
        // tag and the suggestions container instead. Suggestions live under
        // #masthead, which is deliberately NOT fenced, so these are reachable.
        '.sbqs_c',
        'ytd-search-suggestion #text',
        'yt-searchbox-suggestion .ytSuggestionComponentSuggestionText',
        '.ytSearchboxComponentSuggestionsContainer .ytSuggestionComponentSuggestionText',
        'yt-searchbox .ytSuggestionComponentText',
        '.ytSearchboxComponentSuggestionsContainer .ytSuggestionComponentText',
        '[role="option"] .ytSuggestionComponentSuggestionText'
    ];

    // The search <input> never reaches the engine walk (its textContent is '' —
    // the typed string lives in .value). It is fenced out of the engine via
    // excludeSelectors and handled by a dedicated input/focusin listener below.
    const SEARCH_INPUT_SELECTOR = 'input#search, input.ytSearchboxComponentInput, ytd-searchbox input[type="text"], form#search-form input[type="text"], input[aria-label*="Search"], input[aria-label*="search"]';
    const SEARCH_SUGGESTION_TEXT_SELECTOR = [
        'yt-searchbox .ytSuggestionComponentText',
        '.ytSearchboxComponentSuggestionsContainer .ytSuggestionComponentText',
        'yt-searchbox-suggestion .ytSuggestionComponentSuggestionText',
        '.ytSearchboxComponentSuggestionsContainer .ytSuggestionComponentSuggestionText',
        '.sbqs_c',
        'ytd-search-suggestion #text'
    ].join(', ');
    const PROSE_SWEEP_TRIGGER_SELECTOR = [
        'yt-searchbox',
        '.ytSearchboxComponentSuggestionsContainer',
        '.ytSuggestionComponentText',
        'yt-lockup-metadata-view-model',
        'ytd-watch-metadata',
        'ytd-playlist-panel-video-renderer',
        'ytd-comment-view-model',
        'ytd-comment-renderer'
    ].join(', ');

    // Defence-in-depth chrome fence. engine.applyRTL has NO structural guard, so
    // were a prose selector ever to match a control/icon, this keeps it LTR; it
    // also feeds the BiDi protectedSelector so inline runs inside a button/icon
    // that happens to sit within a prose block are never wrapped. Deliberately
    // does NOT include `[class*="ytp-"]` or `#masthead`: the caption elements
    // (.caption-window / .ytp-caption-*) live under the player and the search
    // suggestions live under the masthead, so a broad fence there would suppress
    // captions/suggestions. Tight role/tag/icon guards are caption- and
    // suggestion-safe.
    const UI_CHROME_GUARD_SELECTORS = [
        'button',
        '[role="button"]',
        '[role="tab"]',
        '[role="toolbar"]',
        '[role="menubar"]',
        '[role="slider"]',
        '[role="progressbar"]',
        '[role="switch"]',
        'yt-icon',
        'yt-icon-button',
        'svg',
        '[contenteditable="true"]',
        SEARCH_INPUT_SELECTOR
    ];

    const modifiedElements = new Set();
    // Search-input bookkeeping: the engine reference (for needsRTL), the bound
    // document listener (so detach removes the exact same function), and the set
    // of inputs we have styled (so onDisable strips them — zero trace).
    const searchInputState = { engine: null, handler: null };
    const proseSweepState = { engine: null, handler: null, observer: null, heartbeatId: null, timers: new Set() };
    const touchedSearchInputs = new Set();
    const touchedSearchHosts = new Set();
    const searchInputOriginals = new WeakMap();
    const touchedSuggestionTexts = new Set();
    const suggestionTextOriginals = new WeakMap();
    const fontOnlyProseElements = new Set();
    const canDefer = typeof setTimeout === 'function' && typeof clearTimeout === 'function';
    const canObserve = typeof MutationObserver === 'function';
    const canRepeat = typeof setInterval === 'function' && typeof clearInterval === 'function';
    const captionSettings = {
        fontSize: DEFAULT_FONT_SIZE,
        color: DEFAULT_COLOR
    };

    function isCodeLike(element) {
        return element instanceof HTMLElement && !!element.closest(CODE_GUARD_SELECTORS.join(', '));
    }

    function isCaptionMessageElement(element) {
        if (!(element instanceof HTMLElement)) return false;
        return CAPTION_WINDOW_SELECTORS.some(selector => element.matches?.(selector));
    }

    function isCaptionWindow(element) {
        return element instanceof HTMLElement && element.matches?.(CAPTION_WINDOW_SELECTOR);
    }

    function getCaptionWindows(element) {
        if (isCaptionWindow(element)) return [element];
        const windows = [];
        element.querySelectorAll?.(CAPTION_WINDOW_SELECTOR).forEach(windowEl => {
            if (windowEl instanceof HTMLElement) windows.push(windowEl);
        });
        return Array.from(new Set(windows));
    }

    function getCaptionSegments(windowEl) {
        const segments = [];
        if (windowEl.matches?.(CAPTION_SEGMENT_SELECTOR)) segments.push(windowEl);
        windowEl.querySelectorAll?.(CAPTION_SEGMENT_SELECTOR).forEach(seg => {
            if (seg instanceof HTMLElement) segments.push(seg);
        });
        return Array.from(new Set(segments.filter(Boolean)));
    }

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.round(number)));
    }

    function normalizeColor(value) {
        if (typeof value !== 'string') return DEFAULT_COLOR;
        const trimmed = value.trim();
        return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : DEFAULT_COLOR;
    }

    function applySettingsVariables() {
        if (!document?.documentElement?.style) return;
        // Absolute px (preview-equivalent), not %, so the on-video size matches the
        // preview. 120 (medium) => 18px. See CAPTION_BASE_PX.
        document.documentElement.style.setProperty('--rastchin-youtube-caption-font-px', `${captionFontPx(captionSettings.fontSize)}px`);
        document.documentElement.style.setProperty('--rastchin-youtube-caption-color', captionSettings.color);
    }

    function updateCaptionSettings(raw = {}) {
        captionSettings.fontSize = nearestCaptionSizePreset(raw[FONT_SIZE_KEY]);
        captionSettings.color = normalizeColor(raw[COLOR_KEY]);
        applySettingsVariables();
    }

    function readCaptionSettings() {
        applySettingsVariables();
        if (!chrome?.storage?.sync?.get) return;
        chrome.storage.sync.get({
            [FONT_SIZE_KEY]: DEFAULT_FONT_SIZE,
            [COLOR_KEY]: DEFAULT_COLOR
        }, updateCaptionSettings);
    }

    function subscribeToCaptionSettings() {
        if (!chrome?.storage?.onChanged?.addListener) return;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync') return;
            if (!changes[FONT_SIZE_KEY] && !changes[COLOR_KEY]) return;

            updateCaptionSettings({
                [FONT_SIZE_KEY]: changes[FONT_SIZE_KEY] ? changes[FONT_SIZE_KEY].newValue : captionSettings.fontSize,
                [COLOR_KEY]: changes[COLOR_KEY] ? changes[COLOR_KEY].newValue : captionSettings.color
            });
        });
    }

    function markCaptionSegment(element, direction = 'ltr') {
        element.setAttribute(MODIFIED_ATTR, 'true');
        element.classList.add(MODIFIED_CLASS);
        element.classList.remove(CAPTION_DIR_RTL_CLASS, CAPTION_DIR_LTR_CLASS);
        element.classList.add(direction === 'rtl' ? CAPTION_DIR_RTL_CLASS : CAPTION_DIR_LTR_CLASS);
        modifiedElements.add(element);
    }

    function getSegmentDirectionText(segment, engine) {
        if (typeof engine.collectDirectionText === 'function') return engine.collectDirectionText(segment).trim();
        return (segment.textContent || '').trim();
    }

    function needsCaptionRTL(text, engine) {
        const normalized = (text || '').trim();
        if (!normalized) return false;
        if (typeof engine.hasRtlLetter === 'function' && engine.hasRtlLetter(normalized)) return true;
        return engine.needsRTL(normalized);
    }

    // Caption settings are not Persian-only anymore: YouTube owns caption layout,
    // clipping, rolling AND base-direction mechanics. RastChin applies only the
    // chosen display settings to every visible subtitle segment. Direction classes
    // are kept as inert metadata/debug markers; they intentionally have no CSS
    // effect because YouTube auto-translate can split RTL captions into many inline
    // word segments, and forcing direction/unicode-bidi on each segment can break
    // the native caption renderer.
    const CAPTION_RTL_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
    function captionSegmentDirection(text, engine, fallback = 'ltr') {
        const normalized = (text || '').trim();
        if (!normalized) return fallback;
        if (CAPTION_RTL_SCRIPT.test(normalized)) return 'rtl';
        if (needsCaptionRTL(normalized, engine)) return 'rtl';
        return 'ltr';
    }

    // ── Persian neutral-punctuation segments (v1.1.32, Issue 1) ───────────────
    // YouTube frequently splits a lone punctuation mark — an ASCII «?», «!», «.»,
    // a quote or a parenthesis — into its OWN .ytp-caption-segment. Such a segment
    // carries no Persian letter, so needsCaptionRTL skips it and it keeps YouTube's
    // default white/Roboto look right beside the styled Persian run: a visible
    // colour/font mismatch. When the SAME caption window already holds Persian, we
    // also mark these PUNCTUATION-ONLY segments so the mark inherits the identical
    // Vazirmatn / colour / size as the words around them.
    //
    // The guard is deliberately strict — a segment qualifies only when EVERY
    // character is whitespace, a bidi/joining control, or one of an explicit
    // punctuation allow-list, AND it carries at least one visible punctuation
    // glyph. Any letter (Latin or otherwise), digit, @ or / disqualifies it, so
    // English words, numbers, timestamps, URLs, emails and code-like runs are never
    // swept in. Nothing here adds dir/direction/text-align — only the SAME
    // class/attr marker the words use, which the text-only segment CSS styles.
    const NEUTRAL_PUNCT_ONLY = /^[\s\u00A0\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069?!.,:;…؟؛،«»‹›"'‘’“”„‚`(){}\[\]\-–—‒―ـ•·]+$/u;
    const NEUTRAL_HAS_VISIBLE = /[?!.,:;…؟؛،«»‹›"'‘’“”„‚`(){}\[\]\-–—‒―•·]/u;
    const LATIN_OR_DIGIT = /[\p{Script=Latin}\p{Nd}]/u;
    const COMPLETE_URLISH_RUN = /(?:https?:\/\/|www\.|@|[\p{Script=Latin}0-9-]+\.[a-z]{2,})/iu;
    function isNeutralPunctuationSegment(text) {
        const normalized = (text || '').trim();
        if (!normalized) return false;
        return NEUTRAL_PUNCT_ONLY.test(normalized) && NEUTRAL_HAS_VISIBLE.test(normalized);
    }

    function getSegmentText(segment, engine) {
        return engine.collectDirectionText(segment).trim();
    }

    function isExcludedSegment(segment, engine) {
        return Boolean(typeof engine.isExcluded === 'function' && engine.isExcluded(segment));
    }

    function isUrlishPunctuationContext(text, segments, index, engine) {
        const normalized = (text || '').trim();
        if (!/[.:\-–—?]/u.test(normalized)) return false;

        const prev = segments[index - 1];
        const next = segments[index + 1];
        const prevText = prev ? getSegmentText(prev, engine) : '';
        const nextText = next ? getSegmentText(next, engine) : '';
        const prevLatin = LATIN_OR_DIGIT.test(prevText);
        const nextLatin = LATIN_OR_DIGIT.test(nextText);

        if ((prev && isExcludedSegment(prev, engine)) || (next && isExcludedSegment(next, engine))) return true;
        if (/[.\-–—]/u.test(normalized) && prevLatin && nextLatin) return true;
        if (/:/u.test(normalized) && (/^(?:https?|ftp)$/iu.test(prevText) || /^\/+$/u.test(nextText))) return true;
        if (/\?/u.test(normalized) && (COMPLETE_URLISH_RUN.test(prevText) || /[=&]/u.test(nextText))) return true;
        return false;
    }

    function restoreElement(element) {
        if (!element) return;
        element.removeAttribute?.(MODIFIED_ATTR);
        element.classList?.remove?.(MODIFIED_CLASS, CAPTION_DIR_RTL_CLASS, CAPTION_DIR_LTR_CLASS);
        LEGACY_CAPTION_CLASSES.forEach(className => element.classList?.remove?.(className));
        modifiedElements.delete(element);
    }

    function processCaptionSegment(element, engine, windowDirection = 'ltr', shouldStyleNeutral = false) {
        if (isExcludedSegment(element, engine)) {
            restoreElement(element);
            return;
        }

        const text = getSegmentText(element, engine);
        if (!text || (isNeutralPunctuationSegment(text) && !shouldStyleNeutral)) {
            restoreElement(element);
            return;
        }

        markCaptionSegment(element, isNeutralPunctuationSegment(text)
            ? windowDirection
            : captionSegmentDirection(text, engine, windowDirection));
    }

    function pruneDetached() {
        // YouTube recreates caption windows/segments roughly every cue, so styled
        // entries pile up as their elements detach. Drop the detached ones (real
        // DOM reports isConnected === false) to keep the Set bounded to the live
        // captions across a long video. Mock test nodes report undefined and stay.
        modifiedElements.forEach(element => {
            if (element && element.isConnected === false) {
                LEGACY_CAPTION_CLASSES.forEach(className => element.classList?.remove?.(className));
                modifiedElements.delete(element);
            }
        });
    }

    function processSingleCaptionWindow(windowEl, engine) {
        restoreElement(windowEl);
        const segments = getCaptionSegments(windowEl);
        // Every visible subtitle segment receives the user's display settings.
        // Punctuation-only segments inherit the dominant sibling direction so a
        // split «?»/«!» uses the same colour/font/size as the cue without changing
        // YouTube's caption window, background, clipping or rolling behavior.
        const contentSegments = segments.filter(segment => {
            if (isExcludedSegment(segment, engine)) return false;
            const text = getSegmentDirectionText(segment, engine);
            return Boolean(text && !isNeutralPunctuationSegment(text));
        });
        const windowDirection = contentSegments.some(segment =>
            captionSegmentDirection(getSegmentDirectionText(segment, engine), engine) === 'rtl') ? 'rtl' : 'ltr';
        const hasStyledCaptionText = contentSegments.length > 0;
        segments.forEach((segment, index) => {
            const text = getSegmentText(segment, engine);
            const shouldSkipNeutral = isNeutralPunctuationSegment(text) &&
                isUrlishPunctuationContext(text, segments, index, engine);
            processCaptionSegment(segment, engine, windowDirection, hasStyledCaptionText && !shouldSkipNeutral);
        });
    }

    function processCaptionWindow(windowEl, engine) {
        if (!isCaptionMessageElement(windowEl)) return true;
        pruneDetached();

        getCaptionWindows(windowEl).forEach(captionWindow => processSingleCaptionWindow(captionWindow, engine));
        return true;
    }

    function cleanUpStyles() {
        Array.from(modifiedElements).forEach(restoreElement);
        document.querySelectorAll(`[${MODIFIED_ATTR}="true"]`).forEach(restoreElement);
    }

    // ── Prose direction + dispatcher ─────────────────────────────────────────
    // First-strong direction, mirroring the browser's `dir="auto"` (UBA P2/P3)
    // that YouTube already uses on its formatted strings. So we never disagree
    // with the visual order YouTube would render — we only ADD Vazirmatn and
    // copy-safe inline isolation on top. This is intentionally more permissive
    // than the engine's default 0.40 RTL-letter threshold, which would leave a
    // Persian-first title like «آموزش Photoshop 2025» (35% RTL letters, no
    // پچژگکی) as LTR. LTR-only tokens (URLs/emails/code/paths) are stripped
    // first so a leading link can't decide the direction. Supplied via the
    // recipe's `needsRTL` hook, so it affects ONLY the prose path — captions
    // keep their own needsCaptionRTL, every other platform keeps the default.
    function needsProseRTL(text, engine) {
        if (!text) return false;
        const stripped = typeof engine.stripLtrTokens === 'function'
            ? engine.stripLtrTokens(text)
            : String(text);
        const rtlRegex = engine.rtlRegex || /\p{Script=Arabic}/u;
        for (const ch of stripped) {
            if (!PROSE_LETTER_REGEX.test(ch)) continue; // first STRONG letter decides
            return rtlRegex.test(ch);
        }
        return false;
    }

    function hasProseRtlLetter(text, engine) {
        if (!text) return false;
        if (engine && typeof engine.hasRtlLetter === 'function') return engine.hasRtlLetter(text);
        const stripped = String(text).replace(/\s+/g, ' ').trim();
        return /\p{Script=Arabic}/u.test(stripped);
    }

    function clearFontOnlyProse(element) {
        if (!element) return;
        element.classList?.remove?.(PROSE_FONT_CLASS);
        fontOnlyProseElements.delete(element);
    }

    function applyFontOnlyProse(element, text, engine) {
        if (!element || typeof element.classList?.add !== 'function') return;
        if (element.classList.contains(PROSE_CLASS)) {
            clearFontOnlyProse(element);
            return;
        }
        if (hasProseRtlLetter(text, engine)) {
            element.classList.add(PROSE_FONT_CLASS);
            fontOnlyProseElements.add(element);
        } else {
            clearFontOnlyProse(element);
        }
    }

    // applyToMessage dispatcher. Captions are owned by the caption section and
    // MUST short-circuit (processCaptionWindow returns true so the engine stops);
    // returning undefined for prose hands control to the engine's default walk
    // (the EXACT prose flow we want — see rtl-engine.js applyToMessage). Returning
    // true for prose would silently swallow it, so the undefined here is load-
    // bearing, not incidental.
    function processYouTube(element, engine) {
        if (isCaptionMessageElement(element)) return processCaptionWindow(element, engine);
        return undefined;
    }

    // ── Search input (lives outside the engine walk) ─────────────────────────
    function toCamelProp(property) {
        return property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }
    function getStyleSafe(element, property) {
        const style = element && element.style;
        if (!style) return '';
        if (typeof style.getPropertyValue === 'function') return style.getPropertyValue(property) || '';
        return style[toCamelProp(property)] || '';
    }
    function getStylePrioritySafe(element, property) {
        const style = element && element.style;
        if (!style || typeof style.getPropertyPriority !== 'function') return '';
        return style.getPropertyPriority(property) || '';
    }
    function setStyleSafe(element, property, value, priority = 'important') {
        const style = element && element.style;
        if (!style) return;
        if (typeof style.setProperty === 'function') style.setProperty(property, value, priority);
        else style[toCamelProp(property)] = value;
    }
    function removeStyleSafe(element, property) {
        const style = element && element.style;
        if (!style) return;
        if (typeof style.removeProperty === 'function') style.removeProperty(property);
        else delete style[toCamelProp(property)];
    }
    function restoreStyleSafe(element, property, value, priority) {
        if (value) setStyleSafe(element, property, value, priority || '');
        else removeStyleSafe(element, property);
    }
    function rememberSearchInputOriginal(inputEl) {
        if (!inputEl || searchInputOriginals.has(inputEl)) return;
        searchInputOriginals.set(inputEl, {
            dir: typeof inputEl.getAttribute === 'function' ? inputEl.getAttribute('dir') : null,
            direction: getStyleSafe(inputEl, 'direction'),
            directionPriority: getStylePrioritySafe(inputEl, 'direction'),
            textAlign: getStyleSafe(inputEl, 'text-align'),
            textAlignPriority: getStylePrioritySafe(inputEl, 'text-align'),
            fontFamily: getStyleSafe(inputEl, 'font-family'),
            fontFamilyPriority: getStylePrioritySafe(inputEl, 'font-family')
        });
    }
    function rememberSuggestionTextOriginal(element) {
        if (!element || suggestionTextOriginals.has(element)) return;
        suggestionTextOriginals.set(element, {
            dir: typeof element.getAttribute === 'function' ? element.getAttribute('dir') : null,
            direction: getStyleSafe(element, 'direction'),
            directionPriority: getStylePrioritySafe(element, 'direction'),
            textAlign: getStyleSafe(element, 'text-align'),
            textAlignPriority: getStylePrioritySafe(element, 'text-align'),
            unicodeBidi: getStyleSafe(element, 'unicode-bidi'),
            unicodeBidiPriority: getStylePrioritySafe(element, 'unicode-bidi'),
            fontFamily: getStyleSafe(element, 'font-family'),
            fontFamilyPriority: getStylePrioritySafe(element, 'font-family'),
            hadProseClass: element.classList?.contains?.(PROSE_CLASS) === true
        });
    }

    function isSearchInput(node) {
        return !!(node && typeof node.matches === 'function' && node.matches(SEARCH_INPUT_SELECTOR));
    }

    function searchHostFor(inputEl) {
        if (!inputEl) return null;
        let node = inputEl;
        while (node) {
            const tag = String(node.tagName || '').toUpperCase();
            if (tag === 'YT-SEARCHBOX' || tag === 'YTD-SEARCHBOX') return node;
            if (tag === 'FORM' && node.matches?.('form#search-form')) return node;
            node = node.parentElement;
        }
        return null;
    }

    function hasActiveRtlSearchInput() {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false;
        try {
            return Array.from(document.querySelectorAll(SEARCH_INPUT_SELECTOR))
                .some(input => input?.getAttribute?.('dir') === 'rtl');
        } catch (_) {
            return false;
        }
    }

    function markSearchHostRTL(inputEl) {
        const host = searchHostFor(inputEl);
        if (host) {
            host.classList?.add?.(SEARCH_RTL_CLASS);
            touchedSearchHosts.add(host);
        }
        document?.documentElement?.classList?.add?.(SEARCH_RTL_CLASS);
    }

    function clearSearchHostRTL(inputEl) {
        const host = searchHostFor(inputEl);
        if (host) {
            host.classList?.remove?.(SEARCH_RTL_CLASS);
            touchedSearchHosts.delete(host);
        }
        touchedSearchHosts.forEach(touchedHost => {
            if (!touchedHost || touchedHost.isConnected === false) {
                touchedSearchHosts.delete(touchedHost);
                return;
            }
            const activeRtlInput = touchedHost.querySelector?.(`${SEARCH_INPUT_SELECTOR}[dir="rtl"]`);
            if (!activeRtlInput) {
                touchedHost.classList?.remove?.(SEARCH_RTL_CLASS);
                touchedSearchHosts.delete(touchedHost);
            }
        });
        if (!hasActiveRtlSearchInput()) {
            document?.documentElement?.classList?.remove?.(SEARCH_RTL_CLASS);
        }
    }

    function applySuggestionTextDirection(element, engine) {
        if (!element || typeof element.setAttribute !== 'function') return;
        const activeEngine = engine || proseSweepState.engine || searchInputState.engine;
        const text = (typeof activeEngine?.collectDirectionText === 'function'
            ? activeEngine.collectDirectionText(element)
            : (element.textContent || '')).trim();
        const rtl = !!(activeEngine && typeof activeEngine.needsRTL === 'function' && activeEngine.needsRTL(text));
        if (rtl) {
            rememberSuggestionTextOriginal(element);
            element.setAttribute('dir', 'rtl');
            element.classList?.add?.(PROSE_CLASS);
            setStyleSafe(element, 'direction', 'rtl');
            setStyleSafe(element, 'text-align', 'right');
            setStyleSafe(element, 'unicode-bidi', 'plaintext');
            setStyleSafe(element, 'font-family', PROSE_FONT_STACK);
            touchedSuggestionTexts.add(element);
            activeEngine?.isolateInline?.(element);
        } else {
            clearSuggestionTextDirection(element);
        }
    }

    function clearSuggestionTextDirection(element) {
        if (!element) return;
        const original = suggestionTextOriginals.get(element);
        if (original) {
            if (original.dir === null || original.dir === undefined) element.removeAttribute?.('dir');
            else element.setAttribute?.('dir', original.dir);
            restoreStyleSafe(element, 'direction', original.direction, original.directionPriority);
            restoreStyleSafe(element, 'text-align', original.textAlign, original.textAlignPriority);
            restoreStyleSafe(element, 'unicode-bidi', original.unicodeBidi, original.unicodeBidiPriority);
            restoreStyleSafe(element, 'font-family', original.fontFamily, original.fontFamilyPriority);
            if (!original.hadProseClass) element.classList?.remove?.(PROSE_CLASS);
            suggestionTextOriginals.delete(element);
        } else {
            element.removeAttribute?.('dir');
            removeStyleSafe(element, 'direction');
            removeStyleSafe(element, 'text-align');
            removeStyleSafe(element, 'unicode-bidi');
            removeStyleSafe(element, 'font-family');
            element.classList?.remove?.(PROSE_CLASS);
        }
        touchedSuggestionTexts.delete(element);
    }

    function applySearchSuggestionsDirection(engine) {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
        document.querySelectorAll(SEARCH_SUGGESTION_TEXT_SELECTOR).forEach(element => applySuggestionTextDirection(element, engine));
        touchedSuggestionTexts.forEach(element => {
            if (element && element.isConnected === false) {
                suggestionTextOriginals.delete(element);
                touchedSuggestionTexts.delete(element);
            }
        });
    }

    // Toggle the search box's own direction/font from its .value (the engine can
    // never see it — an <input> has no child text nodes). Only dir + a couple of
    // styles change; we never touch .value, .focus() or the node identity, so the
    // caret/selection are preserved while typing.
    function applySearchInputDirection(inputEl, engine) {
        if (!inputEl || typeof inputEl.setAttribute !== 'function') return;
        const value = typeof inputEl.value === 'string' ? inputEl.value : '';
        const activeEngine = engine || searchInputState.engine;
        const rtl = !!(activeEngine && typeof activeEngine.needsRTL === 'function' && activeEngine.needsRTL(value));
        if (rtl) {
            rememberSearchInputOriginal(inputEl);
            inputEl.setAttribute('dir', 'rtl');
            setStyleSafe(inputEl, 'direction', 'rtl');
            setStyleSafe(inputEl, 'text-align', 'right');
            setStyleSafe(inputEl, 'font-family', PROSE_FONT_STACK);
            markSearchHostRTL(inputEl);
            touchedSearchInputs.add(inputEl);
        } else {
            clearSearchInputDirection(inputEl);
        }
    }
    function clearSearchInputDirection(inputEl) {
        if (!inputEl) return;
        const original = searchInputOriginals.get(inputEl);
        if (original) {
            if (original.dir === null || original.dir === undefined) inputEl.removeAttribute?.('dir');
            else inputEl.setAttribute?.('dir', original.dir);
            restoreStyleSafe(inputEl, 'direction', original.direction, original.directionPriority);
            restoreStyleSafe(inputEl, 'text-align', original.textAlign, original.textAlignPriority);
            restoreStyleSafe(inputEl, 'font-family', original.fontFamily, original.fontFamilyPriority);
            searchInputOriginals.delete(inputEl);
        } else {
            inputEl.removeAttribute?.('dir');
            removeStyleSafe(inputEl, 'direction');
            removeStyleSafe(inputEl, 'text-align');
            removeStyleSafe(inputEl, 'font-family');
        }
        clearSearchHostRTL(inputEl);
        touchedSearchInputs.delete(inputEl);
    }

    // Drop inputs that detached on an SPA re-mount so the Set can't grow unbounded
    // across a long session (mirrors the caption pruneDetached intent, much rarer
    // here because YouTube's masthead searchbox is effectively persistent).
    function pruneDetachedSearchInputs() {
        touchedSearchInputs.forEach(input => {
            if (input && input.isConnected === false) clearSearchInputDirection(input);
        });
    }

    // One delegated capture-phase listener on document covers the searchbox even
    // though YouTube mounts/re-mounts it lazily across SPA navigations. focusin
    // also fires it so a pre-filled value (back-nav restoring a query) gets the
    // right direction immediately.
    function attachSearchInput(engine) {
        searchInputState.engine = engine;
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        if (searchInputState.handler) return;
        const handler = event => {
            const target = event && event.target;
            if (!isSearchInput(target)) return;
            applySearchInputDirection(target, searchInputState.engine);
            scheduleProseSweeps(searchInputState.engine);
            pruneDetachedSearchInputs();
        };
        searchInputState.handler = handler;
        document.addEventListener('input', handler, true);
        document.addEventListener('focusin', handler, true);
        // Style a search box that is already mounted AND pre-filled at enable time
        // (e.g. a Persian query restored by back-nav) — the listeners above only
        // fire on FUTURE input/focus, so a one-shot sweep covers the initial state.
        if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll(SEARCH_INPUT_SELECTOR).forEach(input => applySearchInputDirection(input, engine));
        }
    }
    function detachSearchInput() {
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function' && searchInputState.handler) {
            document.removeEventListener('input', searchInputState.handler, true);
            document.removeEventListener('focusin', searchInputState.handler, true);
        }
        searchInputState.handler = null;
        searchInputState.engine = null;
        Array.from(touchedSearchInputs).forEach(clearSearchInputDirection);
        touchedSearchHosts.forEach(host => host?.classList?.remove?.(SEARCH_RTL_CLASS));
        touchedSearchHosts.clear();
        document?.documentElement?.classList?.remove?.(SEARCH_RTL_CLASS);
    }

    function runProseSweepNow(engine) {
        if (!engine || !engine.enabled || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
        applySearchSuggestionsDirection(engine);
        const selector = PROSE_SELECTORS.join(', ');
        try {
            document.querySelectorAll(selector).forEach(el => {
                if (!el || el.isConnected === false) return;
                if (typeof engine.isExcluded === 'function' && engine.isExcluded(el)) return;
                const text = (typeof engine.collectDirectionText === 'function'
                    ? engine.collectDirectionText(el)
                    : (el.textContent || '')).trim();
                engine.applyToMessage?.(el);
                applyFontOnlyProse(el, text, engine);
            });
            fontOnlyProseElements.forEach(el => {
                if (!el || el.isConnected === false) fontOnlyProseElements.delete(el);
            });
        } catch (err) {
            console.warn?.('RastChin: YouTube prose sweep skipped invalid selector', err);
        }
    }

    function queueProseSweep(engine, delay = 0) {
        if (!engine || !canDefer) {
            runProseSweepNow(engine);
            engine?.scheduleScan?.(document?.body || document?.documentElement || document);
            return;
        }
        const timer = setTimeout(() => {
            proseSweepState.timers.delete(timer);
            if (!engine.enabled) return;
            runProseSweepNow(engine);
            engine.scheduleScan?.(document.body || document.documentElement || document);
        }, delay);
        proseSweepState.timers.add(timer);
    }

    function scheduleProseSweeps(engine) {
        if (proseSweepState.timers.size) return;
        // YouTube is a SPA and often mounts visible lockup/description/suggestion
        // DOM before the recipe is enabled, then mutates only small descendants
        // during navigation. A short burst of body scans after enable/navigation
        // keeps element-scoped prose styling in sync without making the engine's
        // normal observer broader or turning the whole page RTL.
        [0, 250, 1000, 2500, 5000].forEach(delay => queueProseSweep(engine, delay));
    }

    function mutationTouchesProseSurface(mutation) {
        const touches = node => {
            if (!node || !(node instanceof Element)) return false;
            try {
                return node.matches?.(PROSE_SWEEP_TRIGGER_SELECTOR)
                    || !!node.closest?.(PROSE_SWEEP_TRIGGER_SELECTOR)
                    || !!node.querySelector?.(PROSE_SWEEP_TRIGGER_SELECTOR);
            } catch (_) {
                return false;
            }
        };
        if (touches(mutation.target)) return true;
        for (const node of mutation.addedNodes || []) {
            if (touches(node)) return true;
        }
        return false;
    }

    function attachProseSweeps(engine) {
        proseSweepState.engine = engine;
        scheduleProseSweeps(engine);
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        if (proseSweepState.handler) return;
        const handler = () => scheduleProseSweeps(proseSweepState.engine);
        proseSweepState.handler = handler;
        window.addEventListener('yt-navigate-finish', handler, true);
        window.addEventListener('yt-page-data-updated', handler, true);
        window.addEventListener('popstate', handler, true);
        if (!proseSweepState.observer && canObserve && document?.body) {
            const observer = new MutationObserver(mutations => {
                if (!proseSweepState.engine?.enabled) return;
                if (mutations.some(mutationTouchesProseSurface)) {
                    scheduleProseSweeps(proseSweepState.engine);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            proseSweepState.observer = observer;
        }
        if (!proseSweepState.heartbeatId && canRepeat) {
            proseSweepState.heartbeatId = setInterval(() => {
                if (proseSweepState.engine?.enabled) runProseSweepNow(proseSweepState.engine);
            }, 2000);
        }
    }

    function detachProseSweeps() {
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && proseSweepState.handler) {
            window.removeEventListener('yt-navigate-finish', proseSweepState.handler, true);
            window.removeEventListener('yt-page-data-updated', proseSweepState.handler, true);
            window.removeEventListener('popstate', proseSweepState.handler, true);
        }
        proseSweepState.observer?.disconnect?.();
        proseSweepState.observer = null;
        if (proseSweepState.heartbeatId && canRepeat) clearInterval(proseSweepState.heartbeatId);
        proseSweepState.heartbeatId = null;
        proseSweepState.handler = null;
        proseSweepState.engine = null;
        proseSweepState.timers.forEach(timer => { if (canDefer) clearTimeout(timer); });
        proseSweepState.timers.clear();
        Array.from(touchedSuggestionTexts).forEach(clearSuggestionTextDirection);
        Array.from(fontOnlyProseElements).forEach(clearFontOnlyProse);
    }

    function handleEnable(engine) {
        attachSearchInput(engine);
        attachProseSweeps(engine);
    }
    function handleDisable() {
        detachProseSweeps();
        detachSearchInput();
        cleanUpStyles();
    }

    const recipe = {
        version: 1,
        storageKey: 'youtubeEnabled',
        hosts: ['www.youtube.com', 'm.youtube.com'],
        // Captions + UI prose share one engine. messageSelectors gain the leaf
        // prose text-holders; isMessageElement stays caption-only so the costly
        // querySelectorAll('*') walk is not broadened (prose is matched by the
        // cheaper string-selector path).
        messageSelectors: [...CAPTION_WINDOW_SELECTORS, ...PROSE_SELECTORS],
        // Chrome/search-input fence. The runner appends codeGuardSelectors to this
        // list when it builds the engine's excludeSelector + the BiDi
        // protectedSelector, so the code guard is intentionally NOT repeated here.
        excludeSelectors: UI_CHROME_GUARD_SELECTORS,
        codeGuardSelectors: CODE_GUARD_SELECTORS,
        textSelectors: [],
        rtlRegex: /\p{Script=Arabic}/u,
        rtlStyle: { unicodeBidi: 'plaintext' },
        // Prose elements the engine flips get this class for the Vazirmatn CSS;
        // distinct from the caption MODIFIED_CLASS, and tracked in the engine's
        // own styledElements map — no collision with the caption bookkeeping.
        rtlClass: PROSE_CLASS,
        // Wrap Latin/LTR runs inside flipped prose in <bdi dir="ltr"> so mixed
        // titles like «آموزش Photoshop 2025» stay readable and copy-safe.
        inlineIsolate: true,
        // First-strong direction for prose only (see needsProseRTL).
        needsRTL: needsProseRTL,
        isMessageElement: isCaptionMessageElement,
        isCodeLike,
        applyToMessage: processYouTube,
        onEnable: handleEnable,
        onDisable: handleDisable,
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

            @font-face {
                font-family: "RastChinCaptionVazirmatn";
                src: url(${JSON.stringify(FONT_URL)}) format("truetype-variations");
                font-weight: 100 900;
                font-style: normal;
                font-display: swap;
            }

            ${codeGuard} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate;
            }

            .ytp-caption-segment.${MODIFIED_CLASS} {
                font-family: "RastChinCaptionVazirmatn", "Vazirmatn", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif !important;
                color: var(--rastchin-youtube-caption-color, ${DEFAULT_COLOR}) !important;
                font-size: var(--rastchin-youtube-caption-font-px, ${DEFAULT_FONT_PX}px) !important;
            }

            /* Narrow viewports mirror the side-panel preview's 10.5px base (= 0.7 of
               the 15px desktop base) at the SAME 680px breakpoint the preview uses,
               so preview and on-video sizes stay in exact parity. */
            @media (max-width: 680px) {
                .ytp-caption-segment.${MODIFIED_CLASS} {
                    font-size: calc(var(--rastchin-youtube-caption-font-px, ${DEFAULT_FONT_PX}px) * ${CAPTION_BASE_PX_NARROW / CAPTION_BASE_PX}) !important;
                }
            }

            /* ════════ YouTube UI prose (v1.1.24) ════════════════════════════
             * Element-scoped Persian RTL for YouTube's own UI text. The engine
             * sets dir / direction / text-align / unicode-bidi as INLINE styles
             * (so restoreElement can clear them cleanly on flip-back/disable).
             * Latin-first mixed titles (e.g. "Milan Miles ❤️ اولین ولاگ...") keep
             * their native LTR direction but receive the font-only class below, so
             * Persian glyphs still use Vazirmatn without mirroring an English-led
             * headline. The Persian-range @font-face means Latin glyphs in a mixed
             * title fall back to the UI stack automatically. Icon-font carriers
             * (yt-icon / *[class*="icon"]) are fenced out so glyph fonts are
             * never overridden. NOTHING here targets body/html — the whole-page
             * layout, grid, sidebar, masthead and player chrome stay LTR. */
            .${PROSE_CLASS},
            .${PROSE_FONT_CLASS},
            .${PROSE_CLASS} :is(span, yt-formatted-string, a, b, strong, em, i, bdi):not(yt-icon):not(yt-icon-button):not([class*="icon"]):not([class*="Icon"]),
            .${PROSE_FONT_CLASS} :is(span, yt-formatted-string, a, b, strong, em, i, bdi):not(yt-icon):not(yt-icon-button):not([class*="icon"]):not([class*="Icon"]) {
                font-family: ${PROSE_FONT_STACK} !important;
            }

            /*
             * Vazirmatn's Persian glyph metrics read slightly larger/heavier than
             * YouTube's Roboto stack at the same title sizes. Limit the visual
             * correction to actual video title leaves and current search suggestion
             * rows; descriptions and page layout keep their native size/weight.
             */
            yt-formatted-string#video-title:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            a#video-title:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            a#video-title-link:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            ytd-watch-metadata h1 yt-formatted-string:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            ytd-playlist-panel-video-renderer span#video-title:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            yt-lockup-metadata-view-model h3 a.ytLockupMetadataViewModelTitle:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            yt-lockup-metadata-view-model h3 .ytAttributedStringHost:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}),
            yt-lockup-metadata-view-model h3 .yt-lockup-metadata-view-model-wiz__title:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}) {
                font-size: min(1em, 17.5px) !important;
                font-weight: 450 !important;
                font-synthesis-weight: none !important;
            }

            yt-lockup-metadata-view-model h3 a.ytLockupMetadataViewModelTitle:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}) > .ytAttributedStringHost:is(.${PROSE_CLASS}, .${PROSE_FONT_CLASS}) {
                font-size: 1em !important;
                font-weight: inherit !important;
            }

            /* Any code-ish run inside flipped prose stays LTR (defence-in-depth;
               descriptions rarely contain code, but a pasted snippet should not
               mirror). */
            .${PROSE_CLASS} :is(code, pre, [class*="code"], [class*="language-"]) {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }

            /*
             * Search suggestions are a special case: the query text lives in
             * input.value, and YouTube mounts the suggestion rows in the searchbox
             * chrome after the input event. The input listener is reliable, so it
             * marks only the active yt-searchbox host when the query itself is RTL;
             * this scoped rule then makes the dropdown text readable without
             * flipping the masthead/search layout or touching unrelated controls.
             */
            .${SEARCH_RTL_CLASS} :is(.ytSuggestionComponentText, .ytSuggestionComponentSuggestionText, .sbqs_c, ytd-search-suggestion #text) {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: ${PROSE_FONT_STACK} !important;
                font-size: 0.94em !important;
                font-weight: 400 !important;
                font-synthesis-weight: none !important;
            }

            /* ════════ More-button overlap fix (v1.1.25, bug #2) ════════════════
             * When the collapsed watch description flips to RTL the Persian text
             * starts on the RIGHT, exactly where YouTube anchors its inline
             * "...more"/«بیشتر» affordance (tp-yt-paper-button#expand, or a trailing
             * inline run), so the first glyphs sit under the button. Reserve
             * inline-start room on ONLY the flipped description CONTENT BLOCK so the
             * text start clears that gutter. padding-inline-start resolves to the
             * RIGHT edge because direction:rtl is the engine's inline style on the
             * same node. The rule is the INTERSECTION of the prose class (added only
             * to actually-Persian flipped nodes) AND the description-content anchors
             * that also appear in PROSE_SELECTORS, so the padded block is one the
             * engine actually flips (the live target may be the content clamp
             * wrapper OR the inner snippet leaf — both are covered). A non-RTL /
             * English description has no prose class, so the rule never applies; the
             * button position, YouTube's own truncation and the expand/collapse
             * handlers are untouched. No dir/direction/text-align is set here, and
             * nothing targets a bare button, a heading, or a page-level wrapper.
             * box-sizing keeps the reserve from widening the block past its column.
             * NOTE: 3.5em is the «بیشتر»/"...more" footprint estimate — confirm/tune
             * (3em–4.5em) with scripts/qa-youtube-prose-e2e.mjs on a live page. */
            ytd-text-inline-expander > #content.${PROSE_CLASS},
            #description-inline-expander #snippet.${PROSE_CLASS},
            #description-inline-expander #attributed-snippet-text.${PROSE_CLASS},
            #description-inline-expander #plain-snippet-text.${PROSE_CLASS} {
                padding-inline-start: 3.5em !important;
                box-sizing: border-box !important;
            }
        `
    };

    readCaptionSettings();
    subscribeToCaptionSettings();

    if (typeof window !== 'undefined' && typeof window.__YOUTUBE_RTL_TEST__ === 'function') {
        window.__YOUTUBE_RTL_TEST__({
            recipe,
            isCaptionWindow: isCaptionMessageElement,
            getCaptionSegments,
            updateCaptionSettings,
            captionSettings,
            settingsKeys: { fontSize: FONT_SIZE_KEY, color: COLOR_KEY },
            captionSizePresets: CAPTION_SIZE_PRESETS,
            captionFontPx,
            captionWindowSelectors: CAPTION_WINDOW_SELECTORS,
            captionSegmentSelector: CAPTION_SEGMENT_SELECTOR,
            // Prose section seams (v1.1.24): the dispatcher, the first-strong
            // direction test, the search-input handler, and the selector sets.
            processYouTube,
            needsProseRTL,
            applyFontOnlyProse,
            clearFontOnlyProse,
            runProseSweepNow,
            isSearchInput,
            applySearchInputDirection,
            clearSearchInputDirection,
            applySuggestionTextDirection,
            clearSuggestionTextDirection,
            applySearchSuggestionsDirection,
            attachSearchInput,
            detachSearchInput,
            proseClass: PROSE_CLASS,
            proseFontClass: PROSE_FONT_CLASS,
            proseSelectors: PROSE_SELECTORS,
            searchInputSelector: SEARCH_INPUT_SELECTOR,
            uiChromeGuardSelectors: UI_CHROME_GUARD_SELECTORS
        });
    }

    RastChinRecipe.runPlatformRecipe(recipe);
})();
