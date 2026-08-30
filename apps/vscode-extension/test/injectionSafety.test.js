const assert = require('node:assert/strict');
const test = require('node:test');

const injections = require('../src/injections');
const patcher = require('../src/patcher');

const BUILDERS = [
  'buildClaudeCss',
  'buildClaudeJs',
  'buildClaudePlanCss',
  'buildClaudePlanJs',
  'buildCodexCss',
  'buildCodexJs',
];

const BACKTICK = String.fromCharCode(96);

// Strips the marker comments + (for the Plan JS/CSS) the <script>/<style> +
// {{NONCE}} wrapper so the bare runtime/CSS body can be inspected on its own.
function unwrap(source) {
  return source
    .replace(/<\/?script[^>]*>/g, '')
    .replace(/<\/?style[^>]*>/g, '')
    .replace(/\{\{NONCE\}\}/g, '')
    .replace(/^\/\*.*\*\/$/gm, '');
}

test('injection builders all return a non-empty string', () => {
  for (const name of BUILDERS) {
    const out = injections[name]();
    assert.equal(typeof out, 'string', `${name} must return a string`);
    assert.ok(out.length > 0, `${name} must not be empty`);
  }
});

test('injected JS runtimes are syntactically valid (parseable)', () => {
  // A SyntaxError in any of these would silently break the patched webview /
  // extension — exactly the class of failure that blanks a panel.
  for (const name of ['buildClaudeJs', 'buildClaudePlanJs', 'buildCodexJs']) {
    const body = unwrap(injections[name]());
    assert.doesNotThrow(() => new Function(body), `${name} produced invalid JS`);
  }
});

test('Plan Preview injection contains NO raw backtick', () => {
  // Regression guard: buildClaudePlanCss() + buildClaudePlanJs() are injected
  // into a JS template literal in Claude's extension.js. A raw backtick closes
  // that literal early -> SyntaxError on activation -> blank Claude panel.
  for (const name of ['buildClaudePlanCss', 'buildClaudePlanJs']) {
    const out = injections[name]();
    assert.equal(
      out.includes(BACKTICK),
      false,
      `${name} must not emit a raw backtick (breaks extension.js activation)`,
    );
    assert.equal(
      out.includes('${'),
      false,
      `${name} must not emit a raw \${ (breaks extension.js template literal)`,
    );
  }
});

test('Claude CSS builders have balanced braces', () => {
  for (const name of ['buildClaudeCss', 'buildClaudePlanCss']) {
    const css = injections[name]();
    const open = (css.match(/\{/g) || []).length;
    const close = (css.match(/\}/g) || []).length;
    assert.equal(open, close, `${name} has unbalanced braces (truncated rule?)`);
  }
});

test('runtime JS builders embed a grep-able RastChin runtime fingerprint', () => {
  // The fingerprint lets Status detect a stale injected patch without a reload.
  for (const name of ['buildClaudeJs', 'buildCodexJs', 'buildClaudePlanJs']) {
    const out = injections[name]();
    assert.match(out, /RastChin runtime [0-9a-f]{8} v[\d.]+/, `${name} must embed the runtime fingerprint`);
  }
  assert.match(injections.fingerprintComment(), /^\/\* RastChin runtime [0-9a-f]{8} v[\d.]+ \*\/$/);
  assert.equal(/^[0-9a-f]{8}$/.test(injections.RUNTIME_FP), true, 'RUNTIME_FP must be an 8-hex fingerprint');
});

test('fingerprint comment is template-literal safe (no backtick / ${ for the Plan patch)', () => {
  const fp = injections.fingerprintComment();
  assert.equal(fp.includes(BACKTICK), false);
  assert.equal(fp.includes('${'), false);
});

test('templateLiteralUnsafe flags raw backtick and ${, passes clean strings', () => {
  assert.equal(patcher.templateLiteralUnsafe('clean css { a: b }'), null);
  assert.equal(patcher.templateLiteralUnsafe('a' + BACKTICK + 'b'), 'backtick');
  assert.equal(patcher.templateLiteralUnsafe('x ${y} z'), '${');
  assert.equal(patcher.templateLiteralUnsafe(undefined), null);
});

test('guardPlanPayload aborts the write (changed:false) when a payload would break the host literal', () => {
  // Clean payloads -> no abort, patch proceeds.
  assert.equal(patcher.guardPlanPayload('safe css', 'safe js', 'Claude'), null);
  // Backtick in CSS -> abort, file left intact.
  const badCss = patcher.guardPlanPayload('a' + BACKTICK + 'b', 'ok js', 'Claude');
  assert.equal(badCss.changed, false);
  assert.match(badCss.messages[0], /aborted/i);
  // ${ in JS -> abort.
  const badJs = patcher.guardPlanPayload('ok css', 'x ${y}', 'Claude');
  assert.equal(badJs.changed, false);
  assert.match(badJs.messages[0], /aborted/i);
});

test('the real Plan Preview builders are write-safe (pass guardPlanPayload)', () => {
  // Ties the runtime fail-safe to the ACTUAL payload patchClaudePlan writes, so
  // a future change that introduces a backtick/${ fails this test before shipping.
  const css = injections.buildClaudePlanCss(patcher.fontDataUris());
  const js = injections.buildClaudePlanJs();
  assert.equal(patcher.guardPlanPayload(css, js, 'Claude'), null);
});
