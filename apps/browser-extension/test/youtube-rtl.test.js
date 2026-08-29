'use strict';
// Regression suite for YouTube's caption contract:
// keep YouTube's native caption mechanics, style every subtitle segment with the
// user's caption settings, and leave caption direction/layout to YouTube.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'platforms', 'youtube-rtl.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let exported = null;
let registeredRecipe = null;

const ctx = {
    chrome: { runtime: { getURL: file => `chrome-extension://test/${file}` } },
    window: {
        __YOUTUBE_RTL_TEST__(api) { exported = api; }
    },
    document: {
        documentElement: {
            classList: { add() {}, remove() {}, contains() { return false; } },
            style: { setProperty() {}, removeProperty() {} }
        },
        querySelectorAll() {
            const out = [];
            out.forEach = Array.prototype.forEach.bind(out);
            return out;
        }
    },
    RastChinRecipe: {
        runPlatformRecipe(recipe) { registeredRecipe = recipe; }
    },
    setTimeout(fn) { return fn; },
    clearTimeout() {},
    console
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(source, ctx);

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (got !== expected) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

if (!exported || !registeredRecipe) {
    console.error('FATAL: YouTube recipe test hook did not run');
    process.exit(1);
}

function makeClassList(el, initial = []) {
    const set = new Set(initial);
    return {
        add(...names) { names.forEach(n => set.add(n)); },
        remove(...names) { names.forEach(n => set.delete(n)); },
        contains(name) { return set.has(name); },
        toArray() { return Array.from(set); }
    };
}

class HTMLElement {}
ctx.HTMLElement = HTMLElement;

function makeElement(options = {}) {
    const styleStore = new Map();
    const priorityStore = new Map();
    const attrs = new Map(Object.entries(options.attrs || {}));
    const matchSet = new Set(options.matchSelectors || []);
    const children = options.children || [];
    const el = {
        textContent: options.textContent || '',
        isConnected: options.isConnected,
        style: {
            setProperty(prop, value, priority) {
                styleStore.set(prop, value);
                priorityStore.set(prop, priority || '');
            },
            removeProperty(prop) {
                styleStore.delete(prop);
                priorityStore.delete(prop);
            },
            getPropertyValue(prop) { return styleStore.get(prop) || ''; },
            getPropertyPriority(prop) { return priorityStore.get(prop) || ''; }
        },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        setAttribute(name, value) { attrs.set(name, value); },
        removeAttribute(name) { attrs.delete(name); },
        matches(selector) { return matchSet.has(selector); },
        closest(selector) {
            if (options.closestMatch && selector.includes(options.closestMatch)) return {};
            return null;
        },
        querySelectorAll(selector) {
            const out = [];
            const visit = node => {
                (node._children || []).forEach(child => {
                    if (child.matches?.(selector)) out.push(child);
                    visit(child);
                });
            };
            visit(el);
            out.forEach = Array.prototype.forEach.bind(out);
            return out;
        },
        _children: children
    };
    el.classList = makeClassList(el, options.classes || []);
    Object.setPrototypeOf(el, HTMLElement.prototype);
    return el;
}

function makeCaption(text, segmentOptions = {}, windowOptions = {}) {
    const segment = makeElement({
        matchSelectors: ['.ytp-caption-segment'],
        textContent: text,
        ...segmentOptions
    });
    const win = makeElement({
        matchSelectors: ['.caption-window'],
        textContent: text,
        children: [segment],
        ...windowOptions
    });
    return { win, segment };
}

// A caption window holding several independent .ytp-caption-segment children —
// the shape YouTube emits when it splits a lone punctuation mark («?», «!», a
// quote) into its own segment beside the Persian words. Each entry may be a raw
// string or { text, ...segmentOptions } (e.g. closestMatch:'code').
function makeCaptionMulti(entries, windowOptions = {}) {
    const segments = entries.map(entry => {
        const opts = typeof entry === 'string' ? { textContent: entry } : { textContent: entry.text, ...entry };
        delete opts.text;
        return makeElement({ matchSelectors: ['.ytp-caption-segment'], ...opts });
    });
    const win = makeElement({
        matchSelectors: ['.caption-window'],
        textContent: entries.map(e => (typeof e === 'string' ? e : e.text)).join(' '),
        children: segments,
        ...windowOptions
    });
    return { win, segments };
}

const engine = {
    collectDirectionText(el) { return el.textContent || ''; },
    needsRTL(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    hasRtlLetter(text) { return /\p{Script=Arabic}/u.test(text || ''); },
    isExcluded(el) { return registeredRecipe.isCodeLike(el); }
};

function styleValue(el, property) {
    return el.style.getPropertyValue(property);
}

// --- recipe contract ---
check('recipe: registered test export recipe', exported.recipe, registeredRecipe);
check('recipe: storage key', registeredRecipe.storageKey, 'youtubeEnabled');
check('recipe: host www.youtube.com', registeredRecipe.hosts.includes('www.youtube.com'), true);
check('recipe: host m.youtube.com', registeredRecipe.hosts.includes('m.youtube.com'), true);
check('recipe: uses caption window selectors', registeredRecipe.messageSelectors.includes('.caption-window'), true);
check('recipe: targets caption container', registeredRecipe.messageSelectors.includes('.ytp-caption-window-container'), true);
check('recipe: has custom applyToMessage', typeof registeredRecipe.applyToMessage, 'function');
check('recipe: has isMessageElement', typeof registeredRecipe.isMessageElement, 'function');
check('recipe: has scoped code guard', typeof registeredRecipe.isCodeLike, 'function');
check('recipe: has disable cleanup', typeof registeredRecipe.onDisable, 'function');
check('recipe: exports caption segment selector', exported.captionSegmentSelector, '.ytp-caption-segment');

// --- isMessageElement stays caption-window scoped ---
check('isMessageElement: caption container matches',
    registeredRecipe.isMessageElement(makeElement({ matchSelectors: ['.ytp-caption-window-container'] })), true);
check('isMessageElement: caption window matches',
    registeredRecipe.isMessageElement(makeElement({ matchSelectors: ['.caption-window'] })), true);
check('isMessageElement: player chrome ignored',
    registeredRecipe.isMessageElement(makeElement({ matchSelectors: ['.ytp-chrome-bottom'] })), false);

// --- Persian captions: segment text is styled, native window mechanics untouched ---
const persian = makeCaption('سلام دنیا این یک زیرنویس فارسی است', {}, {
    classes: ['rastchin-youtube-bg-ready', 'rastchin-youtube-roll', 'rastchin-youtube-seen']
});
persian.win.style.setProperty('height', '62px');
persian.win.style.setProperty('overflow', 'hidden');
persian.win.style.setProperty('transform', 'translateY(-20px)');
persian.win.style.setProperty('margin-left', '-130px');
const handled = registeredRecipe.applyToMessage(persian.win, engine);
check('applyToMessage: caption window handled', handled, true);
check('caption window: no RastChin marker attr', persian.win.getAttribute('data-rastchin-youtube-rtl'), null);
check('caption window: no RastChin class', persian.win.classList.contains('rastchin-youtube-rtl'), false);
check('caption window: legacy bg class removed', persian.win.classList.contains('rastchin-youtube-bg-ready'), false);
check('caption window: legacy roll class removed', persian.win.classList.contains('rastchin-youtube-roll'), false);
check('caption window: legacy seen class removed', persian.win.classList.contains('rastchin-youtube-seen'), false);
check('caption window: native height preserved', styleValue(persian.win, 'height'), '62px');
check('caption window: native overflow preserved', styleValue(persian.win, 'overflow'), 'hidden');
check('caption window: native transform preserved', styleValue(persian.win, 'transform'), 'translateY(-20px)');
check('caption window: native margin-left preserved', styleValue(persian.win, 'margin-left'), '-130px');
check('caption segment: marked for CSS text styling', persian.segment.getAttribute('data-rastchin-youtube-rtl'), 'true');
check('caption segment: gets text styling class marker', persian.segment.classList.contains('rastchin-youtube-rtl'), true);
check('caption segment: gets RTL direction class marker', persian.segment.classList.contains('rastchin-youtube-caption-dir-rtl'), true);
check('caption segment: does not get LTR direction class marker', persian.segment.classList.contains('rastchin-youtube-caption-dir-ltr'), false);
[
    'direction',
    'text-align',
    'unicode-bidi',
    'font-family',
    'line-height',
    'display',
    'white-space',
    'height',
    'overflow',
    'width',
    'max-height',
    'transform',
    'translate',
    'background',
    'padding',
    'border-radius'
].forEach(property => {
    check(`caption segment: no inline ${property}`, styleValue(persian.segment, property), '');
});

// --- Non-RTL captions get display settings while YouTube keeps direction/layout ---
const english = makeCaption('Hello world this is a caption');
registeredRecipe.applyToMessage(english.win, engine);
check('english caption window: not marked', english.win.getAttribute('data-rastchin-youtube-rtl'), null);
check('english caption segment: marked for CSS text styling', english.segment.getAttribute('data-rastchin-youtube-rtl'), 'true');
check('english caption segment: gets text styling class marker', english.segment.classList.contains('rastchin-youtube-rtl'), true);
check('english caption segment: gets LTR direction class marker', english.segment.classList.contains('rastchin-youtube-caption-dir-ltr'), true);
check('english caption segment: does not get RTL direction class marker', english.segment.classList.contains('rastchin-youtube-caption-dir-rtl'), false);
['direction', 'text-align', 'unicode-bidi', 'font-family'].forEach(prop =>
    check(`english caption segment has no inline ${prop}`, styleValue(english.segment, prop), ''));

const hebrew = makeCaption('שלום עולם');
registeredRecipe.applyToMessage(hebrew.win, engine);
check('hebrew caption segment: marked for CSS text styling', hebrew.segment.getAttribute('data-rastchin-youtube-rtl'), 'true');
check('hebrew caption segment: gets RTL direction marker', hebrew.segment.classList.contains('rastchin-youtube-caption-dir-rtl'), true);
check('hebrew caption segment: no LTR direction marker', hebrew.segment.classList.contains('rastchin-youtube-caption-dir-ltr'), false);

const excluded = makeCaption('سلام داخل کد', { closestMatch: 'code' });
registeredRecipe.applyToMessage(excluded.win, engine);
check('code-like caption segment: not marked', excluded.segment.getAttribute('data-rastchin-youtube-rtl'), null);

// --- Auto-translate-like Persian: empty -> multi-segment RTL cue -> English ---
{
    const cue = makeCaptionMulti(['', 'این', 'یک', 'زیرنویس', 'ترجمهٔ خودکار', 'است', '؟'], {
        textContent: 'این یک زیرنویس ترجمهٔ خودکار است؟'
    });
    registeredRecipe.applyToMessage(cue.win, engine);
    check('auto-translate: empty segment stays native', cue.segments[0].getAttribute('data-rastchin-youtube-rtl'), null);
    cue.segments.slice(1, 6).forEach((seg, i) => {
        check(`auto-translate: Persian word #${i + 1} marked`, seg.getAttribute('data-rastchin-youtube-rtl'), 'true');
        check(`auto-translate: Persian word #${i + 1} gets RTL metadata`, seg.classList.contains('rastchin-youtube-caption-dir-rtl'), true);
        ['direction', 'text-align', 'unicode-bidi', 'font-family', 'height', 'overflow'].forEach(prop =>
            check(`auto-translate: Persian word #${i + 1} has no inline ${prop}`, styleValue(seg, prop), ''));
    });
    check('auto-translate: Persian punctuation marked', cue.segments[6].getAttribute('data-rastchin-youtube-rtl'), 'true');
    cue.segments[1].textContent = 'Now';
    cue.segments[2].textContent = 'English';
    cue.segments[3].textContent = 'again';
    cue.segments[4].textContent = '';
    cue.segments[5].textContent = '';
    cue.segments[6].textContent = '?';
    registeredRecipe.applyToMessage(cue.win, engine);
    check('auto-translate flip: English word remains styled', cue.segments[1].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('auto-translate flip: English word gets LTR metadata', cue.segments[1].classList.contains('rastchin-youtube-caption-dir-ltr'), true);
    check('auto-translate flip: emptied Persian segment restored', cue.segments[4].getAttribute('data-rastchin-youtube-rtl'), null);
    check('auto-translate flip: punctuation remains styled with English cue', cue.segments[6].getAttribute('data-rastchin-youtube-rtl'), 'true');
}

// --- Persian neutral-punctuation segments (v1.1.32, Issue 1) ----------------
// In a window whose words ARE Persian, a split-off punctuation-only segment
// (ASCII «?», «!», «.», parens, quotes) must also be marked so it shares the
// caption colour/font. English/number/email/URL segments also receive display
// settings, but keep LTR direction. Code-like segments stay native.
{
    const cue = makeCaptionMulti(['آیا مطمئنی', '?']);
    registeredRecipe.applyToMessage(cue.win, engine);
    check('neutral: Persian word segment marked', cue.segments[0].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: split «?» in Persian window marked', cue.segments[1].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: split «?» gets the text class marker', cue.segments[1].classList.contains('rastchin-youtube-rtl'), true);
    // The punctuation segment must never receive an inline direction/style.
    ['direction', 'text-align', 'unicode-bidi', 'font-family'].forEach(prop =>
        check(`neutral: «?» segment has no inline ${prop}`, styleValue(cue.segments[1], prop), ''));
}
{
    const cue = makeCaptionMulti(['سلام', '!', '(', ')', '…', '«', '»']);
    registeredRecipe.applyToMessage(cue.win, engine);
    cue.segments.slice(1).forEach((seg, i) =>
        check(`neutral: punctuation segment #${i + 1} marked in Persian window`, seg.getAttribute('data-rastchin-youtube-rtl'), 'true'));
}
{
    // Mixed cue: Persian word + English word + number + email + URL + lone «?».
    const cue = makeCaptionMulti(['بله', 'Okay', '2024', 'a@b.com', 'http://x.io', '?']);
    registeredRecipe.applyToMessage(cue.win, engine);
    check('neutral: Persian word marked', cue.segments[0].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: English word marked for display settings', cue.segments[1].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: number marked for display settings', cue.segments[2].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: email marked for display settings', cue.segments[3].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: URL marked for display settings', cue.segments[4].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: English word stays LTR', cue.segments[1].classList.contains('rastchin-youtube-caption-dir-ltr'), true);
    check('neutral: URL-adjacent «?» NOT marked', cue.segments[5].getAttribute('data-rastchin-youtube-rtl'), null);
}
{
    // YouTube can split URL/domain punctuation into its own segment too. Even in a
    // Persian caption window, punctuation that joins Latin URL/code-like runs must
    // stay native so URLs/emails remain visually intact.
    const cue = makeCaptionMulti(['فارسی', 'example', '.', 'com', 'https', ':', '/', '/', 'site', '.', 'io']);
    registeredRecipe.applyToMessage(cue.win, engine);
    check('neutral URL context: Persian word marked', cue.segments[0].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral URL context: Latin domain part marked', cue.segments[1].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral URL context: domain dot NOT marked', cue.segments[2].getAttribute('data-rastchin-youtube-rtl'), null);
    check('neutral URL context: protocol text marked', cue.segments[4].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral URL context: protocol colon NOT marked', cue.segments[5].getAttribute('data-rastchin-youtube-rtl'), null);
    check('neutral URL context: slash receives display settings', cue.segments[6].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral URL context: second domain dot NOT marked', cue.segments[9].getAttribute('data-rastchin-youtube-rtl'), null);
}
{
    // English-only window: a lone «?» shares the cue's display settings and stays LTR.
    const cue = makeCaptionMulti(['Are you sure', '?']);
    registeredRecipe.applyToMessage(cue.win, engine);
    check('neutral: English word marked', cue.segments[0].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: «?» in English window marked', cue.segments[1].getAttribute('data-rastchin-youtube-rtl'), 'true');
    check('neutral: «?» in English window stays LTR', cue.segments[1].classList.contains('rastchin-youtube-caption-dir-ltr'), true);
}
{
    // Code-excluded punctuation in a Persian window stays native (isExcluded first).
    const cue = makeCaptionMulti(['کد', { text: '?', closestMatch: 'code' }]);
    registeredRecipe.applyToMessage(cue.win, engine);
    check('neutral: «?» inside code NOT marked', cue.segments[1].getAttribute('data-rastchin-youtube-rtl'), null);
}

// --- Flip and disable cleanup remove only RastChin markers ---
persian.segment.textContent = 'Now this cue is English';
persian.win.textContent = 'Now this cue is English';
registeredRecipe.applyToMessage(persian.win, engine);
check('flip to English: segment remains styled', persian.segment.getAttribute('data-rastchin-youtube-rtl'), 'true');
check('flip to English: text class remains', persian.segment.classList.contains('rastchin-youtube-rtl'), true);
check('flip to English: RTL direction class removed', persian.segment.classList.contains('rastchin-youtube-caption-dir-rtl'), false);
check('flip to English: LTR direction class added', persian.segment.classList.contains('rastchin-youtube-caption-dir-ltr'), true);
check('flip to English: window height still preserved', styleValue(persian.win, 'height'), '62px');

const disableCue = makeCaption('دوباره فارسی');
registeredRecipe.applyToMessage(disableCue.win, engine);
registeredRecipe.onDisable();
check('onDisable: segment attr removed', disableCue.segment.getAttribute('data-rastchin-youtube-rtl'), null);
check('onDisable: segment class removed', disableCue.segment.classList.contains('rastchin-youtube-rtl'), false);

// --- CSS contract: text-only styling for caption segments, no caption layout rules ---
const css = registeredRecipe.globalCss('code, pre');
const segmentRule = css.match(/\.ytp-caption-segment\.rastchin-youtube-rtl\s*\{([^}]*)\}/);
check('css: has caption segment text rule', !!segmentRule, true);
const segmentBody = segmentRule ? segmentRule[1] : '';
check('css: segment rule sets Vazirmatn', /font-family:[^;]*Vazirmatn/.test(segmentBody), true);
check('css: segment rule sets color var', /color:\s*var\(--rastchin-youtube-caption-color/.test(segmentBody), true);
check('css: segment rule sets font-size var', /font-size:\s*var\(--rastchin-youtube-caption-font-px/.test(segmentBody), true);
[
    'direction',
    'text-align',
    'unicode-bidi',
    'line-height',
    'display',
    'white-space',
    'height',
    'overflow',
    'width',
    'max-width',
    'max-height',
    'left',
    'right',
    'margin-left',
    'translate',
    'transform',
    'background',
    'padding',
    'border-radius',
    'opacity'
].forEach(property => {
    check(`css: segment rule does not set ${property}`, new RegExp(`${property}\\s*:`).test(segmentBody), false);
});
check('css: no caption-window RastChin layout selector', /\.caption-window\.rastchin-youtube-rtl/.test(css), false);
check('css: caption RTL metadata class has no CSS rule', /\.ytp-caption-segment\.rastchin-youtube-caption-dir-rtl\s*\{/.test(css), false);
check('css: caption LTR metadata class has no CSS rule', /\.ytp-caption-segment\.rastchin-youtube-caption-dir-ltr\s*\{/.test(css), false);
check('css: no caption prehide gate', /\.caption-window:not\(\.rastchin-youtube-seen\)/.test(css), false);
check('css: no unified background classes', /rastchin-youtube-bg-(?:ready|pending)/.test(css), false);
check('css: no rolling class rule', /rastchin-youtube-roll/.test(css), false);

// --- Safe caption size presets: small + medium only (v1.1.33) ---------------
// The large (130) preset was removed. The runtime snaps every stored value into
// {small:100, medium:120}, default medium, so an over-large legacy size can never
// reach the cue (medium is the crop-safe ceiling).
{
    const presets = exported.captionSizePresets;
    check('presets: small is 100', presets.small, 100);
    check('presets: medium is 120 (balanced default)', presets.medium, 120);
    check('presets: large preset removed', Object.prototype.hasOwnProperty.call(presets, 'large'), false);
    check('presets: exactly two presets', Object.keys(presets).length, 2);
    // Default (no stored value) resolves to the medium preset.
    exported.updateCaptionSettings({});
    check('presets: default font size is medium/120', exported.captionSettings.fontSize, 120);
    // The two live presets round-trip as-is.
    [100, 120].forEach(value => {
        exported.updateCaptionSettings({ youtubeCaptionFontSize: value });
        check(`presets: ${value}% stored as-is`, exported.captionSettings.fontSize, value);
    });
    // The removed large preset and any out-of-band legacy size snap into the band.
    [130, 140, 160].forEach(value => {
        exported.updateCaptionSettings({ youtubeCaptionFontSize: value });
        check(`presets: legacy ${value} snaps down to medium/120`, exported.captionSettings.fontSize, 120);
    });
    exported.updateCaptionSettings({ youtubeCaptionFontSize: 80 });
    check('presets: legacy 80 snaps up to small/100', exported.captionSettings.fontSize, 100);
    exported.updateCaptionSettings({ youtubeCaptionFontSize: 105 });
    check('presets: 105 snaps to nearest (small/100)', exported.captionSettings.fontSize, 100);
    exported.updateCaptionSettings({ youtubeCaptionFontSize: 115 });
    check('presets: 115 snaps to nearest (medium/120)', exported.captionSettings.fontSize, 120);
    // Exact equidistant tie-point: 110 is 10 from both, the reduce keeps the first
    // (small/100). Lock this boundary so a future refactor cannot flip it silently.
    exported.updateCaptionSettings({ youtubeCaptionFontSize: 110 });
    check('presets: 110 (equidistant) tie-breaks to small/100', exported.captionSettings.fontSize, 100);
    // px mapping mirrors the 15px preview base: 100% => 15px, 120% => 18px.
    check('presets: small maps to 15px', exported.captionFontPx(100), 15);
    check('presets: medium maps to 18px', exported.captionFontPx(120), 18);
    // The removed large value resolves to the medium px (snapped), never 19.5px.
    check('presets: 130 resolves to the medium px (18px), not 19.5px', exported.captionFontPx(130), 18);
    // Restore the default so any later shared state is the medium baseline.
    exported.updateCaptionSettings({});
}

if (failures) {
    console.error(`youtube-rtl.test.js: ${failures}/${total} failed`);
    process.exit(1);
}
console.log(`youtube-rtl.test.js: all ${total} checks passed`);
