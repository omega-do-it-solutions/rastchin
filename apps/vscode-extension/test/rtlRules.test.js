const assert = require('node:assert/strict');
const test = require('node:test');

const rules = require('../src/rtlRules');

test('detects Persian text outside Markdown code', () => {
  assert.equal(rules.containsRtlOutsideCode('سلام Codex'), true);
  assert.equal(rules.containsRtlOutsideCode('plain English only'), false);
  assert.equal(rules.containsRtlOutsideCode('```js\nconst label = "سلام";\n```'), false);
  assert.equal(rules.containsRtlOutsideCode('`سلام` outside English'), false);
});

test('resolves mixed Persian and English prose direction', () => {
  assert.equal(rules.directionForText('سلام Codex'), 'rtl');
  assert.equal(rules.directionForText('Codex rounds: 24 -> 32 و همه تایید شد'), 'ltr');
  assert.equal(rules.directionForText('stale RTL runtime را با Re-apply Patches تازه کن تا چت درست شود.'), 'rtl');
  assert.equal(rules.directionForText('language server/file watcher بعد از reload باید دوباره بررسی شود.'), 'rtl');
  assert.equal(rules.directionForText('English only'), 'ltr');
});

test('keeps URLs, email addresses, terminal output, and diffs LTR', () => {
  assert.equal(rules.shouldKeepLtrText('https://example.com/مسیر'), true);
  assert.equal(rules.shouldKeepLtrText('user@example.com'), true);
  assert.equal(rules.shouldKeepLtrText('$ npm test'), true);
  assert.equal(rules.shouldKeepLtrText('diff --git a/file b/file'), true);
  assert.equal(rules.directionForText('https://example.com/مسیر'), 'ltr');
  assert.equal(rules.directionForText('git commit -m "افزودن پشتیبانی RTL"'), 'ltr');
  assert.equal(rules.directionForText('src/گزارش.md'), 'ltr');
});

test('keeps table order LTR and applies direction per cell', () => {
  assert.deepEqual(rules.tableDirection(['Name', 'توضیح', 'user@example.com']), {
    table: 'ltr',
    cells: ['ltr', 'rtl', 'ltr'],
  });
});

test('mirrors arrows only next to Persian prose', () => {
  assert.equal(rules.shouldMirrorArrow('مرحله ', ' بعدی'), true);
  assert.equal(rules.shouldMirrorArrow('cmd ', ' out'), false);
  assert.equal(rules.shouldMirrorArrow('git ', ' بعدش'), true);
  assert.deepEqual(rules.arrowMirrorPlan('cmd -> out').map((item) => item.mirror), []);
  assert.deepEqual(rules.arrowMirrorPlan('مرحله → بعدی').map((item) => item.mirror), [true]);
});

test('Codex multi-choice card fragments resolve direction correctly', () => {
  // Persian question / option labels -> RTL
  assert.equal(rules.directionForText('آیا این تغییرات را کامیت کنم؟'), 'rtl');
  assert.equal(rules.directionForText('بله، همه تغییرات را کامیت کن'), 'rtl');
  assert.equal(rules.directionForText('نه، فعلاً صبر کن'), 'rtl');

  // Commands, file paths, English-only labels -> LTR
  assert.equal(rules.directionForText('git commit -m "افزودن پشتیبانی RTL"'), 'ltr');
  assert.equal(rules.directionForText('src/injections.js'), 'ltr');
  assert.equal(rules.directionForText('Run npm run package instead'), 'ltr');

  // A Persian label that embeds an inline command stays Persian-first (RTL),
  // while the command itself is excluded from detection.
  assert.equal(rules.directionForText('اول این را اجرا کن: `npm test`'), 'rtl');
  assert.equal(rules.containsRtlOutsideCode('`npm test`'), false);
});
