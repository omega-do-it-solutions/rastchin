'use strict';
// Regression suite for the RTL engine's direction-detection logic.
// Run: `node test/rtl-engine.test.js` (or `pnpm test`). Exits non-zero on failure.
// Covers: needsRTL, stripLtrTokens, hasRtlLetter, and collectDirectionText
// (DOM code-exclusion + block boundaries) via a mock DOM. Browser-only behavior
// (live content-script injection / rendering) is NOT covered here.

const { makeEngine, el, t } = require('./engine-harness');

const engine = makeEngine();
const codeByFlag = makeEngine({ isCodeLike: n => n && n.__code === true });
const codeByClosest = makeEngine({ isCodeLike: n => !!(n && n.closest && n.closest('code')) });
// Mirrors the platforms' CODE_SELECTOR (tag + class-based code guards) so the
// suite exercises class-based code exclusion, not just <code>/<pre> tags.
const CODE_SELECTOR = 'code, pre, [class*="code"], [class*="Code"], [class*="language-"], [class*="hljs"], .monaco-editor, .cm-editor, [role="code"]';
const codeBySelector = makeEngine({ isCodeLike: n => !!(n && n.closest && n.closest(CODE_SELECTOR)) });

let failures = 0;
let assertions = 0;
function check(label, got, expected) {
    assertions += 1;
    const ok = got === expected;
    if (!ok) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

// --- needsRTL (default config) ---
const needsRTLCases = [
    ['plain Persian prose', 'این یک متن فارسی است', true],
    ['mixed FA/EN', 'خانه به انگلیسی یعنی home', true],
    ['Arabic prose (no Persian-specific letter)', 'هذا نص عربي مكتوب', true],
    ['3-char Arabic', 'ابر', true],
    ['length < 3 guard', 'سه', false],
    ['inline single-backtick code', 'const x = `کد`;', false],
    ['multi-backtick inline code', 'English ``سلام`` only', false],
    ['inline code + prose', 'این ``کد`` بعدی', true],
    ['email token + prose', 'نام ایمیل: user@example.com', true],
    ['Unicode email only', 'Contact user@مثال.ایران now', false],
    ['Unicode email + prose', 'ایمیل user@مثال.ایران را بفرست', true],
    ['URL + prose', 'این لینک https://example.com است', true],
    ['ASCII path + prose', 'مسیر فایل /usr/local/bin است', true],
    ['POSIX path with Persian segment only', 'Open /Users/mo/سلام.txt now', false],
    ['POSIX path with Persian segment + prose', 'مسیر /Users/mo/سلام.txt را باز کن', true],
    ['relative path with Persian segment only', 'Open ./docs/سلام.md now', false],
    ['home path with Persian segment only', 'Open ~/Desktop/سلام.md now', false],
    ['Windows path with Persian segment only', 'Open C:\\Users\\Mo\\سلام.txt now', false],
    ['UNC path with Persian segment only', 'Open \\\\server\\share\\سلام.txt now', false],
    ['file URL with Persian path only', 'Open file:///Users/mo/سلام.txt now', false],
    ['terminal npm command with Persian arg', 'npm install پکیج', false],
    ['terminal git command with Persian message', 'git commit -m "سلام"', false],
    ['terminal shell prompt with Persian output', '$ echo "سلام"', false],
    ['terminal user-host prompt with Persian output', 'mo@host:~/app$ echo سلام', false],
    ['terminal Windows prompt with Persian output', 'C:\\Users\\Mo> echo سلام', false],
    ['terminal error line with Persian', 'Error: فایل not found', false],
    ['Persian prose around terminal line', 'خروجی:\nnpm install پکیج\nتمام شد', true],
    ['inline command inside Persian prose', 'دستور npm install پکیج را اجرا کن', true],
    ['Markdown heading Persian is not a terminal prompt', '# سلام دنیا', true],
    ['Markdown quote Persian is not a terminal prompt', '> سلام دنیا', true],
    ['inline dollar math with Persian label only', '$x = سلام + 1$', false],
    ['inline dollar math + Persian prose', 'فرمول $x = سلام + 1$ را توضیح بده', true],
    ['inline paren math with Persian label only', '\\( x = سلام + 1 \\)', false],
    ['inline paren math + Persian prose', 'فرمول \\( x = سلام + 1 \\) را توضیح بده', true],
    ['display dollar math only', '$$\nx = سلام + 1\n$$', false],
    ['display dollar math + Persian prose', 'فرمول:\n$$\nx = سلام + 1\n$$\nتمام شد', true],
    ['display bracket math only', '\\[\nx = سلام + 1\n\\]', false],
    ['display bracket math + Persian prose', 'فرمول \\[ x = سلام + 1 \\] را ببین', true],
    ['Markdown pipe table only', '| نام | value |\n| --- | --- |\n| سلام | world |', false],
    ['Markdown pipe table + Persian prose', 'نتیجه:\n| نام | value |\n| --- | --- |\n| سلام | world |\nتمام شد', true],
    ['pipe table without edge pipes only', 'name | مقدار | count', false],
    ['TSV data row with Persian cell only', 'name\tسلام\tcount', false],
    ['TSV data row + Persian prose', 'داده:\nname\tسلام\tcount\nپایان', true],
    ['single pipe Persian prose is not a table', 'سلام | دنیا', true],
    ['Persian only inside URL path', 'Visit https://example.com/کتاب now', false],
    ['URL-only Persian path', 'https://example.com/سلام', false],
    ['Persian "؟" boundary keeps following prose', 'https://example.com/سلام؟این', true],
    ['complex URL :8080 ?q=1 + prose', 'این سرور https://example.com:8080/path?q=1 است', true],
    ['ASCII dot is URL-internal', 'https://example.com.سلام', false],
    ['file-extension dot inside URL', 'https://example.com/فایل.پسوند', false],
    ['colon inside URL', 'https://example.com/فایل:شناسه', false],
    ['URL stripped, prose survives', 'فایل را از https://example.com/فایل.پسوند بگیر', true],
    ['ASCII ? query value consumed', 'https://example.com/search?کلمه=foo', false],
    ['URL + query stripped, prose survives', 'نتیجه https://example.com/q?واژه=x را ببین', true],
    ['balanced-paren wiki slug (URL-only)', 'https://fa.wikipedia.org/wiki/سلام_(ابهام‌زدایی)', false],
    ['balanced-paren URL + prose', 'این مقاله https://fa.wikipedia.org/wiki/سلام_(ابهام‌زدایی) را ببین', true],
    ['prose-wrapped URL in parens', 'ببینید (https://example.com) را', true],
    ['balanced bracket in URL', 'https://example.com/a[x]b', false],
    ['trailing ؟ after URL (punctuation only)', 'https://fa.wikipedia.org/wiki/سلام_(ابهام‌زدایی)؟', false],
    ['closed ``` fence', '```\nسلام دنیا\n```', false],
    ['fence stripped, prose survives', 'توضیح\n```\nکد\n```\nتمام', true],
    ['open ``` fence to EOF', '```js\nconst x = "سلام";', false],
    ['closed ~~~ fence', '~~~\nکد فارسی\n~~~', false],
    ['mid-line ``` inside string is body', '```js\nconst fence = "```";\nconst msg = "سلام";\n```', false],
    ['line-start ~~~ inside ``` body is not a closer', '```\nکد\n~~~\nبیشتر\n```', false],
    ['4-tick closed fence', '````\nکد فارسی\n````', false],
    ['4-tick close, prose after survives', '````\nکد\n````\nبعد از کد', true],
    ['longer closer than opener, prose after', '```\nکد سلام\n````\nبعد از کد', true],
    ['shorter line inside 4-tick block is body', '````\nکد\n```\nبعد از کد\n````', false],
    // ratio scoring path (no Persian strong letters): Arabic minority → false, majority → true
    ['Arabic minority in English (ratio)', 'In this example هذا means this word here', false],
    ['Arabic majority with English words (ratio)', 'هذا النص العربي with some English', true],
    ['Arabic below 40% boundary (ratio)', 'text is here and هذا word now done', false],
    // boundary precision: at exactly 40% (2/5) and just below (3/8 = 37.5%)
    ['at 40% threshold (2/5 RTL, ratio)', 'هب abc', true],
    ['just below 40% (3/8 RTL, ratio)', 'هبا abcde', false],
];
for (const [label, text, expected] of needsRTLCases) {
    check(`needsRTL: ${label}`, engine.needsRTL(text), expected);
}

// --- stripLtrTokens ---
check('stripLtrTokens: URL-only -> empty', engine.stripLtrTokens('https://fa.wikipedia.org/wiki/سلام_(ابهام‌زدایی)').trim(), '');
const proseStrip = engine.stripLtrTokens('متن https://x.com است');
check('stripLtrTokens: URL removed from prose', /https?:|x\.com/.test(proseStrip), false);
check('stripLtrTokens: prose words kept', proseStrip.includes('متن') && proseStrip.includes('است'), true);
const codeStrip = engine.stripLtrTokens('کد `سلام` بعد');
check('stripLtrTokens: inline code content removed', codeStrip.includes('سلام'), false);
check('stripLtrTokens: code-surrounding prose kept', codeStrip.includes('کد') && codeStrip.includes('بعد'), true);
const pathStrip = engine.stripLtrTokens('Open C:\\Users\\Mo\\سلام.txt and /Users/mo/کتاب.pdf');
check('stripLtrTokens: Unicode Windows/POSIX paths removed', pathStrip.includes('سلام') || pathStrip.includes('کتاب'), false);
const emailStrip = engine.stripLtrTokens('Contact user@مثال.ایران now');
check('stripLtrTokens: Unicode email removed', emailStrip.includes('مثال') || emailStrip.includes('ایران'), false);
const terminalStrip = engine.stripLtrTokens('npm install پکیج\nError: فایل not found');
check('stripLtrTokens: terminal lines removed', terminalStrip.includes('پکیج') || terminalStrip.includes('فایل'), false);
const mathStrip = engine.stripLtrTokens('فرمول $x = سلام + 1$ و \\( y = دنیا \\)');
check('stripLtrTokens: inline math removed', mathStrip.includes('سلام') || mathStrip.includes('دنیا'), false);
check('stripLtrTokens: math-surrounding prose kept', mathStrip.includes('فرمول') && mathStrip.includes('و'), true);
const tableStrip = engine.stripLtrTokens('| نام | value |\n| سلام | world |\nمتن');
check('stripLtrTokens: table lines removed', tableStrip.includes('سلام') || tableStrip.includes('نام'), false);
check('stripLtrTokens: table-surrounding prose kept', tableStrip.includes('متن'), true);

// --- hasRtlLetter (claude's per-element decision) ---
const hasRtlCases = [
    ['short Persian "نه"', 'نه', true],
    ['short Persian "کی"', 'کی', true],
    ['Persian prose', 'سلام دنیا', true],
    ['lone Persian "؟" (punctuation)', '؟', false],
    ['lone Persian "،" (punctuation)', '،', false],
    ['Persian-Indic digits', '۱۲۳', false],
    ['English only', 'English only', false],
    ['URL-only Persian + trailing ؟', 'https://fa.wikipedia.org/wiki/سلام_(ابهام‌زدایی)؟', false],
    ['URL-only Persian path', 'https://x.com/سلام', false],
    ['terminal command only', 'npm install پکیج', false],
    ['terminal error only', 'Error: فایل not found', false],
    ['inline math only', '$x = سلام + 1$', false],
    ['display math only', '$$\nx = سلام + 1\n$$', false],
    ['Markdown table only', '| نام | value |\n| سلام | world |', false],
    ['TSV row only', 'name\tسلام\tcount', false],
    ['prose around URL', 'این مقاله https://x.com/سلام را ببین', true],
    ['inline code only', '`سلام`', false],
    ['inline code + real letters', 'کد `سلام` بعد', true],
];
for (const [label, text, expected] of hasRtlCases) {
    check(`hasRtlLetter: ${label}`, engine.hasRtlLetter(text), expected);
}

// --- collectDirectionText (DOM code-exclusion + block boundaries) ---
const decide = (eng, root) => eng.needsRTL(eng.collectDirectionText(root).trim());

check(
    'DOM: Persian nested in flagged <pre> excluded',
    decide(codeByFlag, el('div', {}, t('English '), el('pre', { code: true }, el('span', {}, t('سلام دنیا'))), t(' only'))),
    false
);
check(
    'DOM: non-code Persian kept',
    decide(codeByFlag, el('div', {}, t('توضیح فارسی '), el('code', { code: true }, t('x')))),
    true
);
check(
    'DOM: inline split URL stays contiguous (URL-only)',
    decide(engine, el('a', {}, t('https://example.com/'), el('span', {}, t('سلام')))),
    false
);
check(
    'DOM: block <p>|<p> boundary separates URL block from Persian block',
    decide(engine, el('div', {}, el('p', {}, t('https://example.com/کتاب')), el('p', {}, t('سلام')))),
    true
);
check(
    'DOM: code pruned + <br> + prose-after survives',
    decide(codeByFlag, el('div', {}, t('code: '), el('code', { code: true }, t('کد')), el('br'), t('بعدی'))),
    true
);
check(
    'DOM: closest-based isCodeLike excludes nested <code>',
    decide(codeByClosest, el('div', {}, t('English text '), el('span', {}, el('code', {}, t('سلام'))), t(' end'))),
    false
);
check(
    'DOM: closest-based isCodeLike keeps non-code Persian',
    decide(codeByClosest, el('div', {}, t('متن فارسی '), el('code', {}, t('x')))),
    true
);
// CODE_SELECTOR (tag + class-based) code guards — mirrors the platform walkers.
check(
    'DOM: pre > code > span Persian excluded (CODE_SELECTOR)',
    decide(codeBySelector, el('pre', {}, el('code', {}, el('span', {}, t('سلام'))))),
    false
);
check(
    'DOM: class-based code guard [class*="language-"] excluded',
    decide(codeBySelector, el('div', { cls: 'language-js' }, el('span', {}, t('سلام')))),
    false
);
check(
    'DOM: .hljs code guard excluded (as descendant)',
    decide(codeBySelector, el('div', {}, t('see: '), el('div', { cls: 'hljs' }, t('کد سلام')))),
    false
);
check(
    'DOM: non-code class container keeps Persian (negative control)',
    decide(codeBySelector, el('div', { cls: 'content' }, el('p', {}, t('سلام دنیا')))),
    true
);
check(
    'DOM: uppercase [class*="Code"] guard excluded',
    decide(codeBySelector, el('div', {}, t('en '), el('div', { cls: 'myCodeBlock' }, el('span', {}, t('سلام'))))),
    false
);
check(
    'DOM: .monaco-editor guard excluded',
    decide(codeBySelector, el('div', {}, t('en '), el('div', { cls: 'monaco-editor' }, t('کد سلام')))),
    false
);
check(
    'DOM: [role="code"] guard excluded',
    decide(codeBySelector, el('div', {}, t('en '), el('div', { role: 'code' }, t('کد سلام')))),
    false
);

// --- dynamic restore ---
{
    const dynamicEngine = makeEngine({ rtlClass: 'rc-rtl' });
    const paragraph = el('p', {}, t('سلام دنیا'));
    const message = el('div', {}, paragraph);

    dynamicEngine.applyToMessage(message);
    check('dynamic restore: root gets dir after Persian text', message.getAttribute('dir'), 'rtl');
    check('dynamic restore: child gets dir after Persian text', paragraph.getAttribute('dir'), 'rtl');
    check('dynamic restore: child gets rtl class', paragraph.classList.contains('rc-rtl'), true);

    paragraph.childNodes[0].textContent = 'https://example.com/سلام';
    dynamicEngine.applyToMessage(message);
    check('dynamic restore: root dir removed after URL-only mutation', message.getAttribute('dir'), null);
    check('dynamic restore: child dir removed after URL-only mutation', paragraph.getAttribute('dir'), null);
    check('dynamic restore: child class removed after URL-only mutation', paragraph.classList.contains('rc-rtl'), false);
    check('dynamic restore: styled element map drained', dynamicEngine.styledElements.size, 0);
}
check(
    'DOM: hidden attr Persian excluded',
    decide(engine, el('div', {}, t('English '), el('span', { hidden: true }, t('سلام دنیا')), t(' only'))),
    false
);
check(
    'DOM: aria-hidden Persian excluded',
    decide(engine, el('div', {}, t('English '), el('span', { ariaHidden: true }, t('سلام دنیا')), t(' only'))),
    false
);
check(
    'DOM: display none Persian excluded',
    decide(engine, el('div', {}, t('English '), el('span', { computedStyle: { display: 'none' } }, t('سلام دنیا')), t(' only'))),
    false
);
check(
    'DOM: visibility hidden Persian excluded',
    decide(engine, el('div', {}, t('English '), el('span', { computedStyle: { visibility: 'hidden' } }, t('سلام دنیا')), t(' only'))),
    false
);
check(
    'DOM: sr-only Persian excluded',
    decide(engine, el('div', {}, t('English '), el('span', { cls: 'sr-only' }, t('سلام دنیا')), t(' only'))),
    false
);
check(
    'DOM: hidden Persian ignored while visible Persian survives',
    decide(engine, el('div', {}, el('span', { hidden: true }, t('hidden سلام')), el('p', {}, t('متن فارسی')))),
    true
);

// g-flag regression: rtlRegex with /g flag must not corrupt lastIndex across loop iterations
const engineG = makeEngine({ rtlRegex: /\p{Script=Arabic}/gu });
check('needsRTL: g-flag rtlRegex works correctly', engineG.needsRTL('هذا النص العربي with some English'), true);

if (failures === 0) {
    console.log(`ALL PASS (${assertions} assertions)`);
    process.exit(0);
} else {
    console.log(`\n${failures} FAILED of ${assertions}`);
    process.exit(1);
}
