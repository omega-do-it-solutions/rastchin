'use strict';
// Smoke test for manifest <-> source content-script wiring (Milestone 8).
// Validates the SOURCE tree (not the built unpacked/ output), so wiring drift is
// caught by `pnpm test` before a build is ever produced. Complements
// scripts/verify-unpacked.js, which checks the built unpacked/ directory.
//
// Asserts:
//   - manifest_version is 3
//   - manifest.json and package.json versions stay in sync (release-rule guard)
//   - every manifest-referenced file exists (popup, side panel, service worker,
//     icons, content-script js, web-accessible font dir)
//   - every content_scripts entry: injects exactly one src/platforms/*.js file
//     (and that file is the LAST js entry, so its deps load first), includes the
//     mandatory core runtime deps (controller + rtl-engine + bidi-isolate +
//     recipe-runner), declares at
//     least one https match, and runs at document_end
//   - no platform file is registered more than once, and every src/platforms/*.js
//     on disk is registered (no orphan)
//   - each platform recipe's declared hosts[] are all covered by that entry's
//     match patterns (no host gate without a matching injection rule)
//   - every asset referenced via chrome.runtime.getURL("...") in source exists
//     (e.g. the exact Vazirmatn font filename and the welcome page)
//   - every local asset referenced by popup/welcome/side-panel HTML exists on disk,
//     including bare-relative sibling scripts (closes the gap verify-unpacked
//     leaves for HTML-referenced SVG/CSS/JS assets)
//
// Intentionally OUT OF SCOPE (covered elsewhere or deferred follow-ups):
//   - controller.js URL_TO_CHATBOT / recipe storageKey drift (covered by the
//     storage-keys consistency review, not asserted here)
//   - rejecting an EXTRA but valid-https match pointing at the wrong product
//     (host coverage is one-directional: recipe.hosts ⊆ entry.matches)
//   - assets referenced only via CSS url()/@import beyond the getURL font check
//
// Pure Node, no dependencies. Exits 1 on any failure.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rel = p => path.join(ROOT, p);
// Guarded so a missing manifest key yields a clean FAIL, not an opaque TypeError.
const fileExists = p => typeof p === 'string' && p.length > 0 && fs.existsSync(rel(p));

let failures = 0;
let total = 0;

function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

function walkJsFiles(dirRel) {
    const out = [];
    for (const name of fs.readdirSync(rel(dirRel))) {
        const childRel = `${dirRel}/${name}`;
        const stat = fs.statSync(rel(childRel));
        if (stat.isDirectory()) out.push(...walkJsFiles(childRel));
        else if (name.endsWith('.js')) out.push(childRel);
    }
    return out;
}

function walkTextFiles(dirRel) {
    const out = [];
    const skippedDirs = new Set(['.git', 'node_modules', 'unpacked', 'unpacked-firefox', 'dist', 'build', 'coverage']);
    const textExts = new Set(['.css', '.html', '.js', '.json', '.md']);
    for (const name of fs.readdirSync(rel(dirRel))) {
        if (skippedDirs.has(name)) continue;
        const childRel = dirRel === '.' ? name : `${dirRel}/${name}`;
        const stat = fs.statSync(rel(childRel));
        if (stat.isDirectory()) out.push(...walkTextFiles(childRel));
        else if (textExts.has(path.extname(name))) out.push(childRel);
    }
    return out;
}

