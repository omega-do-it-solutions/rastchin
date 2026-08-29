// scripts/claude-rtl.js
(() => {
    const FONT_URL = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('src/assets/fonts/Vazirmatn[wght].ttf')
        : '';
    const CONTENT_FONT_STACK = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';
    const TABLE_FONT_FAMILY = '"RastChinClaudeVazirmatn"';
    const TABLE_FONT_STACK = `${TABLE_FONT_FAMILY}, ${CONTENT_FONT_STACK}`;
    const MONO_FONT_STACK = '"Vazirmatn", ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

    // Narrow, Claude-specific message containers. The broad `[class*="Message"]`
    // and bare `article` selectors used to match large swaths of Claude's general
    // UI, which both wasted scan work and widened the surface for streaming-time
    // DOM races. `.font-claude-response` is the current assistant markdown
    // wrapper (claude.ai renamed it from `.font-claude-message`, which stays for
    // older builds/A-B cohorts); `[data-test-render-count]` is the whole-turn
    // wrapper — it also contains the message ACTION BAR, which is why UI_GUARD
    // below must keep chrome out of both the CSS and the walk. `[role="article"]`
    // stays as a controlled, narrow fallback.
    const ARTIFACT_SURFACE_SELECTORS = [
        '[data-testid*="artifact" i]',
        '[data-test-id*="artifact" i]',
        '[class*="artifact" i]',
        '[class*="Artifact" i]'
    ];

    // Claude renders artifacts and MCP "apps" (e.g. the live car-comparison
    // cards this fix targets) inside a DEDICATED cross-origin iframe — classic
    // artifacts on claudeusercontent.com, and MCP apps on claudemcpcontent.com
    // (live-verified 2026-06-18: <hash>.claudemcpcontent.com/mcp_apps, body >
    // div#vis-container > .car-grid > .car-card). That whole document is
    // generated content with NO .font-claude-* / [data-test-render-count] /
    // artifact-class wrapper, so the main-document MESSAGE_SELECTORS never match
    // inside it and the cards keep Claude's default LTR "Anthropic Sans" font.
    // When we are running INSIDE such a frame, the <body> itself IS the generated
    // surface: treat it as the message root so the walk reaches every card and
    // the font CSS covers the frame. Gated strictly on the artifact origins so
    // the main claude.ai app (shared chrome: sidebar, composer, action bars) is
    // never wholesale-flipped.
    const ARTIFACT_FRAME_HOSTS = ['claudeusercontent.com', 'claudemcpcontent.com'];
    const ARTIFACT_FRAME_SUFFIXES = ['.claudeusercontent.com', '.claudemcpcontent.com'];
    function isArtifactFrameHost(hostname) {
        const h = String(hostname || '').toLowerCase();
        return ARTIFACT_FRAME_HOSTS.includes(h)
            || ARTIFACT_FRAME_SUFFIXES.some(suffix => h.endsWith(suffix));
    }
    function currentHostname() {
        try {
            return (typeof window !== 'undefined' && window.__RASTCHIN_DESKTOP_HOST__)
                || (typeof window !== 'undefined' && window.location && window.location.hostname)
                || '';
        } catch (_) {
            return '';
        }
    }
    function hostnameOfOrigin(origin) {
        const match = String(origin || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i);
        return match ? match[1].toLowerCase() : '';
    }
    // The MCP-app content renders in a frame that boots as about:blank (empty
    // hostname) and only later resolves to <hash>.claudemcpcontent.com — so a
    // load-time hostname snapshot misses it. For a blank-host frame, fall back to
    // the ancestor origins: a blank frame nested under an artifact origin IS the
    // artifact surface. (Mirrors controller.js's blank-frame ancestor gate.)
    function hasArtifactAncestor() {
        try {
            const origins = Array.from((typeof window !== 'undefined' && window.location && window.location.ancestorOrigins) || []);
            if (origins.some(origin => isArtifactFrameHost(hostnameOfOrigin(origin)))) return true;
        } catch (_) {}
        try {
            const referrer = (typeof document !== 'undefined' && document.referrer) || '';
            if (referrer && isArtifactFrameHost(hostnameOfOrigin(referrer))) return true;
        } catch (_) {}
        return false;
    }
    function detectArtifactFrame() {
        const hostname = currentHostname();
        if (isArtifactFrameHost(hostname)) return true;
        if (!hostname) return hasArtifactAncestor();
        return false;
    }
    const IS_ARTIFACT_FRAME = detectArtifactFrame();
    const ARTIFACT_ROOT_SELECTOR = 'body';

    const MESSAGE_SELECTORS = IS_ARTIFACT_FRAME
        ? [
            // Standalone artifact / MCP-app document: the entire body is the
            // generated surface (see note above).
            ARTIFACT_ROOT_SELECTOR,
            ...ARTIFACT_SURFACE_SELECTORS,
            'table',
            '[role="table"]'
        ]
        : [
            '.font-claude-message',
            '.font-claude-response',
            '[data-test-render-count]',
            '[role="article"]',
            ...ARTIFACT_SURFACE_SELECTORS,
            // Table-root rescue for Claude DOM drift: if the response wrapper class
            // changes again, static markdown tables can still become candidates by
            // themselves. This is intentionally narrower than broad DIV/article
            // selectors and applyToMessage processes only the table root.
            'table',
            '[role="table"]'
        ];
    const GENERATED_TEXT_SURFACE_SELECTORS = MESSAGE_SELECTORS
        .filter(selector => selector !== 'table' && selector !== '[role="table"]');

    const CODE_GUARD_SELECTORS = [
        'code',
        '[class*="code"]',
        '[class*="Code"]',
        '[class*="language-"]',
        '.code-block',
        '[data-test-id="code-block"]',
        '[data-testid="code-block"]',
        '[role="code"]',
        '.cm-editor',
        '.monaco-editor'
    ];
    const CODE_GUARD = CODE_GUARD_SELECTORS.join(',');
    const CODE_CSS_SELECTOR = [
        ...CODE_GUARD_SELECTORS,
        'pre:has(code)'
    ].join(', ');

    // Claude draws the per-message action icons (Copy / Read aloud / feedback /
    // Retry) as PUA glyphs of an icon FONT (`Anthropicons-Variable`, inline
    // style on `span[data-cds="Icon"]`) — not as inline SVG. The action bar
    // lives inside `[data-test-render-count]` (the whole-turn wrapper above), so
    // an unguarded `font-family … !important` on every div/span in the turn
    // replaces the icon font; the glyph has no fallback in Vazirmatn and renders
    // as an invisible tofu box while the portaled tooltip keeps working.
    //
    // TWO guard tiers, on purpose:
    // - ICON guard (CSS :where(:not()) fence): ONLY the actual icon/glyph
    //   carriers + KaTeX (math keeps its metric fonts). Buttons/toolbars are NOT
    //   fenced here — Claude renders real Persian prose inside buttons (pasted-
    //   text file cards, artifact tiles, tool-use expanders) and that text must
    //   keep Vazirmatn exactly as it did before this fix.
    // - CHROME guard (walk skip + recipe.excludeSelectors → engine/BiDi): the
    //   full interactive surface. The walk never styled chrome (BUTTON was
    //   never a target/container) and BiDi must never restructure its text.
    // NOTE: `[aria-hidden="true"]` is deliberately in NEITHER list — Radix-style
    // dialogs mark the whole backgrounded app aria-hidden, which would flip
    // message fonts/processing on every modal open/close; icons stay safe via
    // the carrier nets (and bidi-isolate protects aria-hidden nodes themselves).
    const UI_ICON_GUARD_SELECTORS = [
        'svg',
        '[data-cds="Icon"]',
        '[style*="anthropicons" i]',
        '[class*="katex"]'
    ];
    const UI_CHROME_GUARD_SELECTORS = [
        'button',
        '[role="button"]',
        '[role="toolbar"]',
        '[role="menu"]',
        '[role="menubar"]',
        '[role="tablist"]',
        '[role="img"]',
        ...UI_ICON_GUARD_SELECTORS
    ];
    const UI_ICON_GUARD = UI_ICON_GUARD_SELECTORS.join(', ');
    const UI_CHROME_GUARD = UI_CHROME_GUARD_SELECTORS.join(', ');

    const MANAGED_CLASSES = [
        'rtl-processed',
        'rtl-modified',
        'rastchin-claude-rtl-table',
        'rastchin-claude-text-block',
        'rastchin-claude-card-text',
        'rastchin-claude-code-ltr'
    ];

    // Important change: remove DIV here to avoid forcing RTL on the entire container.
    // FIGCAPTION is a text-carrying block like BLOCKQUOTE — without it a Persian
    // caption inside a figure-wrapped table gets no dir at all.
    // Inline text leaves are included for Claude artifact/card layouts that
    // render Persian content directly inside spans instead of prose paragraphs.
    const TARGET_ELEMENTS = [
        'P',
        'LI',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'TD',
        'TH',
        'BLOCKQUOTE',
        'FIGCAPTION',
        'SPAN',
        'SMALL',
        'STRONG',
        'EM',
        'B',
        'I',
        'A'
    ];

    // claude.ai renders markdown tables as real <table> today (live-verified
    // 2026-06-12: 1× <table>, 0× ARIA tables on a fresh markdown table), but
    // static ARIA tables can appear on data surfaces — cover them defensively.
    // role="grid" is deliberately EXCLUDED: per ARIA it marks an INTERACTIVE
    // composite widget (focusable cells, selection, virtualization) whose own
    // JS assumes LTR geometry — force-flipping it wholesale breaks the widget.
    // None of these roles collide with UI_CHROME_GUARD_SELECTORS (exact-match
    // attribute parts), so the action bar stays fenced.
    const ARIA_TABLE_SELECTOR = '[role="table"]';
    const ARIA_CELL_SELECTOR = '[role="cell"], [role="columnheader"], [role="rowheader"]';
    const TABLE_CELL_SELECTOR = 'td, th, ' + ARIA_CELL_SELECTOR;
    const CONTAINER_ELEMENTS = new Set([
        'DIV',
        'SECTION',
        'ARTICLE',
        'MAIN',
        'ASIDE',
        'HEADER',
        'FOOTER',
        'FIGURE',
        'TABLE',
        'THEAD',
        'TBODY',
        'TFOOT',
        'TR',
        'TD',
        'TH',
        'BLOCKQUOTE'
    ]);

    const CODE_LIKE_TEXT_PATTERNS = [
        /^\s*(?:import|export|const|let|var|function|class|return|if|else|for|while|switch|try|catch|async|await|def|from|interface|type|enum|public|private|protected|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/im,
        /^\s*(?:\/\/|\/\*|\*\/|\*|#|--)\s+\S/im,
        /(?:=>|===|!==|&&|\|\||[{};]\s*$)/m,
        /<\/?[A-Za-z][\w:-]*(?:\s|>|\/>)/m,
        /^\s*["'][\w-]+["']\s*:/m
    ];

    let elementDirections = new WeakMap();
    // Containers whose OWN text this walk has isolated — lets the container
    // path clear wrappers exactly once on a true rtl→ltr transition instead
    // of recursively stripping nested blocks' wrappers on every walk.
    let containerIsolation = new WeakSet();

    // Persian/Arabic-Indic numbered markers («۱.», «۲)», «۳-») are DIGITS, not
    // letters, so hasRtlLetter() alone leaves a line like «۱. Speisly» LTR even
    // though a Persian reader wrote it as a Persian list line. Claude-LOCAL
    // heuristic, deliberately narrow: ANY line of the block may carry a marker
    // (Claude often renders such lists as a single <p> with <br> separators),
    // and the post-marker text must still contain at least one real LETTER
    // after URLs/emails/inline-code/paths are stripped — so a bare «۱۲۳», a
    // URL-only or email-only line never flips.
    // Horizontal whitespace ONLY ([ \t]) so a digit-only line never binds to
    // the next line across \n; dash markers are limited to 1-2 digit ordinals
    // and every variant rejects a following eastern OR latin digit — year ranges
    // («۱۳۹۵ – …»), scorelines («۳ - ۲»/«۳ - 2») and numeric ranges stay LTR.
    const EASTERN_NUMBERED_MARKER = /^[ \t]*(?:[۰-۹٠-٩]{1,4}[ \t]*[.)]|[۰-۹٠-٩]{1,2}[ \t]*[-–])[ \t]+(?![ \t]*[0-9۰-۹٠-٩])/;

    function easternNumberedMarkerForcesRtl(text, engine) {
        if (looksLikeCodeText(text)) return false;
        const strip = typeof engine?.stripLtrTokens === 'function'
            ? value => engine.stripLtrTokens(value)
            : value => value;
        return String(text || '').split(/\r?\n/).some(line => {
            const match = line.match(EASTERN_NUMBERED_MARKER);
            if (!match) return false;
            const remainder = line.slice(match[0].length);
            const meaningful = strip(remainder).trim();
            if (!meaningful || !/\p{L}/u.test(meaningful)) return false;
            return !looksLikeCodeText(meaningful);
        });
    }

    function getDirection(text, engine) {
        if (engine.hasRtlLetter(text)) return 'rtl';
        if (easternNumberedMarkerForcesRtl(text, engine)) return 'rtl';
        return 'ltr';
    }

    function setStyle(el, prop, value) {
        el.style.setProperty(prop, value, 'important');
    }

    function hasElementMatch(root, selector) {
        if (!root || !selector) return false;
        if (root.matches?.(selector)) return true;
        return Boolean(root.querySelector?.(selector));
    }

    function textOf(element, engine) {
        return engine.collectDirectionText(element);
    }

    function looksLikeCodeText(text) {
        const normalized = (text || '').trim();
        if (!normalized) return false;
        return CODE_LIKE_TEXT_PATTERNS.some(pattern => pattern.test(normalized));
    }

    function isHardCodeElement(element, engine) {
        if (!element || !(element instanceof HTMLElement)) return false;
        if (element.matches?.(CODE_GUARD) || element.closest?.(CODE_GUARD)) return true;

        const pre = element.tagName === 'PRE' ? element : element.closest?.('pre');
        if (!pre) return false;
        if (hasElementMatch(pre, CODE_GUARD)) return true;
        return looksLikeCodeText(textOf(pre, engine));
    }

    function isPlainTextBlock(element, engine) {
        if (!element || element.tagName !== 'PRE') return false;
        if (isHardCodeElement(element, engine)) return false;
        return true;
    }

    function resetManagedStyles(element) {
        element.removeAttribute('dir');
        element.style.removeProperty('direction');
        element.style.removeProperty('text-align');
        element.style.removeProperty('padding-right');
        element.style.removeProperty('padding-left');
        element.style.removeProperty('unicode-bidi');
        MANAGED_CLASSES.forEach(className => element.classList.remove(className));
    }

    function applyManagedDirection(element, dir, options = {}) {
        const classes = [
            ...(dir === 'rtl' && options.text ? ['rtl-processed'] : []),
            ...(dir === 'rtl' ? ['rtl-modified'] : []),
            ...(options.table ? ['rastchin-claude-rtl-table'] : []),
            ...(options.textBlock ? ['rastchin-claude-text-block'] : []),
            ...(options.cardText ? ['rastchin-claude-card-text'] : []),
            ...(options.code ? ['rastchin-claude-code-ltr'] : [])
        ];
        // unicodeBidi participates in the key: a streamed block can transition
        // between marker-forced (isolate) and letter-driven (plaintext) RTL,
        // and the stale style must not survive that transition.
        const key = `${dir}:${classes.join('|')}:${options.list ? 'list' : ''}:${options.force ? 'force' : ''}:${options.unicodeBidi || ''}`;
        if (elementDirections.get(element) === key) return;

        if (elementDirections.has(element) || MANAGED_CLASSES.some(className => element.classList.contains(className))) {
            resetManagedStyles(element);
        }

        if (dir === 'rtl') {
            element.setAttribute('dir', 'rtl');
            setStyle(element, 'direction', 'rtl');
            setStyle(element, 'text-align', 'right');
            setStyle(element, 'unicode-bidi', options.unicodeBidi || 'plaintext');
            classes.forEach(className => element.classList.add(className));
            if (options.list) {
                setStyle(element, 'padding-right', '2rem');
                setStyle(element, 'padding-left', '0');
            }
        } else if (options.force) {
            element.setAttribute('dir', 'ltr');
            setStyle(element, 'direction', 'ltr');
            setStyle(element, 'text-align', 'left');
            setStyle(element, 'unicode-bidi', 'isolate');
            classes.forEach(className => element.classList.add(className));
        }

        elementDirections.set(element, key);
    }

    function processTextElement(element, engine) {
        const text = textOf(element, engine);
        const trimmed = text.trim();
        const hasRtlLetters = trimmed ? engine.hasRtlLetter(text) : false;
        // Marker-forced blocks («۱. Speisly») carry NO strong RTL character, so
        // unicode-bidi:plaintext would derive an LTR paragraph from the first
        // strong (Latin) letter and defeat dir=rtl — browser-measured: the
        // marker lands LEFT of the word. 'isolate' honors dir=rtl and puts the
        // marker on the right, where a Persian list reader expects it.
        const markerForced = !hasRtlLetters && trimmed
            ? easternNumberedMarkerForcesRtl(text, engine)
            : false;
        const dir = hasRtlLetters || markerForced ? 'rtl' : 'ltr';
        // Base layer: dir + unicode-bidi:plaintext (set in applyManagedDirection)
        // gives the block its direction without mutating text nodes. On top of that,
        // engine.isolateInline wraps the Latin runs *inside* the line in <bdi> so
        // neutral punctuation/brackets (POS / کاسه, Kaffeehaus (…)) read correctly.
        // The historical "removeChild"/"insertBefore" crash came from restructuring
        // text mid-stream; isolateInline is gated by the recipe's streamingSelector
        // ([data-is-streaming="true"]) so the live, React-owned turn is left alone
        // and only settled, committed turns are wrapped.
        applyManagedDirection(element, dir, {
            text: true,
            unicodeBidi: markerForced ? 'isolate' : undefined
        });
        if (engine && typeof engine.isolateInline === 'function') {
            if (dir === 'rtl') engine.isolateInline(element);
            else engine.clearInline(element);
        }
        return dir;
    }

    function processTextBlock(element, engine) {
        const text = textOf(element, engine);
        const trimmed = text.trim();
        const hasRtlLetters = trimmed ? engine.hasRtlLetter(text) : false;
        const markerForced = !hasRtlLetters && trimmed
            ? easternNumberedMarkerForcesRtl(text, engine)
            : false;
        const dir = hasRtlLetters || markerForced ? 'rtl' : 'ltr';
        applyManagedDirection(element, dir, {
            text: true,
            textBlock: dir === 'rtl',
            force: dir === 'ltr',
            // inline !important beats the class rule's plaintext !important,
            // so marker-forced <pre> blocks render the marker on the right too
            unicodeBidi: markerForced ? 'isolate' : undefined
        });
        return dir;
    }

    // Cell-vote eligibility strips only token-level LTR noise (URLs, emails,
    // inline code) before the letter check. Deliberately NOT
    // engine.stripLtrTokens: its line-level structural strips (terminal-line
    // and table-line heuristics) were tuned for whole messages and silently
    // erase short cells like lowercase tool names («git», «docker») — a Latin
    // label must keep its LTR vote. Symbol/digit/token-only cells (✓, ×, €9,
    // ۱۲۳, bare URLs/emails) carry no reading direction and never vote, or a
    // Persian comparison table full of checkmarks tips LTR (browser-measured
    // Menew repro, 2026-06-12).
    const CELL_VOTE_STRIP_PATTERNS = [
        /https?:\/\/\S+|www\.\S+/gi,
        /[\w.+-]+@[\w.-]+\.\w+/g,
        /`[^`]*`/g
    ];
    function cellHasLetterVote(cell, engine) {
        const raw = textOf(cell, engine);
        if (!raw || !raw.trim()) return false;
        const meaningful = CELL_VOTE_STRIP_PATTERNS.reduce(
            (value, pattern) => value.replace(pattern, ' '), raw);
        return /\p{L}/u.test(meaningful);
    }

    // Label cells anchor how a reader PARSES the table, in two distinct
    // groups: the header row (th/columnheader/rowheader) and the first cell
    // of each row (markdown's label column; a full-width section row is its
    // row's only — and so first — cell).
    function tableLabelKind(cell) {
        if (!cell) return null;
        if (cell.tagName === 'TH') return 'header';
        const role = typeof cell.getAttribute === 'function' ? cell.getAttribute('role') : null;
        if (role === 'columnheader' || role === 'rowheader') return 'header';
        const row = cell.parentElement;
        if (!row || !row.children) return null;
        try {
            const rowCells = Array.from(row.children).filter(
                node => node && typeof node.matches === 'function' && node.matches(TABLE_CELL_SELECTOR));
            return rowCells.length > 0 && rowCells[0] === cell ? 'first' : null;
        } catch (_) {
            return null;
        }
    }

    // Cells of a table nested INSIDE a cell must vote only in their own
    // table — the label weighting would let a small inner header row decide
    // a large outer table. The inner table still gets its own processTable
    // pass through the cell-children recursion.
    function isOwnTableCell(table, cell) {
        if (!cell || typeof cell.closest !== 'function') return true;
        try {
            const owner = cell.closest('table, ' + ARIA_TABLE_SELECTOR);
            return !owner || owner === table;
        } catch (_) {
            return true;
        }
    }

    function processTable(element, engine) {
        const cells = Array.from(element.querySelectorAll(TABLE_CELL_SELECTOR))
            .filter(cell => !isInsideUiChrome(cell))
            .filter(cell => isOwnTableCell(element, cell));
        let rtlCount = 0;
        let ltrCount = 0;
        let headerRtl = 0;
        let headerLtr = 0;
        let firstColRtl = 0;
        let firstColLtr = 0;

        cells.forEach(cell => {
            const dir = processTextElement(cell, engine);
            Array.from(cell.children).forEach(child => processElement(child, engine));
            if (!cellHasLetterVote(cell, engine)) return;
            dir === 'rtl' ? rtlCount++ : ltrCount++;
            const kind = tableLabelKind(cell);
            if (kind === 'header') {
                dir === 'rtl' ? headerRtl++ : headerLtr++;
            } else if (kind === 'first') {
                dir === 'rtl' ? firstColRtl++ : firstColLtr++;
            }
        });

        const fallbackDir = getDirection(textOf(element, engine), engine);
        // The label groups vote SEPARATELY: a table reads as Persian when
        // EITHER group is Persian-weighted — Persian headers over Latin
        // entity names (glossaries, transposed tool comparisons) or a Persian
        // label column under Latin headers (the Menew shape). Pooling the two
        // groups let a Latin first column outvote Persian headers and flip
        // glossary tables LTR (audit-confirmed regression vs the flat vote).
        // Header ties lean RTL (bilingual «ویژگی | Feature» headers are a
        // Persian-author signal); the first-column group needs a strict
        // majority so one Persian name among Latin rows cannot flip an
        // English table. With no Persian-weighted label group, the letter-
        // bearing flat majority decides; symbol-only tables keep the
        // whole-text fallback.
        const headerVotes = headerRtl + headerLtr;
        const firstColVotes = firstColRtl + firstColLtr;
        const labelsSayRtl =
            (headerVotes > 0 && headerRtl >= headerLtr) ||
            (firstColVotes > 0 && firstColRtl > firstColLtr);
        const finalDir = labelsSayRtl
            ? 'rtl'
            : (rtlCount || ltrCount
                ? (rtlCount >= ltrCount ? 'rtl' : 'ltr')
                : fallbackDir);

        applyManagedDirection(element, finalDir, {
            table: finalDir === 'rtl'
        });

        return finalDir;
    }

    function isAriaTableElement(element) {
        if (!element || typeof element.matches !== 'function') return false;
        try {
            return element.matches(ARIA_TABLE_SELECTOR);
        } catch (_) {
            return false;
        }
    }

    function isTableElement(element) {
        return Boolean(element && (element.tagName === 'TABLE' || isAriaTableElement(element)));
    }

    function isUiChromeElement(element) {
        if (!element || typeof element.matches !== 'function') return false;
        try {
            return element.matches(UI_CHROME_GUARD);
        } catch (_) {
            return false;
        }
    }

    // querySelectorAll jumps over intermediate nodes, so list/table loops need
    // an ancestry check too (the recursive walk prunes at the boundary instead).
    function isInsideUiChrome(element) {
        if (!element || typeof element.closest !== 'function') return false;
        try {
            return Boolean(element.closest(UI_CHROME_GUARD));
        } catch (_) {
            return false;
        }
    }

    function isGeneratedTextContext(element) {
        // Inside a dedicated artifact/MCP-app frame the whole document is
        // generated content, so every Persian container is card text.
        if (IS_ARTIFACT_FRAME) return true;
        if (!element || typeof element.closest !== 'function') return false;
        return GENERATED_TEXT_SURFACE_SELECTORS.some(selector => {
            try {
                return Boolean(element.closest(selector));
            } catch (_) {
                return false;
            }
        });
    }

    function isArtifactSurfaceContext(element) {
        // The whole artifact/MCP-app frame is an artifact surface, so its real
        // content buttons (e.g. the Persian "بیشتر بپرس ↗" card CTAs) qualify as
        // generated content buttons even without an artifact-class ancestor.
        if (IS_ARTIFACT_FRAME) return true;
        if (!element || typeof element.closest !== 'function') return false;
        return ARTIFACT_SURFACE_SELECTORS.some(selector => {
            try {
                return Boolean(element.closest(selector));
            } catch (_) {
                return false;
            }
        });
    }

    function isButtonLikeElement(element) {
        if (!element || typeof element.matches !== 'function') return false;
        try {
            return element.matches('button, [role="button"]');
        } catch (_) {
            return false;
        }
    }

    function isGeneratedContentButton(element, engine) {
        if (!isButtonLikeElement(element) || !isArtifactSurfaceContext(element)) return false;
        const text = textOf(element, engine).trim();
        return Boolean(text && getDirection(text, engine) === 'rtl');
    }

    function processElement(element, engine) {
        if (!element || !element.tagName || !(element instanceof HTMLElement)) return;

        // 0. Toolbar/button/icon chrome: never style it, never recurse into it.
        // Exception: Claude artifacts can render real content cards/tiles as
        // buttons. Only those artifact-scoped Persian content buttons are
        // traversed; normal message action bars stay fenced.
        const generatedContentButton = isGeneratedContentButton(element, engine);
        if (isUiChromeElement(element) && !generatedContentButton) return;

        // 1. Hard code snippets stay LTR. Plain Persian <pre> text blocks are handled below.
        if (isHardCodeElement(element, engine)) {
            applyManagedDirection(element, 'ltr', { force: true, code: true });
            return;
        }

        if (isPlainTextBlock(element, engine)) {
            processTextBlock(element, engine);
            return;
        }

        // 2. Lists
        if (element.tagName === 'UL' || element.tagName === 'OL') {
            let rtlCount = 0, ltrCount = 0;
            element.querySelectorAll('li').forEach(li => {
                if (isInsideUiChrome(li)) return;
                const dir = getDirection(engine.collectDirectionText(li), engine);
                dir === 'rtl' ? rtlCount++ : ltrCount++;
                processElement(li, engine);
            });

            const finalDir = rtlCount > ltrCount ? 'rtl' : 'ltr';
            applyManagedDirection(element, finalDir, { list: finalDir === 'rtl' });
            return;
        }

        // 3. Tables need explicit traversal because Claude renders cells under
        // table sections/rows. Static ARIA tables (div[role="table"]) take the
        // same path; role="grid" stays excluded because it is interactive. The
        // early return keeps the container recursion below from re-walking the
        // same subtree.
        if (isTableElement(element)) {
            processTable(element, engine);
            return;
        }

        if (generatedContentButton) {
            processContainerOwnText(element, engine);
            Array.from(element.children).forEach(child => processElement(child, engine));
            return;
        }

        // 4. Text elements
        const isTextTarget = TARGET_ELEMENTS.includes(element.tagName);
        if (isTextTarget) {
            processTextElement(element, engine);
        }

        // 5. Recurse into containers (enter DIV here but do not style the DIV itself).
        if (CONTAINER_ELEMENTS.has(element.tagName)) {
            if (!isTextTarget) processContainerOwnText(element, engine);
            Array.from(element.children).forEach(child => processElement(child, engine));
        }
    }

    // Containers that CARRY their own text — claude can render a cell/card as
    // td > div > «باشگاه مشتریان / CRM» or artifact cards as div/span-only
    // layouts — sit past a paragraph-only walk's reach. Hand the container
    // ITSELF to the BiDi layer, and when it is inside a generated Claude content
    // surface give it a managed text class too so native card styles cannot keep
    // Persian prose in the default Claude font/direction. Whitespace-only
    // layout wrappers remain untouched.
    //
    // Direction comes from the container's OWN inline text only: the subtree
    // text would let a nested block's content (or code-looking direct text
    // swallowed by the message-level strip heuristics) reclassify the
    // container. And clearInline fires ONLY on a true rtl→ltr transition of a
    // container this walk previously isolated: clearIsolation strips wrappers
    // RECURSIVELY, so an unconditional per-walk call would tear out nested
    // paragraphs' <bdi>s and feed an observer rescan loop (audit finding).
    // Whitespace-only layout wrappers trigger nothing at all.
    function processContainerOwnText(element, engine) {
        if (!engine || typeof engine.isolateInline !== 'function') return;
        let ownText = '';
        for (const node of element.childNodes || []) {
            if (node && node.nodeType === 3) ownText += String(node.textContent || '');
        }
        if (!ownText.trim()) return;
        const dir = getDirection(ownText, engine);
        if (dir === 'rtl') {
            containerIsolation.add(element);
            if (isGeneratedTextContext(element)) {
                applyManagedDirection(element, 'rtl', {
                    text: true,
                    cardText: true
                });
            }
            engine.isolateInline(element);
        } else if (containerIsolation.has(element)) {
            containerIsolation.delete(element);
            if (elementDirections.has(element)) resetManagedStyles(element);
            if (typeof engine.clearInline === 'function') engine.clearInline(element);
        }
    }

    function cleanUpStyles() {
        const modified = document.querySelectorAll(`.${MANAGED_CLASSES.join(', .')}`);
        modified.forEach(el => {
            resetManagedStyles(el);
        });
    }

    const recipe = {
        version: 1,
        hosts: ['claude.ai', 'claudeusercontent.com', 'claudemcpcontent.com', ''],
        hostSuffixes: ['.claudeusercontent.com', '.claudemcpcontent.com'],
        storageKey: 'claudeEnabled',
        // Inline <bdi> isolation, applied only to settled turns: Claude flags the
        // live streaming message with data-is-streaming="true", which we skip so we
        // never restructure React-owned text mid-render (the v1.1.15 crash class).
        inlineIsolate: true,
        streamingSelector: '[data-is-streaming="true"]',
        messageSelectors: MESSAGE_SELECTORS,
        // Feeds RTLEngine.isExcluded AND the BiDi protectedSelector, so the
        // engine-level traversal honors the same chrome fence as the walk.
        excludeSelectors: UI_CHROME_GUARD_SELECTORS,
        textSelectors: [],
        isCodeLike: el => el instanceof HTMLElement && isHardCodeElement(el, {
            collectDirectionText: node => node.innerText || node.textContent || ''
        }),
        applyToMessage: (container, engine) => {
            if (!container) return true;
            if (isTableElement(container)) {
                processElement(container, engine);
                return true;
            }
            Array.from(container.children).forEach(child => {
                processElement(child, engine);
            });
            return true;
        },
        onEnable: () => {
            elementDirections = new WeakMap();
            containerIsolation = new WeakSet();
        },
        onDisable: () => {
            cleanUpStyles();
            elementDirections = new WeakMap();
            containerIsolation = new WeakSet();
        },
        globalCss: (_codeGuard, ctx = {}) => {
            const messageScope = `:is(${(ctx.messageSelectors || MESSAGE_SELECTORS).join(', ')})`;
            const tableFontFace = FONT_URL ? `
            @font-face {
                font-family: ${TABLE_FONT_FAMILY};
                src: url(${JSON.stringify(FONT_URL)}) format("woff2");
                font-weight: 100 900;
                font-style: normal;
                font-display: swap;
            }
            ` : '';
            return `
            ${tableFontFace}

            ${CODE_CSS_SELECTOR} {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate;
            }

            /* Prose only: the :where(:not()) fence keeps icon-font glyphs
               (Claude's Anthropicons action icons) and KaTeX math out — the
               carrier element itself and everything inside it. :where() zeroes
               the fence's specificity so this rule keeps losing to the more
               specific mono rule below for code-classed elements, exactly as it
               did before the fence existed. Buttons are NOT fenced here: Claude
               puts real Persian prose inside buttons (file cards, artifact
               tiles) and that text must keep Vazirmatn. The bare turn-wrapper
               selector stays unguarded on purpose: it only INHERITS the stack
               downward, and inheritance never beats the icon span's own inline
               font-family. */
            ${messageScope},
            ${messageScope} :is(p, li, blockquote, h1, h2, h3, h4, h5, h6, div, span, strong, em, b, i, a, small, button, table, thead, tbody, tfoot, tr, th, td):where(:not(:is(${UI_ICON_GUARD})):not(:is(${UI_ICON_GUARD}) *)) {
                font-family: ${CONTENT_FONT_STACK} !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                font-kerning: normal !important;
            }

            .rastchin-claude-code-ltr {
                font-family: ${MONO_FONT_STACK} !important;
            }

            ${messageScope} :is(${CODE_CSS_SELECTOR}) {
                font-family: ${MONO_FONT_STACK} !important;
            }

            /* Managed tables are font-self-sufficient. The global Vazirmatn
               @font-face is Persian-range only, so tables get a Claude-local
               full-range alias and a descendant rule that reaches td > div/span
               wrappers without touching icon-font carriers. */
            .rtl-processed,
            .rtl-modified {
                font-family: ${CONTENT_FONT_STACK} !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                font-kerning: normal !important;
            }

            .rastchin-claude-rtl-table,
            .rastchin-claude-rtl-table :where(:not(:is(${UI_ICON_GUARD})):not(:is(${UI_ICON_GUARD}) *)),
            .rastchin-claude-rtl-table :is(thead, tbody, tfoot, tr, th, td),
            .rastchin-claude-rtl-table :is([role="row"], [role="rowgroup"], [role="cell"], [role="columnheader"], [role="rowheader"]) {
                font-family: ${TABLE_FONT_STACK} !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                font-kerning: normal !important;
            }

            .rastchin-claude-text-block {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: ${MONO_FONT_STACK} !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                font-kerning: normal !important;
                white-space: pre-wrap !important;
            }

            .rastchin-claude-card-text,
            .rastchin-claude-card-text :where(:not(:is(${UI_ICON_GUARD})):not(:is(${UI_ICON_GUARD}) *)) {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
                font-family: ${CONTENT_FONT_STACK} !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                font-kerning: normal !important;
            }

            table.rastchin-claude-rtl-table,
            table.rastchin-claude-rtl-table :is(thead, tbody, tfoot, tr, th, td),
            .rastchin-claude-rtl-table[role="table"],
            .rastchin-claude-rtl-table[role="table"] :is([role="row"], [role="rowgroup"], [role="cell"], [role="columnheader"], [role="rowheader"]) {
                direction: rtl !important;
                text-align: right !important;
            }

            [dir="rtl"] :is(code, [class*="code"], [class*="Code"], [class*="language-"]) {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }
        `;
        }
    };

    if (typeof window !== 'undefined' && typeof window.__CLAUDE_RTL_TEST__ === 'function') {
        window.__CLAUDE_RTL_TEST__({
            recipe,
            processElement,
            isHardCodeElement,
            isPlainTextBlock,
            looksLikeCodeText,
            isUiChromeElement,
            isArtifactFrameHost,
            isArtifactFrame: IS_ARTIFACT_FRAME,
            codeGuardSelectors: CODE_GUARD_SELECTORS,
            uiIconGuardSelectors: UI_ICON_GUARD_SELECTORS,
            uiChromeGuardSelectors: UI_CHROME_GUARD_SELECTORS
        });
    }

    // Artifact / MCP-app frames are React-mounted from async esm.sh modules and
    // REBUILD their own document AFTER our content script's one-shot enable: the
    // recipe stylesheet recipe-runner injected gets wiped (and its `globalStyle`
    // guard never re-adds it), and the settled cards arrive with no further
    // mutation to re-trigger the walk — so the frame ends up unstyled even though
    // the script injected and enabled (live-verified 2026-06-18 on
    // claudemcpcontent.com). Self-heal: keep our OWN resilient <style> alive and
    // re-run the engine walk on a few timed kicks plus a debounced observer, so we
    // win the final render. Strictly gated on IS_ARTIFACT_FRAME — the main
    // claude.ai app never enters this path.
    const ARTIFACT_STYLE_ID = 'rastchin-artifact-style';
    function setupArtifactFrameHealing(handle) {
        if (!IS_ARTIFACT_FRAME || !handle || !handle.engine) return;
        let cssText = '';
        try { cssText = recipe.globalCss(); } catch (_) { return; }

        // Re-resolve the style element from the LIVE document every time: the app
        // can discard the whole <head> (or documentElement) on mount, so a held
        // reference goes stale. getElementById against the current document plus a
        // re-append is self-healing across those rebuilds.
        function ensureStyle() {
            const root = document.head || document.documentElement;
            if (!root) return;
            if (!document.getElementById(ARTIFACT_STYLE_ID)) {
                const style = document.createElement('style');
                style.id = ARTIFACT_STYLE_ID;
                style.textContent = cssText;
                root.appendChild(style);
            }
        }

        function boost() {
            ensureStyle();
            const body = document.body || document.documentElement;
            if (body && typeof handle.engine.scheduleScan === 'function') {
                handle.engine.scheduleScan(body);
            }
        }

        // Observe the DOCUMENT node itself — it is never replaced, so this survives
        // the app swapping out documentElement/head/body (which orphans the engine's
        // own body-anchored observer). Debounced; the style re-assert and the walk
        // are both idempotent, so the self-triggered mutation settles in one pass.
        try {
            let pending = null;
            const observer = new MutationObserver(() => {
                if (pending) return;
                pending = setTimeout(() => { pending = null; boost(); }, 120);
            });
            observer.observe(document, { childList: true, subtree: true });
        } catch (_) {}

        // The MCP app mounts lazily when the frame becomes visible; re-assert then.
        try { document.addEventListener('visibilitychange', boost, true); } catch (_) {}

        // Initial kicks cover the already-visible case and the first async renders.
        [0, 150, 400, 800, 1500, 3000].forEach(ms => setTimeout(boost, ms));

        // Bounded low-rate backstop: the app can wipe our style/walk shortly after
        // its first paint, and a rebuild may emit no mutation the observer can see.
        // A few seconds of 1 Hz re-assertion wins that race, then stops. Both the
        // style re-add and the walk are idempotent, so this is cheap and quiet.
        let ticks = 0;
        const backstop = setInterval(() => { boost(); if (++ticks >= 12) clearInterval(backstop); }, 1000);
    }

    function init() {
        const handle = RastChinRecipe.runPlatformRecipe(recipe);
        setupArtifactFrameHealing(handle);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
