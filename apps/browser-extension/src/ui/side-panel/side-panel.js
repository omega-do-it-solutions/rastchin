// src/ui/side-panel/side-panel.js
// Tabbed side-panel UI (اصلی / تنظیمات / تازه‌ها). Reuses the same
// chrome.storage.sync state model as the popup and content scripts. There is no
// page-content messaging or telemetry; the only runtime message asks the active
// supported tab's already-injected content script which platform key it owns.
// Subscribing to storage.onChanged keeps the panel live-consistent with every
// other surface and with content scripts.
//
// PERMISSION NOTE: the side panel must reliably identify the active site even
// after an extension reload, when existing page content scripts are orphaned and
// cannot answer runtime messages. The manifest declares tabs permission so
// chrome.tabs.query can expose the active tab URL and the panel can resolve all
// supported platforms through the shared registry before falling back to global
// extensionEnabled semantics.
'use strict';

(() => {
    const storage = chrome.storage.sync;
    const EXTENSION_KEY = 'extensionEnabled';
    // Official site for feedback/support forms. The in-panel feedback composer was
    // removed in v1.1.34; a small footer link opens this in a new tab instead.
    const WEBSITE_URL = 'https://rastchin.tools/feedback/?source=extension';

    // YouTube caption settings live IN-PANEL (v1.1.34) — no separate options page
    // trip. Same storage keys + crop-safe preset band as the runtime
    // (src/platforms/youtube-rtl.js), so UI and runtime stay in lockstep.
    const CAPTION_FONT_KEY = 'youtubeCaptionFontSize';
    const CAPTION_COLOR_KEY = 'youtubeCaptionColor';
    const CAPTION_SIZE_PRESETS = { small: 100, medium: 120 };
    const CAPTION_DEFAULT_SIZE = CAPTION_SIZE_PRESETS.medium;
    const CAPTION_DEFAULT_COLOR = '#ffd400';
    const CAPTION_PREVIEW_BASE_PX = 15; // mirrors the runtime CAPTION_BASE_PX
    const CAPTION_SIZE_BUTTONS = [
        { id: 'capSizeSmall', size: CAPTION_SIZE_PRESETS.small },
        { id: 'capSizeMedium', size: CAPTION_SIZE_PRESETS.medium }
    ];
    const CAPTION_COLOR_BUTTONS = [
        { id: 'capColorYellow', color: '#ffd400' },
        { id: 'capColorWhite', color: '#ffffff' }
    ];

    const PLATFORMS = Array.isArray(window.RASTCHIN_PLATFORMS) ? window.RASTCHIN_PLATFORMS : [];
    const CATEGORIES = Array.isArray(window.RASTCHIN_PLATFORM_CATEGORIES) ? window.RASTCHIN_PLATFORM_CATEGORIES : [];
    const CHANGELOG = Array.isArray(window.RASTCHIN_CHANGELOG) ? window.RASTCHIN_CHANGELOG : [];
    const PLATFORM_KEYS = PLATFORMS.map(platform => platform.storageKey);

    const TAB_IDS = ['main', 'settings', 'whats-new'];

    const state = {
        platform: null,        // matched registry entry for the active tab, or null
        hostname: '',          // active tab http(s) hostname when readable
        values: {},            // chrome.storage.sync snapshot (extension + platform keys)
        loaded: false,         // true once the storage snapshot resolved — gates first paint
        detected: false        // true once detection RESOLVED — until then the site
                               // card stays on «در حال بررسی…» and the toggle is
                               // disabled, so a click can never write the global
                               // extensionEnabled key on a not-yet-identified site
    };
    // YouTube caption settings, normalized for the in-panel controls. Kept apart
    // from state.values (the platform-toggle snapshot) so the two never tangle.
    const captionState = { size: CAPTION_DEFAULT_SIZE, color: CAPTION_DEFAULT_COLOR };
    let activeTabRequestSeq = 0;
    // The side panel is PER-WINDOW; queries and tab events are scoped to this
    // window once it resolves (null = unknown → lastFocusedWindow fallback).
    let panelWindowId = null;

    const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
    function toFa(value) {
        return String(value).replace(/[0-9]/g, digit => PERSIAN_DIGITS[Number(digit)]);
    }

    function normalizeEnabled(value) {
        return value === undefined ? true : Boolean(value);
    }

    function platformFromStorageKey(storageKey) {
        return PLATFORMS.find(platform => platform.storageKey === storageKey) || null;
    }

    function hostnameFromUrl(urlString) {
        try {
            const parsed = urlString ? new URL(urlString) : null;
            return parsed && /^https?:$/.test(parsed.protocol) ? parsed.hostname : '';
        } catch (_) {
            return '';
        }
    }

    function applyActiveTabFallback(tab) {
        const matcher = window.rastchinMatchPlatformFromUrl;
        state.platform = typeof matcher === 'function' ? matcher(tab?.url) : null;
        state.hostname = hostnameFromUrl(tab?.url);
        state.detected = true;
        renderMain();
    }

    function activeTabFallbackCanResolve(tab) {
        const matcher = window.rastchinMatchPlatformFromUrl;
        return Boolean(
            hostnameFromUrl(tab?.url) ||
            (typeof matcher === 'function' && matcher(tab?.url))
        );
    }

    function beginActiveTabDetection() {
        state.platform = null;
        state.hostname = '';
        state.detected = false;
        renderMain();
    }

    function applyPlatformInfo(response, fallbackTab) {
        const platform = response?.type === 'rastchin:platform-info'
            ? platformFromStorageKey(response.storageKey)
            : null;
        if (!platform) {
            applyActiveTabFallback(fallbackTab);
            return;
        }
        state.platform = platform;
        state.hostname = typeof response.hostname === 'string' && response.hostname
            ? response.hostname.toLowerCase()
            : hostnameFromUrl(fallbackTab?.url);
        state.detected = true;
        renderMain();
    }

    function getManifestVersion() {
        try {
            return chrome?.runtime?.getManifest?.().version || '';
        } catch (_) {
            return '';
        }
    }

    // ----- tabs ---------------------------------------------------------------
    function selectTab(tabId) {
        TAB_IDS.forEach(id => {
            const tab = document.getElementById(`tab-${id}`);
            const view = document.getElementById(`view-${id}`);
            const selected = id === tabId;
            if (tab) {
                tab.setAttribute('aria-selected', String(selected));
                tab.setAttribute('tabindex', selected ? '0' : '-1');
            }
            if (view) {
                if (selected) view.removeAttribute('hidden');
                else view.setAttribute('hidden', '');
            }
        });
    }

    function wireTabs() {
        TAB_IDS.forEach((id, index) => {
            const tab = document.getElementById(`tab-${id}`);
            if (!tab) return;
            tab.addEventListener('click', () => selectTab(id));
            tab.addEventListener('keydown', event => {
                // RTL tab strip: ArrowLeft advances, ArrowRight goes back.
                let nextIndex = null;
                if (event.key === 'ArrowLeft') nextIndex = (index + 1) % TAB_IDS.length;
                if (event.key === 'ArrowRight') nextIndex = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = TAB_IDS.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                const nextTab = document.getElementById(`tab-${TAB_IDS[nextIndex]}`);
                selectTab(TAB_IDS[nextIndex]);
                nextTab?.focus();
            });
        });
    }

    // ----- main tab: current-site state ----------------------------------------
    function isPlatformEnabled(platform) {
        return platform ? normalizeEnabled(state.values[platform.storageKey]) : false;
    }

    function isCurrentSiteEnabled() {
        if (!state.platform) return normalizeEnabled(state.values[EXTENSION_KEY]);
        return normalizeEnabled(state.values[EXTENSION_KEY]) && isPlatformEnabled(state.platform);
    }

    function renderMain() {
        // Until the storage snapshot resolves, undefined keys would all read as
        // "enabled" — keep the HTML's «در حال بررسی…» placeholder instead of
        // flashing a wrong toggle/metric state (the popup sequences the same way).
        if (!state.loaded) return;

        const siteName = document.getElementById('siteName');
        const siteState = document.getElementById('siteState');
        const toggle = document.getElementById('siteToggle');
        const enabled = isCurrentSiteEnabled();

        if (siteName) {
            siteName.textContent = !state.detected
                ? 'در حال بررسی…'
                : (state.platform
                    ? state.platform.name
                    : 'این سایت پشتیبانی نمی‌شود');
        }
        if (siteState) {
            siteState.dataset.enabled = state.detected ? String(enabled) : '';
            siteState.textContent = !state.detected
                ? ''
                : (state.platform
                    ? (enabled ? 'راست‌چین برای این ابزار فعال است' : 'راست‌چین برای این ابزار خاموش است')
                    : (enabled ? 'کلید سراسری افزونه روشن است' : 'کلید سراسری افزونه خاموش است'));
        }
        if (toggle) {
            // Detection gate: while the active tab is still being identified, a
            // click would key off state.platform=null and write the GLOBAL
            // extensionEnabled key — the exact miswrite seen on claude.ai.
            toggle.disabled = !state.detected;
            if (state.detected && toggle.checked !== enabled) toggle.checked = enabled;
            // On unmatched sites the toggle drives the GLOBAL gate — say so to
            // assistive tech instead of pretending it is still site-scoped.
            toggle.setAttribute('aria-label', !state.detected
                ? 'در حال شناسایی سایت فعلی'
                : (state.platform
                    ? `فعال‌سازی راست‌چین برای ${state.platform.name}`
                    : 'روشن/خاموش کردن سراسری افزونه راست‌چین'));
        }

        const total = document.getElementById('totalPlatformCount');
        const active = document.getElementById('activePlatformCount');
        const globallyEnabled = normalizeEnabled(state.values[EXTENSION_KEY]);
        const activeCount = globallyEnabled
            ? PLATFORM_KEYS.filter(key => normalizeEnabled(state.values[key])).length
            : 0;
        if (total) total.textContent = toFa(PLATFORM_KEYS.length);
        if (active) active.textContent = toFa(activeCount);

        document.querySelectorAll('.platform-chip').forEach(chip => {
            chip.classList.toggle('is-current', Boolean(state.platform) && chip.dataset.platform === state.platform.id);
        });
    }

    function renderPlatformGrid() {
        const grid = document.getElementById('platformGrid');
        if (!grid) return;
        const fragment = document.createDocumentFragment();
        PLATFORMS.forEach(platform => {
            const chip = document.createElement('a');
            chip.className = 'platform-chip';
            chip.dataset.platform = platform.id;
            chip.href = platform.url;
            chip.target = '_blank';
            chip.rel = 'noopener';

            const icon = document.createElement('img');
            icon.src = `../../assets/icons/${platform.icon}`;
            icon.alt = '';
            chip.appendChild(icon);

            const label = document.createElement('span');
            label.textContent = platform.name;
            chip.appendChild(label);

            fragment.appendChild(chip);
        });
        grid.replaceChildren(fragment);
    }

    function wireSiteToggle() {
        const toggle = document.getElementById('siteToggle');
        if (!toggle) return;
        toggle.addEventListener('change', event => {
            // Belt-and-suspenders for the disabled-until-detected gate above.
            if (!state.detected) return;
            const enabled = Boolean(event.target.checked);
            const key = state.platform ? state.platform.storageKey : EXTENSION_KEY;

            const changes = { [key]: enabled };
            // The legacy global switch is still honoured by content scripts. If it
            // was previously off, turning on the current site must also reopen it.
            if (state.platform && enabled && !normalizeEnabled(state.values[EXTENSION_KEY])) {
                changes[EXTENSION_KEY] = true;
            }

            Object.assign(state.values, changes);
            storage.set(changes);
            renderMain();
            syncSettingsInputs();
        });
    }

    // ----- active-tab tracking ---------------------------------------------------
    function queryActiveTab(callback) {
        const query = { active: true };
        if (typeof panelWindowId === 'number') query.windowId = panelWindowId;
        else query.lastFocusedWindow = true;
        chrome.tabs.query(query, callback);
    }

    // One delayed re-detection per refresh cycle. Covers the two real-world
    // gaps with no self-healing event: (a) the page is still loading and the
    // content script (document_end) has not been injected when the panel asks;
    // (b) the extension was just reloaded, orphaning the old content script —
    // the user reloads the tab, and the retry catches the fresh injection.
    function scheduleDetectionRetry(requestSeq) {
        setTimeout(() => {
            if (requestSeq !== activeTabRequestSeq) return; // a newer cycle took over
            refreshActiveTab(true);
        }, 450);
    }

    function refreshActiveTab(isRetry = false) {
        if (!chrome.tabs?.query) {
            // Resolve the «در حال بررسی…» state even without the tabs API so
            // the toggle (global mode) does not stay disabled forever.
            applyActiveTabFallback(undefined);
            return;
        }
        // Window scoping degrades to lastFocusedWindow while unresolved; keep
        // re-attempting the (single-shot at init) getCurrent until it lands.
        if (panelWindowId === null && chrome.windows?.getCurrent) {
            chrome.windows.getCurrent(win => {
                const windowError = chrome.runtime.lastError;
                if (!windowError && typeof win?.id === 'number') panelWindowId = win.id;
            });
        }
        const requestSeq = ++activeTabRequestSeq;
        if (!isRetry) beginActiveTabDetection();
        queryActiveTab(tabs => {
            // Read lastError BEFORE any early return — skipping the read logs
            // "Unchecked runtime.lastError" to the panel console.
            const queryError = chrome.runtime.lastError;
            if (requestSeq !== activeTabRequestSeq) return;
            if (queryError) {
                // Keep the «در حال بررسی…» gate up through the retry — resolving
                // here would paint «پشتیبانی نمی‌شود» with a LIVE global toggle
                // on a site that was never identified (the v1.1.18 miswrite).
                // Only after the retry ALSO fails does the card resolve to the
                // honest global-mode fallback, so the toggle never stays
                // disabled forever either.
                if (!isRetry) scheduleDetectionRetry(requestSeq);
                else if (!state.detected) applyActiveTabFallback(undefined);
                return;
            }
            const activeTab = tabs?.[0];
            if (!activeTab) {
                // Focus parked on a window with no queryable tabs (undocked
                // devtools etc.): hold the last-known site instead of flashing
                // «پشتیبانی نمی‌شود» over a still-open supported tab. On the
                // FIRST cycle there is nothing to hold — same retry-then-resolve
                // ladder as the error branch above.
                if (!state.detected) {
                    if (!isRetry) scheduleDetectionRetry(requestSeq);
                    else applyActiveTabFallback(undefined);
                }
                return;
            }
            if (typeof activeTab.id !== 'number' || !chrome.tabs?.sendMessage) {
                applyActiveTabFallback(activeTab);
                return;
            }
            chrome.tabs.sendMessage(activeTab.id, { type: 'rastchin:get-platform' }, response => {
                const messageError = chrome.runtime.lastError; // read before the seq guard
                if (requestSeq !== activeTabRequestSeq) return;
                if (messageError) {
                    // No receiver: content script not injected (yet) or orphaned
                    // by an extension reload. If tab.url is exposed, the URL
                    // fallback can still resolve supported/unsupported sites
                    // immediately; if it is hidden, keep the detection gate up
                    // until one retry proves there is really no receiver.
                    if (isRetry || activeTabFallbackCanResolve(activeTab)) {
                        applyActiveTabFallback(activeTab);
                    }
                    if (!isRetry) scheduleDetectionRetry(requestSeq);
                    return;
                }
                applyPlatformInfo(response, activeTab);
            });
        });
    }

    function wireTabTracking() {
        // The panel outlives tab switches (unlike the popup), so detection must
        // follow the user: tab activation, in-place navigation, prerender tab
        // swaps, window focus. The side panel is PER-WINDOW — events from other
        // windows are filtered out, otherwise a load completing in window B
        // would repoint (and let the toggle rewrite) the panel over window A.
        const isOurWindow = windowId =>
            typeof panelWindowId !== 'number' ||
            typeof windowId !== 'number' ||
            windowId === panelWindowId;

        chrome.tabs?.onActivated?.addListener(activeInfo => {
            if (!isOurWindow(activeInfo?.windowId)) return;
            refreshActiveTab();
        });
        chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
            if (!tab?.active || !isOurWindow(tab?.windowId)) return;
            if (changeInfo.url || changeInfo.status === 'complete') refreshActiveTab();
        });
        chrome.tabs?.onReplaced?.addListener(() => refreshActiveTab());
        chrome.windows?.onFocusChanged?.addListener(windowId => {
            // WINDOW_ID_NONE = focus left every browser window; nothing to
            // re-detect, and in degraded (unscoped) mode reacting to it would
            // repoint the panel at whatever window takes focus next.
            const none = chrome.windows?.WINDOW_ID_NONE ?? -1;
            if (typeof windowId === 'number' && windowId === none) return;
            refreshActiveTab();
        });
    }

    // ----- settings tab ---------------------------------------------------------
    function renderSettings() {
        const list = document.getElementById('settingsList');
        if (!list) return;
        const fragment = document.createDocumentFragment();

        CATEGORIES.forEach(category => {
            const platforms = PLATFORMS.filter(platform => platform.category === category.id);
            if (!platforms.length) return;

            const title = document.createElement('div');
            title.className = 'setting-group-title';
            title.textContent = category.label;
            fragment.appendChild(title);

            platforms.forEach(platform => {
                const row = document.createElement('label');
                row.className = 'setting-row';

                const icon = document.createElement('img');
                icon.src = `../../assets/icons/${platform.icon}`;
                icon.alt = '';
                row.appendChild(icon);

                const name = document.createElement('span');
                name.className = 'name';
                name.textContent = platform.name;
                row.appendChild(name);

                const switchWrap = document.createElement('span');
                switchWrap.className = 'switch';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.dataset.storageKey = platform.storageKey;
                input.checked = normalizeEnabled(state.values[platform.storageKey]);
                input.setAttribute('aria-label', `فعال‌سازی راست‌چین برای ${platform.name}`);
                input.addEventListener('change', () => {
                    const changes = { [platform.storageKey]: input.checked };
                    Object.assign(state.values, changes);
                    storage.set(changes);
                    renderMain();
                    // No renderSettings() here: rebuilding the list on the
                    // user's own toggle would destroy the focused input.
                });
                const slider = document.createElement('span');
                slider.className = 'slider';
                switchWrap.appendChild(input);
                switchWrap.appendChild(slider);
                row.appendChild(switchWrap);

                fragment.appendChild(row);
            });
        });

        list.replaceChildren(fragment);
    }

    // In-place state sync for the settings switches. storage.onChanged fires in
    // the SAME document that called storage.set, so a full renderSettings() on
    // every change would tear down the input the user just toggled (focus drops
    // to <body>, the slider transition never plays). Sync checkboxes in place
    // for exactly this reason.
    function syncSettingsInputs() {
        const list = document.getElementById('settingsList');
        if (!list) return;
        list.querySelectorAll('input').forEach(input => {
            const key = input.dataset.storageKey;
            if (!key) return;
            const next = normalizeEnabled(state.values[key]);
            if (input.checked !== next) input.checked = next;
        });
    }

    // ----- YouTube caption settings (in-panel) ---------------------------------
    function normalizeCaptionSize(value) {
        const values = [CAPTION_SIZE_PRESETS.small, CAPTION_SIZE_PRESETS.medium];
        const target = Number(value);
        if (!Number.isFinite(target)) return CAPTION_DEFAULT_SIZE;
        // Snap to the nearest preset so a legacy/free stored percent (e.g. 130/160)
        // lands on the matching safe button instead of leaving none active.
        return values.reduce((best, candidate) =>
            Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best, values[0]);
    }

    function normalizeCaptionColor(value) {
        if (typeof value !== 'string') return CAPTION_DEFAULT_COLOR;
        const hex = value.trim().toLowerCase();
        // Any valid legacy/custom hex is honoured for the preview; only the two
        // preset buttons light up.
        return /^#[0-9a-f]{6}$/.test(hex) ? hex : CAPTION_DEFAULT_COLOR;
    }

    function syncCaptionControls() {
        CAPTION_SIZE_BUTTONS.forEach(({ id, size }) => {
            const button = document.getElementById(id);
            if (button) button.setAttribute('aria-pressed', String(size === captionState.size));
        });
        CAPTION_COLOR_BUTTONS.forEach(({ id, color }) => {
            const button = document.getElementById(id);
            if (button) button.setAttribute('aria-pressed', String(color === captionState.color));
        });
        const pill = document.getElementById('capPreviewPill');
        if (pill && pill.style) {
            pill.style.fontSize = `${(captionState.size / 100) * CAPTION_PREVIEW_BASE_PX}px`;
            pill.style.color = captionState.color;
        }
    }

    function readCaptionStateFrom(values) {
        captionState.size = normalizeCaptionSize(values?.[CAPTION_FONT_KEY]);
        captionState.color = normalizeCaptionColor(values?.[CAPTION_COLOR_KEY]);
    }

    function wireCaptionControls() {
        CAPTION_SIZE_BUTTONS.forEach(({ id, size }) => {
            document.getElementById(id)?.addEventListener('click', () => {
                captionState.size = size;
                storage.set({ [CAPTION_FONT_KEY]: size });
                syncCaptionControls();
            });
        });
        CAPTION_COLOR_BUTTONS.forEach(({ id, color }) => {
            document.getElementById(id)?.addEventListener('click', () => {
                captionState.color = color;
                storage.set({ [CAPTION_COLOR_KEY]: color });
                syncCaptionControls();
            });
        });
    }

    // ----- what's new tab --------------------------------------------------------
    function renderWhatsNew() {
        const timeline = document.getElementById('timeline');
        if (!timeline) return;
        const currentVersion = getManifestVersion();
        const fragment = document.createDocumentFragment();

        CHANGELOG.forEach(entry => {
            const card = document.createElement('li');
            card.className = 'release';
            const isCurrent = Boolean(currentVersion) && entry.version === currentVersion;
            if (isCurrent) card.classList.add('is-current');

            const head = document.createElement('div');
            head.className = 'release-head';

            const version = document.createElement('span');
            version.className = 'release-version rc-ltr';
            version.textContent = entry.tag;
            head.appendChild(version);

            const title = document.createElement('span');
            title.className = 'release-title';
            title.textContent = entry.title;
            head.appendChild(title);

            if (isCurrent) {
                const pill = document.createElement('span');
                pill.className = 'current-pill';
                pill.textContent = 'نسخهٔ فعلی';
                head.appendChild(pill);
            }

            card.appendChild(head);

            const list = document.createElement('ul');
            list.className = 'release-list';
            entry.notes.forEach(note => {
                const item = document.createElement('li');
                item.textContent = note;
                list.appendChild(item);
            });
            card.appendChild(list);

            fragment.appendChild(card);
        });

        timeline.replaceChildren(fragment);
    }

    // ----- header / footer actions --------------------------------------------------
    // The version badge jumps to the in-panel «تازه‌ها» tab. The only outbound link
    // is the footer «بازخورد و پشتیبانی», which opens the official site in a new tab
    // — the in-panel feedback composer (radios / textarea / copy / email) was removed
    // in v1.1.34. No button opens a separate extension page.
    function openWebsite() {
        if (chrome.tabs?.create) chrome.tabs.create({ url: WEBSITE_URL });
        else window.open(WEBSITE_URL, '_blank', 'noopener');
    }

    function wireActions() {
        const versionBadge = document.getElementById('panelVersion');
        if (versionBadge) {
            const version = getManifestVersion();
            versionBadge.textContent = version ? `v${version}` : '';
            versionBadge.addEventListener('click', () => selectTab('whats-new'));
        }
        document.getElementById('panelWebsiteLink')?.addEventListener('click', openWebsite);
    }

    // ----- storage sync --------------------------------------------------------------
    function wireStorageSync() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync') return;
            // YouTube caption settings sync independently of the platform toggles.
            if (changes[CAPTION_FONT_KEY] || changes[CAPTION_COLOR_KEY]) {
                if (changes[CAPTION_FONT_KEY]) captionState.size = normalizeCaptionSize(changes[CAPTION_FONT_KEY].newValue);
                if (changes[CAPTION_COLOR_KEY]) captionState.color = normalizeCaptionColor(changes[CAPTION_COLOR_KEY].newValue);
                syncCaptionControls();
            }
            let touched = false;
            for (const [key, change] of Object.entries(changes)) {
                if (key !== EXTENSION_KEY && !PLATFORM_KEYS.includes(key)) continue;
                // Skip the echo of this document's own storage.set (already
                // applied to state.values) — only genuinely external changes
                // need a re-render.
                if (state.values[key] === change.newValue) continue;
                state.values[key] = change.newValue;
                touched = true;
            }
            if (!touched) return;
            renderMain();
            syncSettingsInputs();
        });
    }

    function init() {
        selectTab('main');
        wireTabs();
        wireSiteToggle();
        wireTabTracking();
        wireActions();
        wireCaptionControls();
        wireStorageSync();
        renderPlatformGrid();
        renderWhatsNew();

        storage.get([EXTENSION_KEY, ...PLATFORM_KEYS, CAPTION_FONT_KEY, CAPTION_COLOR_KEY], result => {
            state.values = result || {};
            state.loaded = true;
            readCaptionStateFrom(state.values);
            renderSettings();
            syncCaptionControls();
            // Paint metrics/settings now; the site card stays on the
            // «در حال بررسی…» placeholder until detection resolves below.
            renderMain();
            if (chrome.windows?.getCurrent) {
                chrome.windows.getCurrent(win => {
                    const windowError = chrome.runtime.lastError;
                    if (!windowError && typeof win?.id === 'number') panelWindowId = win.id;
                    refreshActiveTab();
                });
            } else {
                refreshActiveTab();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