const manifest = JSON.parse(fs.readFileSync(rel('manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(rel('package.json'), 'utf8'));

// --- MV3 + version sync (mirrors the project's mandatory versioning rule) ---
check('manifest_version is 3', manifest.manifest_version, 3);
check('manifest.version === package.json.version', manifest.version, pkg.version);

// --- top-level manifest-referenced files exist ---
check('action.default_popup exists', fileExists(manifest.action && manifest.action.default_popup), true);
check('standalone options_page is not declared', Object.prototype.hasOwnProperty.call(manifest, 'options_page'), false);
check('background.service_worker exists', fileExists(manifest.background && manifest.background.service_worker), true);

// --- side panel wiring (MV3, Chrome 114+) ---
// Toolbar-click opens the panel via setPanelBehavior in the service worker;
// action.default_popup stays as the fallback where chrome.sidePanel is absent.
check('minimum_chrome_version matches sidePanel availability', manifest.minimum_chrome_version, '114');
check('side_panel.default_path declared', typeof (manifest.side_panel && manifest.side_panel.default_path), 'string');
check('side_panel.default_path exists', fileExists(manifest.side_panel && manifest.side_panel.default_path), true);
check('sidePanel permission declared', (manifest.permissions || []).includes('sidePanel'), true);
check('tabs permission declared for reliable side-panel active-tab URL detection', (manifest.permissions || []).includes('tabs'), true);
check('action.default_popup kept as no-sidePanel fallback', typeof (manifest.action && manifest.action.default_popup), 'string');
{
    const swSource = fs.readFileSync(rel(manifest.background.service_worker), 'utf8');
    check('service worker opts into openPanelOnActionClick', /setPanelBehavior\(\s*\{\s*openPanelOnActionClick:\s*true\s*\}\s*\)/.test(swSource), true);
    check('service worker feature-detects chrome.sidePanel', /globalThis\.chrome\?\.sidePanel\?\./.test(swSource), true);
}

for (const [size, p] of Object.entries(manifest.icons || {})) {
    check(`icons[${size}] exists`, fileExists(p), true);
}
for (const [size, p] of Object.entries((manifest.action && manifest.action.default_icon) || {})) {
    check(`action.default_icon[${size}] exists`, fileExists(p), true);
}

for (const entry of manifest.web_accessible_resources || []) {
    for (const res of entry.resources || []) {
        if (res.includes('*')) {
            const dir = res.replace(/\/\*.*$/, '');
            const present = fs.existsSync(rel(dir)) && fs.readdirSync(rel(dir)).length > 0;
            check(`web_accessible_resources dir non-empty: ${dir}`, present, true);
        } else {
            check(`web_accessible_resources file exists: ${res}`, fileExists(res), true);
        }
    }
}

// --- content_scripts wiring ---
const PLATFORM_RE = /^src\/platforms\/[a-z0-9-]+\.js$/;
const CORE_REQUIRED = [
    'src/core/controller.js',
    'src/core/rtl-engine.js',
    'src/core/bidi-isolate.js',
    'src/core/recipe-runner.js'
];
const entries = manifest.content_scripts || [];
const registeredPlatformFiles = new Set();
const platformRegistrations = []; // includes duplicates, to detect double-registration

check('content_scripts is non-empty', entries.length > 0, true);

entries.forEach((entry, i) => {
    const js = entry.js || [];
    js.forEach(p => check(`content_scripts[${i}] js exists: ${p}`, fileExists(p), true));

    // exactly one platform file, and it must be the LAST js entry so its deps load first
    const platformFiles = js.filter(p => PLATFORM_RE.test(p));
    check(`content_scripts[${i}] injects exactly one platform file`, platformFiles.length, 1);
    platformFiles.forEach(p => { registeredPlatformFiles.add(p); platformRegistrations.push(p); });
    if (platformFiles.length === 1) {
        check(`content_scripts[${i}] platform file is last in js[] (deps load first)`, js[js.length - 1], platformFiles[0]);
    }

    const matches = entry.matches || [];
    check(`content_scripts[${i}] has at least one match`, matches.length > 0, true);
    matches.forEach(m => check(`content_scripts[${i}] match is https: ${m}`, /^https:\/\//.test(m), true));

    // Every recipe entry: mandatory core deps and document_end.
    CORE_REQUIRED.forEach(dep => check(`content_scripts[${i}] includes core dep ${dep}`, js.includes(dep), true));
    const idxEngine = js.indexOf('src/core/rtl-engine.js');
    const idxBidi = js.indexOf('src/core/bidi-isolate.js');
    const idxRunner = js.indexOf('src/core/recipe-runner.js');
    check(`content_scripts[${i}] loads bidi-isolate after rtl-engine`, idxBidi > idxEngine, true);
    check(`content_scripts[${i}] loads bidi-isolate before recipe-runner`, idxBidi < idxRunner, true);
    check(`content_scripts[${i}] run_at is document_end`, entry.run_at, 'document_end');
});

check('no content_scripts entry uses document_start', entries.filter(e => e.run_at === 'document_start').length, 0);

// --- no duplicate registration; no orphan platform files ---
check('no platform file registered more than once', platformRegistrations.length, new Set(platformRegistrations).size);

const PLATFORM_DIR = 'src/platforms';
const onDisk = fs.readdirSync(rel(PLATFORM_DIR))
    .filter(f => f.endsWith('.js'))
    .map(f => `${PLATFORM_DIR}/${f}`);
onDisk.forEach(p => check(`platform file registered in manifest: ${p}`, registeredPlatformFiles.has(p), true));
check('registered platform count === platform files on disk', registeredPlatformFiles.size, onDisk.length);

// --- each recipe's hosts[] must be covered by its entry's match patterns ---
function hostFromMatch(m) {
    return m.replace(/^https:\/\//, '').split('/')[0]; // host may be like *.notion.site
}
function hostCovered(host, matchHosts) {
    return matchHosts.some(mh => {
        if (mh === host) return true;
        if (mh.startsWith('*.')) return host === mh.slice(2) || host.endsWith(mh.slice(1));
        return false;
    });
}
entries.forEach((entry, i) => {
    const platformFile = (entry.js || []).find(p => PLATFORM_RE.test(p));
    if (!platformFile) return; // exactly-one check above already failed for this entry
    const src = fs.readFileSync(rel(platformFile), 'utf8');
    // Word boundary before `hosts` so a lowercase ...hosts-suffixed prop can't shadow it.
    const declared = src.match(/(?:^|[^A-Za-z0-9_])hosts\s*:\s*\[([^\]]*)\]/);
    if (!declared) {
        // Surface rather than silently skip — a recipe with no parseable hosts[] is itself notable.
        check(`recipe declares a hosts[] array: ${platformFile}`, false, true);
        return;
    }
    const recipeHosts = declared[1]
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    const matchHosts = (entry.matches || []).map(hostFromMatch);
    recipeHosts.forEach(h =>
        check(`recipe host "${h}" covered by a match pattern (${platformFile})`, hostCovered(h, matchHosts), true)
    );
});

// --- every chrome.runtime.getURL("...") asset in source exists (exact filename) ---
const GETURL_RE = /getURL\(\s*['"]([^'"]+)['"]\s*\)/g;
const getUrlAssets = new Set();
for (const jsRel of walkJsFiles('src')) {
    const src = fs.readFileSync(rel(jsRel), 'utf8');
    let m;
    while ((m = GETURL_RE.exec(src)) !== null) getUrlAssets.add(m[1]);
}
for (const asset of getUrlAssets) {
    check(`getURL asset exists in source: ${asset}`, fileExists(asset), true);
}

// --- HTML-referenced local assets exist (closes the verify-unpacked gap) ---
// Matches src/href values that are NOT a scheme/protocol-relative/anchor ref.
// The leading [\s"'>] anchors the attribute name so data-src / data-href are not matched.
const HTML_FILES = [
    'src/ui/popup/popup.html',
    'src/ui/welcome/welcome.html',
    'src/ui/whats-new/whats-new.html',
    'src/ui/side-panel/side-panel.html'
];
const LOCAL_REF_RE = /(?:^|[\s"'>])(?:src|href)\s*=\s*"(?!https?:|mailto:|data:|\/\/|#)([^"]+)"/g;
HTML_FILES.forEach(htmlRel => {
    if (!fileExists(htmlRel)) {
        check(`HTML file exists: ${htmlRel}`, false, true);
        return;
    }
    const htmlDir = path.dirname(rel(htmlRel));
    const html = fs.readFileSync(rel(htmlRel), 'utf8');
    const seen = new Set();
    let match;
    while ((match = LOCAL_REF_RE.exec(html)) !== null) {
        const ref = match[1].split(/[?#]/)[0]; // drop query/hash fragments
        if (!ref || seen.has(ref)) continue;
        seen.add(ref);
        const resolved = path.resolve(htmlDir, ref);
        check(`${htmlRel} references existing asset: ${ref}`, fs.existsSync(resolved), true);
    }
});

// --- release-facing text/UI guards ---
const textFiles = walkTextFiles('.');
const oldSupportPattern = new RegExp(`(?:support|rastchin)@${'omegado'}\\.(?:at|com)`);
const oldSupportRefs = textFiles.filter(file => oldSupportPattern.test(fs.readFileSync(rel(file), 'utf8')));
check('old support domain removed from text-like files', oldSupportRefs, []);
const releaseTextFiles = textFiles.filter(file => /^(src\/ui|store\/(?:chrome|firefox))\//.test(file) || file === 'manifest.json');
const projectProvenanceFiles = textFiles.filter(file => (
    /^(src\/ui|store\/(?:chrome|firefox))\//.test(file)
    || file === 'manifest.json'
));
const welcomeTypoRefs = releaseTextFiles.filter(file => /خانا/.test(fs.readFileSync(rel(file), 'utf8')));
check('welcome typo خانا removed from text-like files', welcomeTypoRefs, []);
const informalVerbTypoRefs = releaseTextFiles.filter(file => /میدهد/.test(fs.readFileSync(rel(file), 'utf8')));
check('welcome typo میدهد removed from text-like files', informalVerbTypoRefs, []);

// No X/Twitter promo or share intent in release-facing UI.
// Case-insensitive; \bx\.com catches the bare domain (with or without a path), and
// share intents are blocked directly.
const SOCIAL_CTA_RE = /twitter\.com|\bx\.com|intent\/tweet|دنبال‌کردن در X/i;
const socialCtaRefs = releaseTextFiles.filter(file => SOCIAL_CTA_RE.test(fs.readFileSync(rel(file), 'utf8')));
check('no X/Twitter promo in release-facing UI', socialCtaRefs, []);

// Keep public/project-visible copy free of competitor/provenance traces. This is
// scoped narrowly so legitimate technical phrases such as "recipe pattern" do not
// make implementation notes untestable.
const PROVENANCE_TRACE_RE = /رقیب|competitor|runtime\.id|AI Bridge|codex-peer|الگو گرفته|الهام|منشأ/i;
const provenanceTraceRefs = projectProvenanceFiles.filter(file => PROVENANCE_TRACE_RE.test(fs.readFileSync(rel(file), 'utf8')));
check('no competitor or provenance traces in project-facing copy', provenanceTraceRefs, []);

// No telemetry/analytics/network calls in shipped source JS (privacy-first). Scoped to
// src/*.js so marketing prose mentioning "analytics" (store copy) cannot false-positive.
const NETWORK_RE = /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|\bsendBeacon\s*\(|\bgtag\s*\(|googletagmanager|google-analytics|\banalytics\.(?:track|page|identify)\b|posthog|Sentry/;
const networkRefs = walkJsFiles('src').filter(file => NETWORK_RE.test(fs.readFileSync(rel(file), 'utf8')));
check('no network/telemetry/analytics calls in shipped src JS', networkRefs, []);

const popupHtml = fs.readFileSync(rel('src/ui/popup/popup.html'), 'utf8');
const popupJs = fs.readFileSync(rel('src/ui/popup/popup.js'), 'utf8');
const welcomeHtml = fs.readFileSync(rel('src/ui/welcome/welcome.html'), 'utf8');
const whatsNewJs = fs.readFileSync(rel('src/ui/whats-new/whats-new.js'), 'utf8');
const whatsNewHtml = fs.readFileSync(rel('src/ui/whats-new/whats-new.html'), 'utf8');
const sidePanelHtml = fs.readFileSync(rel('src/ui/side-panel/side-panel.html'), 'utf8');
const sidePanelJs = fs.readFileSync(rel('src/ui/side-panel/side-panel.js'), 'utf8');
const youtubeRtlJs = fs.readFileSync(rel('src/platforms/youtube-rtl.js'), 'utf8');
check('popup fallback version matches manifest', new RegExp(`id="extensionVersion">v${manifest.version}<`).test(popupHtml), true);

// Power switch direction + size guards. On = thumb on the right (brand), off =
// thumb on the left (grey). The checked state must move the thumb RIGHTWARD, so
// it must never use a negative translateX (the old design slid it left).
check('power switch: no negative translateX anywhere', /translateX\(-/.test(popupHtml), false);
check('power switch: checked slides thumb rightward', /input:checked \+ span::before\s*\{[^}]*transform:\s*translateX\(20px\)/.test(popupHtml), true);
check('power switch: off-state thumb anchored left', /\.power span::before\s*\{[^}]*left:\s*3px/.test(popupHtml), true);
check('power switch: track shrunk to 44px wide', /\.power\s*\{[^}]*width:\s*44px/.test(popupHtml), true);
check('power switch: track shrunk to 24px tall', /\.power\s*\{[^}]*height:\s*24px/.test(popupHtml), true);
check('power switch: thumb shrunk to 16px', /\.power span::before\s*\{[^}]*width:\s*16px/.test(popupHtml), true);

check('standalone options HTML removed from source', fileExists('src/ui/options/options.html'), false);
check('standalone options JS removed from source', fileExists('src/ui/options/options.js'), false);
check('popup settings shortcut opens side-panel page', popupJs.includes("SIDE_PANEL_PAGE = 'src/ui/side-panel/side-panel.html'") && !/openOptionsPage/.test(popupJs), true);
check('welcome settings CTA points at side-panel page', welcomeHtml.includes('href="../side-panel/side-panel.html"'), true);
check('whats-new settings link points at side-panel page', whatsNewHtml.includes('href="../side-panel/side-panel.html"'), true);
check('side-panel preview uses compact caption line-height', /\.cap-preview__pill\s*\{[^}]*line-height:\s*1\.6/.test(sidePanelHtml), true);
check('side-panel preview uses compact caption radius', /\.cap-preview__pill\s*\{[^}]*border-radius:\s*6px/.test(sidePanelHtml), true);
check('side-panel preview uses settled runtime padding', /\.cap-preview__pill\s*\{[^}]*padding:\s*1px 10px/.test(sidePanelHtml), true);

check('YouTube caption default colour is readable yellow', sidePanelJs.includes("CAPTION_DEFAULT_COLOR = '#ffd400'"), true);
check('side-panel caption preset colours are yellow and white', sidePanelJs.includes("{ id: 'capColorYellow', color: '#ffd400' }") && sidePanelJs.includes("{ id: 'capColorWhite', color: '#ffffff' }"), true);
check('side-panel caption preset palette excludes black swatch', sidePanelJs.includes("'#000000'") || sidePanelHtml.includes('#000000'), false);
// Caption size is two crop-safe presets — small + medium (v1.1.33; large removed).
// Runtime + side-panel share the same {small:100, medium:120} band under the SAME
// storage key, and the medium preset is the fresh-install default on both sides.
check('YouTube caption default font size is medium/120 (side-panel)', /CAPTION_DEFAULT_SIZE\s*=\s*CAPTION_SIZE_PRESETS\.medium/.test(sidePanelJs), true);
check('runtime caption presets are small + medium only', /CAPTION_SIZE_PRESETS\s*=\s*\{\s*small:\s*100,\s*medium:\s*120\s*\}/.test(youtubeRtlJs), true);
check('runtime caption presets dropped the large preset', /large:\s*130/.test(youtubeRtlJs), false);
check('runtime caption default is the medium preset', /DEFAULT_FONT_SIZE\s*=\s*CAPTION_SIZE_PRESETS\.medium/.test(youtubeRtlJs), true);
check('side-panel caption presets mirror the runtime band', /CAPTION_SIZE_PRESETS\s*=\s*\{\s*small:\s*100,\s*medium:\s*120\s*\}/.test(sidePanelJs), true);

// --- YouTube caption sizing parity: the side-panel preview and the on-video runtime
// must resolve the same px for any %, or the preview lies about the real size. ---
check('parity: side-panel preview base is 15px', /CAPTION_PREVIEW_BASE_PX\s*=\s*15\b/.test(sidePanelJs), true);
check('parity: runtime desktop base px equals preview (15)', /CAPTION_BASE_PX\s*=\s*15\b/.test(youtubeRtlJs), true);
check('parity: runtime narrow base px equals preview (10.5)', /CAPTION_BASE_PX_NARROW\s*=\s*10\.5\b/.test(youtubeRtlJs), true);
check('parity: runtime narrow font switches at the same 680px breakpoint', /@media \(max-width: 680px\)/.test(youtubeRtlJs), true);
check('parity: runtime applies the absolute px var (not raw %) to the segment', /font-size:\s*var\(--rastchin-youtube-caption-font-px/.test(youtubeRtlJs), true);
// Size control is a discrete 2-preset group (small + medium), NOT a free slider.
// The preset values <-> side-panel size constants <-> runtime size constants must agree.
check('side-panel dropped the free caption slider', /type="range"/.test(sidePanelHtml), false);
check('side-panel exposes the small size preset', /id="capSizeSmall"[^>]*aria-label="اندازه کوچک"/.test(sidePanelHtml), true);
check('side-panel exposes the medium size preset', /id="capSizeMedium"[^>]*aria-label="اندازه متوسط"/.test(sidePanelHtml), true);
check('side-panel dropped the large size preset', /capSizeLarge|data-size="130"/.test(sidePanelHtml + sidePanelJs), false);
check('side-panel has no stale «بزرگ» size label', /بزرگ/.test(sidePanelHtml), false);
check('parity: side-panel snaps legacy caption sizes to nearest preset',
    /function normalizeCaptionSize/.test(sidePanelJs) && /CAPTION_SIZE_PRESETS\.small/.test(sidePanelJs) && /CAPTION_SIZE_PRESETS\.medium/.test(sidePanelJs), true);
check('parity: runtime min constant is the small preset', /MIN_FONT_SIZE\s*=\s*CAPTION_SIZE_PRESETS\.small/.test(youtubeRtlJs), true);
check('parity: runtime max constant is the medium preset (large removed)', /MAX_FONT_SIZE\s*=\s*CAPTION_SIZE_PRESETS\.medium/.test(youtubeRtlJs), true);
check('parity: runtime snaps legacy caption sizes to nearest preset',
    /function nearestCaptionSizePreset/.test(youtubeRtlJs) && /captionSettings\.fontSize\s*=\s*nearestCaptionSizePreset/.test(youtubeRtlJs), true);
check('youtube captions style every visible segment, not only RTL text',
    /markCaptionSegment\(element,\s*isNeutralPunctuationSegment\(text\)/.test(youtubeRtlJs), true);
check('youtube captions keep direction as a separate segment-scoped class',
    /CAPTION_DIR_RTL_CLASS/.test(youtubeRtlJs) && /CAPTION_DIR_LTR_CLASS/.test(youtubeRtlJs), true);
check('youtube captions do not force CSS direction on caption segments',
    /\.ytp-caption-segment\.rastchin-youtube-caption-dir-(?:rtl|ltr)\s*\{/.test(youtubeRtlJs), false);
const changelogData = fs.readFileSync(rel('src/ui/shared/changelog-data.js'), 'utf8');
check('shared changelog includes current manifest version', changelogData.includes(`version: '${manifest.version}'`), true);
check('whats-new consumes the shared changelog data (usage, not a comment)',
    /Array\.isArray\(window\.RASTCHIN_CHANGELOG\)/.test(whatsNewJs), true);
check('whats-new loads changelog data before its script', whatsNewHtml.indexOf('changelog-data.js') >= 0 && whatsNewHtml.indexOf('changelog-data.js') < whatsNewHtml.indexOf('whats-new.js"'), true);

// --- side panel: shared <script> order + registry integrity ---
// side-panel.js degrades to empty lists when the shared globals are missing,
// so a dropped/misordered script tag would ship a silently blank panel.
check('side-panel loads the platform registry before its script',
    sidePanelHtml.indexOf('platform-registry.js') >= 0 && sidePanelHtml.indexOf('platform-registry.js') < sidePanelHtml.indexOf('side-panel.js"'), true);
check('side-panel loads changelog data before its script',
    sidePanelHtml.indexOf('changelog-data.js') >= 0 && sidePanelHtml.indexOf('changelog-data.js') < sidePanelHtml.indexOf('side-panel.js"'), true);

// --- feedback: extension-local composer removed; GitHub owns feedback/support ---
// Users reach feedback/support via public issue templates. Tabs are exactly
// اصلی / تنظیمات / تازه‌ها and no src/ui/feedback page should ship.
check('side-panel has no feedback tab button', /id="tab-feedback"/.test(sidePanelHtml), false);
check('side-panel has no feedback view', /id="view-feedback"/.test(sidePanelHtml), false);
check('side-panel has no feedback request form', /id="requestType"/.test(sidePanelHtml), false);
check('side-panel has no feedback radio inputs', /name="reqType"/.test(sidePanelHtml), false);
check('side-panel has exactly three tab buttons', (sidePanelHtml.match(/class="tab"/g) || []).length, 3);
check('side-panel links to GitHub support', sidePanelHtml.includes('بازخورد و پشتیبانی') && sidePanelHtml.includes('id="panelSupportLink"'), true);
check('side-panel JS opens the GitHub support url', sidePanelJs.includes("'https://github.com/omega-do-it-solutions/rastchin/issues/new/choose'"), true);
check('side-panel JS dropped the feedback composer', /REQUEST_TYPES|wireFeedback|emailFeedback/.test(sidePanelJs), false);
check('feedback HTML page removed from source', fileExists('src/ui/feedback/feedback.html'), false);
check('feedback JS page removed from source', fileExists('src/ui/feedback/feedback.js'), false);
check('popup links feedback to GitHub', popupJs.includes('https://github.com/omega-do-it-solutions/rastchin/issues/new?template=feature_request.yml'), true);
check('whats-new links feedback to GitHub', whatsNewHtml.includes('https://github.com/omega-do-it-solutions/rastchin/issues/new?template=feature_request.yml') && whatsNewJs.includes('https://github.com/omega-do-it-solutions/rastchin/issues/new?template=feature_request.yml'), true);
check('extension source has no internal feedback page refs', /src\/ui\/feedback|feedback\/feedback\.html/.test([popupHtml, popupJs, whatsNewHtml, whatsNewJs, sidePanelHtml, sidePanelJs].join('\n')), false);
check('extension UI has no legacy options page navigation', /src\/ui\/options|options\/options\.html|openOptionsPage/.test([popupJs, welcomeHtml, whatsNewHtml, sidePanelHtml, sidePanelJs].join('\n')), false);

// Registry icon paths are composed at runtime (`../../assets/icons/${icon}`),
// invisible to the HTML attribute scan — check each referenced file exists
// (a casing typo passes on macOS and 404s on Linux/ChromeOS).
const registryJs = fs.readFileSync(rel('src/ui/shared/platform-registry.js'), 'utf8');
const registryIcons = [...registryJs.matchAll(/icon: '([^']+)'/g)].map(m => m[1]);
check('registry declares icons for all platforms', registryIcons.length >= 15, true);
for (const icon of registryIcons) {
    check(`registry icon exists: ${icon}`, fileExists(`src/assets/icons/${icon}`), true);
}

// Drift guard: until the popup converges on the shared registry, their storage
// keys must stay identical (same supported platforms, same toggles).
{
    const registryKeys = [...registryJs.matchAll(/storageKey: '([^']+)'/g)].map(m => m[1]).sort();
    const popupJsSource = fs.readFileSync(rel('src/ui/popup/popup.js'), 'utf8');
    const popupBlock = (popupJsSource.match(/PLATFORM_STORAGE_KEYS = \{([\s\S]*?)\}/) || [, ''])[1];
    const popupKeys = [...popupBlock.matchAll(/:\s*'([^']+)'/g)].map(m => m[1]).sort();
    check('shared registry storage keys mirror the popup', registryKeys, popupKeys);
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
