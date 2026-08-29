const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { JSDOM } = require('jsdom');
const injections = require('../src/injections');

// Loads the Codex multi-choice card fixture into a jsdom window, injects the
// generated Codex webview runtime, and runs its DOMContentLoaded boot pass.
function renderCard() {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'codex-multi-choice-card.html'), 'utf8');
  const dom = new JSDOM(html);
  const { window } = dom;
  const raf = (cb) => setTimeout(cb, 0);
  const runtime = injections.buildCodexJs().replace(/^\/\*.*\*\/$/gm, '');
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, window.MutationObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  // The real webview loads the script with `defer`, so DOMContentLoaded fires
  // after parse. jsdom keeps readyState 'loading', so dispatch it explicitly.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window.document;
}

test('Codex card: Persian question and option labels become RTL', () => {
  const doc = renderCard();
  const question = doc.querySelector('[data-role="question"]');
  assert.equal(question.getAttribute('dir'), 'rtl');
  assert.equal(question.classList.contains('YBYrtlClean'), true);

  const yes = doc.querySelector('[data-id="yes"]');
  const no = doc.querySelector('[data-id="no"]');
  assert.equal(yes.getAttribute('dir'), 'rtl', 'Persian option row should be RTL');
  assert.equal(no.getAttribute('dir'), 'rtl', 'Persian option row should be RTL');
});

test('Codex card: code, commands and file paths stay LTR', () => {
  const doc = renderCard();
  const inlineCode = doc.querySelector('[data-role="question"] code');
  const commandBlock = doc.querySelector('[data-role="command-block"] code');
  const pathCode = doc.querySelector('[data-role="description"] code');

  assert.notEqual(inlineCode.getAttribute('dir'), 'rtl', 'inline git command must not be RTL');
  assert.notEqual(commandBlock.getAttribute('dir'), 'rtl', 'command block must not be RTL');
  assert.notEqual(pathCode.getAttribute('dir'), 'rtl', 'file path must not be RTL');
  // code elements must never get our RTL class
  assert.equal(inlineCode.classList.contains('YBYrtlClean'), false);
  assert.equal(commandBlock.classList.contains('YBYrtlClean'), false);
});

test('Codex card: English-only option stays LTR', () => {
  const doc = renderCard();
  const englishOnly = doc.querySelector('[data-id="english-only"]');
  assert.notEqual(englishOnly.getAttribute('dir'), 'rtl');
  assert.equal(englishOnly.classList.contains('YBYrtlClean'), false);
});

test('Codex card: mixed Persian label with inline command keeps command LTR', () => {
  const doc = renderCard();
  const review = doc.querySelector('[data-id="review"]');
  const reviewCode = review.querySelector('code');
  // The row is Persian-first, so the row is RTL...
  assert.equal(review.getAttribute('dir'), 'rtl');
  // ...but the embedded command must remain LTR / unstyled.
  assert.notEqual(reviewCode.getAttribute('dir'), 'rtl');
  assert.equal(reviewCode.classList.contains('YBYrtlClean'), false);
});

test('Codex card: option row with leading numeric indicator still becomes RTL', () => {
  const doc = renderRoot(`
    <div data-codex-approval-surface="true">
      <div class="flex flex-col" role="radiogroup">
        <button role="radio" data-id="numbered">
          <span class="indicator">1</span>
          <span class="label">گزینه فارسی با شماره</span>
        </button>
      </div>
    </div>`);
  const option = doc.querySelector('[data-id="numbered"]');
  assert.equal(option.getAttribute('dir'), 'rtl');
  assert.equal(option.classList.contains('YBYrtlClean'), true);
});

function renderRoot(inner) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${inner}</div></body></html>`);
  const { window } = dom;
  const raf = (cb) => setTimeout(cb, 0);
  const runtime = injections.buildCodexJs().replace(/^\/\*.*\*\/$/gm, '');
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, window.MutationObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window.document;
}

const OPTION_PICKER_GROUP_CLASS = 'flex flex-wrap gap-2 px-3 pb-4';
const OPTION_PICKER_PILL_CLASS = 'border-token-border bg-token-background hover:bg-token-foreground/5 cursor-interaction rounded-full border px-3 py-1.5 text-sm leading-5 focus:outline-none';

test('Codex card: a question holding its own text above the options is still RTL', () => {
  // Robustness: container has BOTH its own direct Persian text AND a Persian
  // child block. The question must not be skipped in favour of the child.
  const doc = renderRoot(`
    <div data-codex-approval-surface="true">
      <div class="q">سوال مستقیم بالای گزینه‌ها؟
        <div class="flex flex-col" role="radiogroup">
          <button role="radio"><span class="lbl">گزینه فارسی</span></button>
        </div>
      </div>
    </div>`);
  assert.equal(doc.querySelector('.q').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[role="radio"]').getAttribute('dir'), 'rtl');
});

test('Codex request_user_input card: mixed Persian title above the radiogroup becomes RTL', () => {
  // Current Codex no longer wraps the title in the radiogroup or the older
  // approval surface. It exposes data-codex-composer-request-navigation on the
  // whole request card. This mirrors the live Plan-mode question DOM and the
  // mixed title from the reported screenshot.
  const doc = renderRoot(`
    <div data-codex-composer-request-navigation="true" class="request-card">
      <div class="header-row">
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex min-w-0 flex-col gap-0.5">
            <div class="min-w-0 text-size-chat leading-5 font-medium wrap-anywhere text-default" data-id="request-title">کدام حالت را برای تست لینک https://example.com/docs و فایل src/patcher.js انتخاب می‌کنید؟</div>
          </div>
        </div>
      </div>
      <div role="radiogroup">
        <button role="radio" data-id="request-choice">
          <span>Mixed content</span>
          <span>متن فارسی با English words و لینک https://openai.com نمایش داده می‌شود.</span>
        </button>
      </div>
    </div>`);

  const title = doc.querySelector('[data-id="request-title"]');
  const choice = doc.querySelector('[data-id="request-choice"]');
  assert.equal(title.getAttribute('dir'), 'rtl', 'request title outside radiogroup must be RTL');
  assert.equal(title.classList.contains('YBYrtlClean'), true);
  assert.equal(title.classList.contains('fa-text-clean'), true, 'title must receive Vazirmatn hook');
  assert.equal(choice.getAttribute('dir'), 'rtl', 'mixed Persian choice remains RTL');
});

test('Codex request_user_input CSS owns title direction and font with important rules', () => {
  const css = injections.buildCodexCss();
  assert.match(
    css,
    /#root \[data-codex-composer-request-navigation\] \.YBYrtlClean,[\s\S]*?direction: rtl !important;[\s\S]*?font-family: var\(--persian-rtl-clean-font-family\) !important;/,
  );
});

test('Codex approval drift: bare radiogroup (no surface attr) still flips question + options RTL, code/English stay LTR', () => {
  // Drift scenario: the stable [data-codex-approval-surface] hook has disappeared
  // from the bundle. The approval card is still recognizable by its option group
  // role. Options flip via the existing radiogroup card path; the question that
  // sits ABOVE the options (outside the group) must still flip via the role-based
  // container fallback.
  const doc = renderRoot(`
    <div class="approval-container">
      <div class="px-4" data-role="question">آیا این تغییرات را با دستور <code data-role="cmd">git commit</code> کامیت کنم؟</div>
      <div class="flex flex-col" role="radiogroup">
        <button role="radio" data-id="fa-yes"><span class="indicator"></span><span class="label">بله، کامیت کن</span></button>
        <button role="radio" data-id="fa-run"><span class="label">اول این را اجرا کن: <code data-role="inline">npm test</code></span></button>
        <button role="radio" data-id="en-only"><span class="label">Run npm run package instead</span></button>
      </div>
    </div>`);
  const question = doc.querySelector('[data-role="question"]');
  const cmd = doc.querySelector('[data-role="cmd"]');
  const faYes = doc.querySelector('[data-id="fa-yes"]');
  const faRun = doc.querySelector('[data-id="fa-run"]');
  const inline = doc.querySelector('[data-role="inline"]');
  const enOnly = doc.querySelector('[data-id="en-only"]');

  assert.equal(question.getAttribute('dir'), 'rtl', 'question must flip RTL even without data-codex-approval-surface');
  assert.equal(question.classList.contains('YBYrtlClean'), true);
  assert.equal(faYes.getAttribute('dir'), 'rtl', 'Persian option must be RTL via role fallback');
  assert.equal(faRun.getAttribute('dir'), 'rtl');
  assert.notEqual(cmd.getAttribute('dir'), 'rtl', 'inline git command must stay LTR');
  assert.equal(cmd.classList.contains('YBYrtlClean'), false);
  assert.notEqual(inline.getAttribute('dir'), 'rtl', 'inline npm command must stay LTR');
  assert.equal(inline.classList.contains('YBYrtlClean'), false);
  assert.notEqual(enOnly.getAttribute('dir'), 'rtl', 'English-only option must stay LTR');
  assert.equal(enOnly.classList.contains('YBYrtlClean'), false);
});

test('Codex approval: surface present makes the role fallback a strict no-op (container not flipped)', () => {
  // When the stable surface attribute IS present the fallback must not fire, so a
  // neutral wrapper around the surface keeps its normal direction (no over-reach).
  const doc = renderRoot(`
    <div class="outer-wrapper" data-id="outer">
      <div data-codex-approval-surface="true">
        <div class="flex flex-col" role="radiogroup">
          <button role="radio" data-id="opt"><span class="label">گزینه فارسی</span></button>
        </div>
      </div>
    </div>`);
  assert.equal(doc.querySelector('[data-id="opt"]').getAttribute('dir'), 'rtl');
  // The fallback walks group.parentElement; with the surface present it is gated
  // off, so the surface's own parent (the data-codex-approval-surface div) is not
  // turned into a flipped card by the fallback.
  assert.notEqual(doc.querySelector('[data-id="outer"]').getAttribute('dir'), 'rtl');
});

test('Codex approval: a Persian option streamed in after mount becomes RTL', async () => {
  const doc = renderRoot(`
    <div data-codex-approval-surface="true">
      <div class="flex flex-col" role="radiogroup">
        <button role="radio" data-id="first"><span class="label">گزینه اول</span></button>
      </div>
    </div>`);
  const group = doc.querySelector('[role="radiogroup"]');
  assert.equal(doc.querySelector('[data-id="first"]').getAttribute('dir'), 'rtl');

  // Options stream/update live as the model proposes them; a late-added Persian
  // option must be picked up by the runtime's mutation observer and flipped.
  const btn = doc.createElement('button');
  btn.setAttribute('role', 'radio');
  btn.setAttribute('data-id', 'streamed');
  btn.innerHTML = '<span class="label">گزینه دوم که بعداً اضافه شد</span>';
  group.appendChild(btn);
  await new Promise((resolve) => setTimeout(resolve, 10));

  const streamed = doc.querySelector('[data-id="streamed"]');
  assert.equal(streamed.getAttribute('dir'), 'rtl', 'streamed-in option must become RTL');
  assert.equal(streamed.classList.contains('YBYrtlClean'), true);
});

test('Codex approval drift: a bare radiogroup streamed in as a top-level node still flips its question', async () => {
  // Drift + streaming edge: the surface attribute is gone AND the bare radiogroup
  // is itself the mutation node (not a descendant of the scanned node). The
  // self/host entry points of scanApprovalGroups must still flip the question that
  // already sits in the group's container.
  const doc = renderRoot(`
    <div class="approval-container" data-id="container">
      <div class="px-4" data-role="question2">آیا ادامه دهم؟</div>
    </div>`);
  const container = doc.querySelector('[data-id="container"]');
  const group = doc.createElement('div');
  group.setAttribute('role', 'radiogroup');
  group.innerHTML = '<button role="radio" data-id="late-opt"><span class="label">بله، ادامه بده</span></button>';
  container.appendChild(group);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(doc.querySelector('[data-role="question2"]').getAttribute('dir'), 'rtl', 'question flips once the bare radiogroup mounts');
  assert.equal(doc.querySelector('[data-id="late-opt"]').getAttribute('dir'), 'rtl', 'late-added option must be RTL');
});

test('Codex option_picker drift: bare role=radio pills (no surface, no radiogroup) flip RTL; inline command stays LTR', () => {
  // The model-driven option_picker renders its pills as bare role="radio"
  // buttons inside a plain flex container -- no data-codex-approval-surface and
  // no role="radiogroup", so neither the surface path nor the radiogroup
  // fallback reaches them. The bare-option fallback must still flip the Persian
  // question above the pills and the Persian pill labels, while an inline command
  // inside a pill stays LTR and an English-only pill is left untouched.
  const doc = renderRoot(`
    <div class="option-picker" data-id="picker">
      <form>
        <div class="px-4" data-role="ask">کدام فایل را ویرایش کنم؟</div>
        <div class="${OPTION_PICKER_GROUP_CLASS}">
          <button class="${OPTION_PICKER_PILL_CLASS}" type="button" role="radio" data-id="pill-fa"><span class="label">فایل اول را ویرایش کن</span></button>
          <button class="${OPTION_PICKER_PILL_CLASS}" type="button" role="radio" data-id="pill-code"><span class="label">این را اجرا کن: <code data-role="cmd">npm test</code></span></button>
          <button class="${OPTION_PICKER_PILL_CLASS}" type="button" role="radio" data-id="pill-en"><span class="label">Skip this step</span></button>
        </div>
      </form>
    </div>`);
  assert.equal(doc.querySelector('[data-role="ask"]').getAttribute('dir'), 'rtl', 'option_picker question must flip with no surface/radiogroup');
  assert.equal(doc.querySelector('[data-id="pill-fa"]').getAttribute('dir'), 'rtl', 'Persian pill must flip RTL');
  assert.equal(doc.querySelector('[data-id="pill-fa"]').classList.contains('YBYrtlClean'), true);
  assert.equal(doc.querySelector('[data-id="pill-code"]').getAttribute('dir'), 'rtl', 'Persian pill with an inline command flips RTL');
  const cmd = doc.querySelector('[data-role="cmd"]');
  assert.notEqual(cmd.getAttribute('dir'), 'rtl', 'inline command inside a bare pill must stay LTR');
  assert.equal(cmd.classList.contains('YBYrtlClean'), false);
  assert.notEqual(doc.querySelector('[data-id="pill-en"]').getAttribute('dir'), 'rtl', 'English-only pill stays LTR');
  assert.equal(doc.querySelector('[data-id="pill-en"]').classList.contains('YBYrtlClean'), false);
});

test('Codex option_picker drift: a bare pill whose Persian label starts with a Latin word is still forced RTL', () => {
  // firstStrongDir alone would call a "npm را ..." label LTR; bare options are
  // treated as card-options so any Persian-containing pill is forced RTL, keeping
  // the radio/checkbox indicator on the correct side.
  const doc = renderRoot(`
    <div data-id="picker2">
      <form>
        <div class="${OPTION_PICKER_GROUP_CLASS}">
          <button class="${OPTION_PICKER_PILL_CLASS}" type="button" role="checkbox" data-id="latin-first"><span class="label">npm را روی پروژه اجرا کن</span></button>
        </div>
      </form>
    </div>`);
  assert.equal(doc.querySelector('[data-id="latin-first"]').getAttribute('dir'), 'rtl', 'Latin-first Persian pill must be forced RTL');
  assert.equal(doc.querySelector('[data-id="latin-first"]').classList.contains('YBYrtlClean'), true);
});

test('Codex option_picker drift: a bare pill streamed in after mount becomes RTL', async () => {
  // The option_picker streams its choices in; a late-added bare pill must be
  // caught by the mutation observer (scan -> scanCards -> scanBareOptions).
  const doc = renderRoot(`
    <div class="option-picker" data-id="picker3">
      <form>
        <div class="${OPTION_PICKER_GROUP_CLASS}" data-id="pills3"></div>
      </form>
    </div>`);
  const pills = doc.querySelector('[data-id="pills3"]');
  const btn = doc.createElement('button');
  btn.setAttribute('role', 'radio');
  btn.setAttribute('type', 'button');
  btn.className = OPTION_PICKER_PILL_CLASS;
  btn.setAttribute('data-id', 'streamed-pill');
  btn.innerHTML = '<span class="label">گزینه‌ای که بعداً استریم شد</span>';
  pills.appendChild(btn);
  await new Promise((resolve) => setTimeout(resolve, 10));

  const streamed = doc.querySelector('[data-id="streamed-pill"]');
  assert.equal(streamed.getAttribute('dir'), 'rtl', 'streamed-in bare pill must become RTL');
  assert.equal(streamed.classList.contains('YBYrtlClean'), true);
});

test('Codex option_picker: unrelated bare Persian radio/checkbox controls are not treated as approval pills', () => {
  // The fallback is for the specific option_picker pill shape, not every bare
  // role=radio/checkbox in Codex. A Persian settings-like control outside a
  // form/rounded-pill option cluster must not pull its parent into watchCard.
  const doc = renderRoot(`
    <div data-id="prefs">
      <div data-id="prefs-title">گزینه‌های تنظیمات فارسی</div>
      <div class="flex flex-wrap">
        <button role="checkbox" data-id="pref-fa"><span>گزینه فارسی غیرمرتبط</span></button>
      </div>
    </div>`);

  assert.notEqual(doc.querySelector('[data-id="pref-fa"]').getAttribute('dir'), 'rtl', 'unrelated bare Persian checkbox must not be forced RTL');
  assert.equal(doc.querySelector('[data-id="pref-fa"]').classList.contains('YBYrtlClean'), false);
  assert.notEqual(doc.querySelector('[data-id="prefs-title"]').getAttribute('dir'), 'rtl', 'unrelated parent text must not be scanned by bare-option fallback');
  assert.notEqual(doc.querySelector('[data-id="prefs"]').getAttribute('dir'), 'rtl', 'unrelated parent must not be flipped');
});

test('Codex option_picker: bare-option fallback never over-reaches (English pills + radiogroup grandparent untouched)', () => {
  // Regression guardrail: the bare-option fallback is Persian-gated and is a
  // strict no-op for radiogroup-wrapped groups (settings, feedback). English
  // pills are never flipped/tagged, and a radiogroup option must not pull its
  // grandparent container into a flipped card via the bare-option fallback.
  const doc = renderRoot(`
    <div data-id="grandparent">
      <div class="english-picker">
        <div class="flex flex-wrap">
          <button role="radio" data-id="en-pill"><span>Approve</span></button>
          <button role="radio" data-id="en-pill2"><span>Deny</span></button>
        </div>
      </div>
      <div class="settings" data-id="rg-grandparent">
        <div role="radiogroup">
          <button role="radio" data-id="rg-opt"><span>English option</span></button>
        </div>
      </div>
    </div>`);
  assert.notEqual(doc.querySelector('[data-id="en-pill"]').getAttribute('dir'), 'rtl', 'English bare pill stays LTR');
  assert.equal(doc.querySelector('[data-id="en-pill"]').classList.contains('YBYrtlClean'), false);
  assert.notEqual(doc.querySelector('[data-id="rg-grandparent"]').getAttribute('dir'), 'rtl', 'radiogroup grandparent not flipped by bare-option fallback');
  assert.notEqual(doc.querySelector('[data-id="grandparent"]').getAttribute('dir'), 'rtl', 'top container not over-reached');
});

test('Codex injection exposes the bare-option approval fallback (role-based option_picker hook)', () => {
  const js = injections.buildCodexJs();
  assert.equal(js.includes('APPROVAL_OPTION_SEL'), true);
  assert.equal(js.includes('scanBareOptions'), true);
  assert.equal(js.includes('bareOptionFallback'), true);
  assert.equal(/role=\\?"radio\\?"/.test(js), true);
  assert.equal(/role=\\?"checkbox\\?"/.test(js), true);
});

test('Codex injection: bare-option hook is Codex-only (Claude runtime stays a strict no-op)', () => {
  // The Non-goal guardrail: Claude Code UI must not be affected. Claude's runtime
  // never receives approvalOptionSelector, so APPROVAL_OPTION_SEL is empty there
  // and scanBareOptions returns immediately.
  const claudeJs = injections.buildClaudeJs();
  assert.equal(claudeJs.includes('var APPROVAL_OPTION_SEL = "";'), true, 'Claude must not enable the bare-option hook');
});

test('Codex composer: Persian textarea becomes RTL and uses clean class', () => {
  const doc = renderRoot(`
    <div data-codex-composer>
      <textarea>لطفاً این متن را راست‌چین کن</textarea>
    </div>`);
  const composer = doc.querySelector('[data-codex-composer]');
  const textarea = doc.querySelector('textarea');

  assert.equal(composer.getAttribute('dir'), 'rtl');
  assert.equal(composer.classList.contains('YBYrtlClean'), true);
  assert.equal(textarea.getAttribute('dir'), 'rtl');
  assert.equal(textarea.classList.contains('YBYrtlClean'), true);
});

test('Codex composer: textarea updates direction after input', async () => {
  const doc = renderRoot(`
    <div data-codex-composer>
      <textarea>Run npm test</textarea>
    </div>`);
  const textarea = doc.querySelector('textarea');
  assert.notEqual(textarea.getAttribute('dir'), 'rtl');

  textarea.value = 'یک پیام فارسی برای تست composer';
  textarea.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(textarea.getAttribute('dir'), 'rtl');
  assert.equal(textarea.classList.contains('YBYrtlClean'), true);
});

test('Codex composer: mixed English-first draft stays LTR while Persian-first stays RTL', async () => {
  const doc = renderRoot(`
    <div data-codex-composer>
      <div data-id="field" contenteditable="true">Every thing is ok پیام فارسی تست در پرامپت</div>
    </div>`);
  const field = doc.querySelector('[data-id="field"]');

  assert.equal(field.getAttribute('dir'), 'ltr', 'an English-first draft must not flip because Persian is dominant later');
  assert.equal(field.classList.contains('YBYrtlClean'), false, 'the legacy !important RTL class must not contradict dir=ltr');
  assert.equal(field.classList.contains('fa-ltr-clean'), true);

  field.textContent = 'پیام فارسی تست در پرامپت with an English suffix';
  field.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(field.getAttribute('dir'), 'rtl', 'a Persian-first draft should align RTL');
  assert.equal(field.classList.contains('YBYrtlClean'), true);
  assert.equal(field.classList.contains('fa-ltr-clean'), false);
});

test('Codex CSS: editable composer resolves bidi per paragraph', () => {
  const css = injections.buildCodexCss();
  assert.match(
    css,
    /\[data-codex-composer\] \[contenteditable="true"\][^}]*unicode-bidi: plaintext !important;/,
  );
});

test('Codex user bubble: real DOM bubble + span-wrapped prose both go RTL, code stays LTR', () => {
  // Faithful to the real Codex bundle (local-conversation-turn / user-message-
  // attachments / user-formatted-text): a scroll-anchor wraps an items-end
  // column; the visible bubble carries [data-user-message-bubble] and a
  // hardcoded `text-left`; the prompt text is a DIV.whitespace-pre-wrap (not a
  // <p>). CRITICAL: user-formatted-text renders every prose run as a <span>
  // (kind==='text' -> jsx('span', ...)), so the DIV has NO direct Persian text
  // node — all its children are elements (span/code). Without the applyText
  // bypass for in-user-message prose blocks, hasRtlChildBlock && !hasOwnDirectRtlText
  // makes the runtime skip the DIV (only the inner span flips), the DIV never
  // gets the clean class, and the wrap-fix CSS rule never matches -> the live
  // drift. A direct-text-node fixture hides this bug, so we span-wrap here.
  const doc = renderRoot(`
    <div class="scroll-mt-4" data-local-conversation-user-anchor="true">
      <div class="flex flex-col items-end gap-2">
        <div data-user-message-bubble="true" role="button" tabindex="0"
             class="bg-token-foreground/5 max-w-[77%] min-w-0 overflow-hidden break-words rounded-2xl px-3 py-2 text-left">
          <div class="flex flex-col items-end gap-1">
            <div class="text-size-chat relative w-full min-w-0">
              <div class="text-size-chat whitespace-pre-wrap" data-id="prompt"><span data-id="seg1">یک فایل تست به نام </span><code class="font-mono" data-id="fname">codex-rtl-approval.txt</code><span data-id="seg2"> در ریشه پروژه بساز و داخلش بنویس تست راست‌چین. اگر برای نوشتن فایل نیاز به اجازه داری، سؤال تأیید را فارسی بپرس.</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  const bubble = doc.querySelector('[data-user-message-bubble]');
  const prompt = doc.querySelector('[data-id="prompt"]');
  const fname = doc.querySelector('[data-id="fname"]');

  // The real bubble itself must flip RTL so its hardcoded text-left is overridden.
  assert.equal(bubble.getAttribute('dir'), 'rtl', 'bubble must be RTL');
  assert.equal(bubble.classList.contains('YBYrtlClean'), true, 'bubble must get clean class');
  // The prompt text DIV must also flip RTL even though it holds ONLY element
  // children (span-wrapped prose) — this is the core of the live bug.
  assert.equal(prompt.getAttribute('dir'), 'rtl', 'span-wrapped prose DIV must be RTL');
  assert.equal(prompt.classList.contains('YBYrtlClean'), true, 'span-wrapped prose DIV must get clean class');
  // The inline filename code must stay LTR / unstyled.
  assert.notEqual(fname.getAttribute('dir'), 'rtl', 'inline filename must stay LTR');
  assert.equal(fname.classList.contains('YBYrtlClean'), false);
});

test('Codex CSS: user bubble has an alignment + isolate rule on the real hook', () => {
  const css = injections.buildCodexCss();
  const js = injections.buildCodexJs();
  // The real bubble attribute must be both watched (JS) and styled (CSS).
  assert.equal(js.includes('data-user-message-bubble'), true, 'runtime must watch the real bubble');
  assert.equal(css.includes('[data-user-message-bubble].YBYrtlClean'), true, 'CSS must target the real bubble');
  // Wrap-drift fix: the user-bubble text uses isolate (single stable RTL base),
  // not plaintext (per-line auto-direction).
  assert.match(
    css,
    /\[data-user-message-bubble\] \.whitespace-pre-wrap\.YBYrtlClean[^}]*unicode-bidi: isolate !important/,
    'user-bubble text must use unicode-bidi: isolate to stop per-line drift',
  );
});

test('Codex assistant text flips RTL when class and text arrive after mount', async () => {
  const doc = renderRoot('<div data-id="stream-shell"></div>');
  const shell = doc.querySelector('[data-id="stream-shell"]');

  shell.className = 'text-token-conversation-body';
  shell.textContent = 'پاراگراف فارسی که بعد از mount وارد شد باید همان لحظه راست‌چین شود.';
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(shell.getAttribute('dir'), 'rtl');
  assert.equal(shell.classList.contains('YBYrtlClean'), true);
});

test('Codex assistant span text flips RTL when only characterData changes after mount', async () => {
  const doc = renderRoot(`
    <div class="text-token-conversation-body" data-id="body">
      <span data-id="leaf"></span>
    </div>`);
  const body = doc.querySelector('[data-id="body"]');
  const leaf = doc.querySelector('[data-id="leaf"]');

  leaf.textContent = 'متن فارسی داخل span بعد از mount استریم شد.';
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(body.getAttribute('dir'), 'rtl');
  assert.equal(body.classList.contains('YBYrtlClean'), true);
  assert.equal(leaf.getAttribute('dir'), 'rtl');
  assert.equal(leaf.classList.contains('YBYrtlClean'), true);
});

test('Codex assistant paragraph with span-wrapped Persian text tags the paragraph itself RTL', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <p data-id="paragraph"><span data-id="leaf">این پاراگراف فارسی داخل span رندر شده است.</span></p>
    </div>`);
  const paragraph = doc.querySelector('[data-id="paragraph"]');
  const leaf = doc.querySelector('[data-id="leaf"]');

  assert.equal(paragraph.getAttribute('dir'), 'rtl');
  assert.equal(paragraph.classList.contains('YBYrtlClean'), true);
  assert.equal(leaf.getAttribute('dir'), 'rtl');
  assert.equal(leaf.classList.contains('YBYrtlClean'), true);
});

test('Codex review diff: Persian text preview becomes RTL and uses clean class', () => {
  const doc = renderRoot(`
    <div class="codex-review-diff-card">
      <pre data-id="preview">تست راست‌چین</pre>
    </div>`);
  const preview = doc.querySelector('[data-id="preview"]');

  assert.equal(preview.getAttribute('dir'), 'rtl');
  assert.equal(preview.classList.contains('YBYrtlClean'), true);
});

test('Codex conversation-body preview becomes RTL', () => {
  const doc = renderRoot(`
    <p class="text-token-conversation-body" data-id="body">محتوا: تست راست‌چین</p>`);
  const body = doc.querySelector('[data-id="body"]');

  assert.equal(body.getAttribute('dir'), 'rtl');
  assert.equal(body.classList.contains('YBYrtlClean'), true);
});

test('Codex assistant markdown: Persian lists promote the parent list for RTL marker spacing', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc" data-id="md">
      <p data-id="title">رابط انتخابی Codex در این حالت در دسترس نیست. یکی را انتخاب کنید:</p>
      <ol data-id="fa-ol">
        <li data-id="fa-ol-li">گزینهٔ اول</li>
        <li data-id="latin-first-stale">stale RTL runtime در Claude/Codex webview محتمل‌ترین علت بود.</li>
        <li data-id="latin-first-language">language server/file watcher شواهد قوی علیه‌اش بود.</li>
        <li>گزینهٔ دوم</li>
      </ol>
      <ul data-id="fa-ul">
        <li data-id="fa-ul-li">گزینهٔ سوم</li>
      </ul>
    </div>`);
  const ordered = doc.querySelector('[data-id="fa-ol"]');
  const unordered = doc.querySelector('[data-id="fa-ul"]');

  assert.equal(doc.querySelector('[data-id="title"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="fa-ol-li"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="latin-first-stale"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="latin-first-language"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="fa-ul-li"]').getAttribute('dir'), 'rtl');
  assert.equal(ordered.getAttribute('dir'), 'rtl', 'ordered list parent must be promoted for RTL marker spacing');
  assert.equal(unordered.getAttribute('dir'), 'rtl', 'unordered list parent must be promoted for RTL marker spacing');
  assert.equal(ordered.classList.contains('fa-rtl-clean'), true);
  assert.equal(unordered.classList.contains('fa-rtl-clean'), true);

  const css = injections.buildCodexCss();
  assert.match(css, /:is\(ol, ul\)\.fa-rtl-clean[\s\S]*?padding-inline-start: 1\.75em !important/);
  assert.match(css, /:is\(ol, ul\)\.fa-rtl-clean[\s\S]*?padding-inline-end: 0 !important/);
  assert.match(css, /:is\(ol, ul\)\.fa-rtl-clean[\s\S]*?list-style-position: outside !important/);
});

test('Codex assistant markdown: nested list prose has a high-specificity Vazirmatn inheritance rule', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc" data-id="md">
      <p data-id="lead">مراحل اجرا:</p>
      <ol data-id="steps">
        <li><p><span data-id="nested">ترمینال را در پوشه اصلی پروژه باز کنید.</span></p></li>
        <li><p>آزمایش‌ها را با <code data-id="command">npm run test</code> اجرا کنید.</p></li>
      </ol>
    </div>`);

  assert.equal(doc.querySelector('[data-id="lead"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="steps"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="nested"]').getAttribute('dir'), 'rtl');
  assert.notEqual(doc.querySelector('[data-id="command"]').getAttribute('dir'), 'rtl');

  const css = injections.buildCodexCss();
  assert.match(
    css,
    /#root \.fa-text-clean\.fa-text-clean :is\([^)]+span[^)]+\)[^{]+\{\s*font-family:\s*inherit !important;/,
  );
  assert.match(
    css,
    /#root \.YBYrtlClean\.fa-text-clean[\s\S]*?font-family:\s*var\(--persian-rtl-clean-font-family\) !important;/,
  );
  assert.match(
    css,
    /li\.fa-rtl-clean :not\(pre\)[^{]+:not\(\.fa-ltr-clean \*\)[^{]*\{\s*font-family:\s*var\(--persian-rtl-clean-font-family\) !important;/,
    'unknown nested list wrappers must receive Vazirmatn without entering protected trees',
  );
});

test('Codex current final renderer styles an existing Persian list at boot', () => {
  const doc = renderRoot(`
    <div data-local-conversation-final-assistant="true">
      <div class="_MarkdownRoot_1ns57_155" dir="auto" data-id="md">
        <p class="_Paragraph_1ns57_105">پاسخ فارسی متوقف‌شده</p>
        <ol class="_List_1ns57_149 _OrderedList_1ns57_183" dir="auto" data-id="steps">
          <li class="_ListItem_1ns57_192" data-id="item"><p>مرحله نهایی باید فونت فارسی داشته باشد.</p></li>
        </ol>
      </div>
    </div>`);
  const list = doc.querySelector('[data-id="steps"]');
  const item = doc.querySelector('[data-id="item"]');

  assert.equal(item.getAttribute('dir'), 'rtl');
  assert.equal(item.classList.contains('fa-rtl-clean'), true);
  assert.equal(item.classList.contains('fa-text-clean'), true);
  assert.equal(list.getAttribute('dir'), 'rtl');
  assert.equal(list.classList.contains('fa-rtl-clean'), true);
});

test('Codex interrupted/final render restores list font hooks removed after streaming', async () => {
  const doc = renderRoot(`
    <div data-local-conversation-final-assistant="true">
      <div class="_MarkdownRoot_1ns57_155" data-markdown-animated="" data-id="md">
        <ol class="_List_1ns57_149 _OrderedList_1ns57_183" dir="auto" data-id="steps">
          <li class="_ListItem_1ns57_192" data-id="item"><p>مرحله نهایی باید فونت فارسی داشته باشد.</p></li>
        </ol>
      </div>
    </div>`);
  const list = doc.querySelector('[data-id="steps"]');
  const item = doc.querySelector('[data-id="item"]');
  const markdown = doc.querySelector('[data-id="md"]');

  assert.equal(item.classList.contains('fa-rtl-clean'), true);
  assert.equal(list.classList.contains('fa-rtl-clean'), true);

  // Stop/finalize removes the animation attribute and React reconciles its own
  // className/dir values. Reproduce the whole transition, not just first mount.
  item.className = '_ListItem_1ns57_192';
  item.removeAttribute('dir');
  list.className = '_List_1ns57_149 _OrderedList_1ns57_183';
  list.setAttribute('dir', 'auto');
  markdown.removeAttribute('data-markdown-animated');
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(item.classList.contains('fa-rtl-clean'), true, 'final item must regain the Vazirmatn hook');
  assert.equal(item.classList.contains('fa-text-clean'), true);
  assert.equal(list.classList.contains('fa-rtl-clean'), true, 'final list must regain marker/layout styling');
});

test('Codex CSS targets current MarkdownRoot and final-assistant list lifecycles', () => {
  const css = injections.buildCodexCss();
  const js = injections.buildCodexJs();

  assert.equal(js.includes('_MarkdownRoot_'), true);
  assert.equal(js.includes('[data-markdown-animated]'), true);
  assert.equal(js.includes('[data-local-conversation-final-assistant]'), true);
  assert.match(js, /attributeFilter:[\s\S]*'data-markdown-animated'/);
  assert.match(js, /attributeFilter:[\s\S]*'data-local-conversation-final-assistant'/);
  assert.equal(css.includes('[class*="_MarkdownRoot_"] :is(ol, ul).fa-rtl-clean'), true);
  assert.equal(css.includes('[data-local-conversation-final-assistant] :is(ol, ul).fa-rtl-clean'), true);
});

test('Codex current completed list keeps Vazirmatn against a late host font rule', () => {
  const doc = renderRoot(`
    <div data-local-conversation-final-assistant="true">
      <div class="_MarkdownRoot_1ns57_155">
        <ul class="_List_1ns57_149 _UnorderedList_1ns57_171">
          <li class="_ListItem_1ns57_192" data-id="item"><p data-id="text">این گزینه باید فونت فارسی داشته باشد.</p></li>
        </ul>
      </div>
    </div>`);
  const rastchinStyle = doc.createElement('style');
  rastchinStyle.textContent = injections.buildCodexCss();
  doc.head.appendChild(rastchinStyle);

  // Model the completed renderer attaching/loading a host rule after RastChin.
  const hostStyle = doc.createElement('style');
  hostStyle.textContent = '#root [data-local-conversation-final-assistant] ._MarkdownRoot_1ns57_155 ._ListItem_1ns57_192 p { font-family: "OpenAI Sans"; }';
  doc.head.appendChild(hostStyle);

  const itemFont = doc.defaultView.getComputedStyle(doc.querySelector('[data-id="item"]')).fontFamily;
  const text = doc.querySelector('[data-id="text"]');
  const textFont = doc.defaultView.getComputedStyle(text).fontFamily;
  assert.equal(text.classList.contains('YBYrtlClean'), true, 'completed list paragraph must carry the clean prose hook');
  assert.match(itemFont, /Vazirmatn|persian-rtl-clean-font-family/i);
  assert.match(textFont, /Vazirmatn|persian-rtl-clean-font-family|inherit/i);
  // JSDOM 29 drops the priority argument from CSSStyleDeclaration.setProperty.
  // Assert the generated browser runtime still requests the real !important
  // inline declaration used to beat Codex's final-render !important rule.
  assert.equal(
    injections.buildCodexJs().includes("style.setProperty('font-family', LIST_FONT_VALUE, 'important')"),
    true,
  );
});

test('Codex final reconciliation restores the owned inline list font but leaves code untouched', async () => {
  const doc = renderRoot(`
    <div data-local-conversation-final-assistant="true">
      <div class="_MarkdownRoot_1ns57_155">
        <ul class="_List_1ns57_149 _UnorderedList_1ns57_171">
          <li class="_ListItem_1ns57_192"><p data-id="text">متن فهرست با دستور <code data-id="code">npm test</code></p></li>
        </ul>
      </div>
    </div>`);
  const text = doc.querySelector('[data-id="text"]');
  const code = doc.querySelector('[data-id="code"]');
  assert.equal(text.style.getPropertyValue('font-family'), 'var(--persian-rtl-clean-font-family)');
  assert.equal(code.style.getPropertyValue('font-family'), '');

  // The final React commit attempts to restore the host font on the prose node.
  text.style.setProperty('font-family', 'OpenAI Sans');
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(text.style.getPropertyValue('font-family'), 'var(--persian-rtl-clean-font-family)');
  assert.equal(code.style.getPropertyValue('font-family'), '', 'inline code must stay editor-owned/monospace');
});

test('Codex assistant markdown: an inline URL does not flip its Persian paragraph LTR', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <p data-id="docs">مستندات: <a data-id="url" href="https://example.com/docs">https://example.com/docs</a></p>
    </div>`);

  const paragraph = doc.querySelector('[data-id="docs"]');
  const url = doc.querySelector('[data-id="url"]');
  assert.equal(paragraph.getAttribute('dir'), 'rtl');
  assert.equal(paragraph.classList.contains('fa-rtl-clean'), true);
  assert.equal(url.classList.contains('fa-ltr-clean'), true);
});

test('Codex assistant markdown: Update followed by Persian prose is not mistaken for SQL', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <p data-id="update">Update افزونه نباید جهت این خط فارسی را به چپ‌چین تغییر دهد.</p>
    </div>`);
  const paragraph = doc.querySelector('[data-id="update"]');

  assert.equal(paragraph.getAttribute('dir'), 'rtl');
  assert.equal(paragraph.classList.contains('fa-rtl-clean'), true);
});

test('Codex CSS loads bundled Vazirmatn from the copied injection directory', () => {
  const css = injections.buildCodexCss();
  assert.match(css, /src:\s*url\('\.\/Vazirmatn-Regular\.woff2'\)/);
  assert.match(css, /src:\s*url\('\.\/Vazirmatn-Bold\.woff2'\)/);
});

test('Codex assistant markdown: English lists and code are not flipped by RTL list spacing', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc" data-id="en-md">
      <ol data-id="en-ol"><li data-id="en-li">First option</li></ol>
      <pre data-id="pre"><code data-id="code">1. first option</code></pre>
    </div>`);
  const list = doc.querySelector('[data-id="en-ol"]');
  const item = doc.querySelector('[data-id="en-li"]');
  const code = doc.querySelector('[data-id="code"]');

  assert.notEqual(list.getAttribute('dir'), 'rtl');
  assert.equal(list.classList.contains('fa-rtl-clean'), false);
  assert.notEqual(item.getAttribute('dir'), 'rtl');
  assert.equal(item.classList.contains('YBYrtlClean'), false);
  assert.notEqual(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('YBYrtlClean'), false);
});

test('Codex generic pre.whitespace-pre-wrap preview becomes RTL', () => {
  const doc = renderRoot(`
    <pre class="whitespace-pre-wrap" data-id="plain-preview">تست راست‌چین</pre>`);
  const preview = doc.querySelector('[data-id="plain-preview"]');

  assert.equal(preview.getAttribute('dir'), 'rtl');
  assert.equal(preview.classList.contains('YBYrtlClean'), true);
});

test('Codex markdown text code block: Persian prose becomes RTL with wrapper font hook', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div><span>text</span><button>Copy</button></div>
        <pre><code data-id="code">لورم ایپسوم یک متن ساختگی برای تست راست‌چین است</code></pre>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildCodexCss();
  const js = injections.buildCodexJs();

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(block.getAttribute('dir'), 'rtl');
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
  assert.equal(js.includes('[data-markdown-copy=\\"code-block\\"] code'), true);
  assert.match(css, /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text code\.fa-rtl-clean/);
});

test('Codex markdown code block: non-text labels and code-like Persian content stay LTR', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="js-block">
        <div><span>javascript</span></div>
        <pre><code data-id="js-code">const msg = "سلام";</code></pre>
      </div>
      <div data-markdown-copy="code-block" data-id="text-code-block">
        <div><span>text</span></div>
        <pre><code data-id="text-code">const msg = "سلام";</code></pre>
      </div>
    </div>`);
  const jsBlock = doc.querySelector('[data-id="js-block"]');
  const jsCode = doc.querySelector('[data-id="js-code"]');
  const textCodeBlock = doc.querySelector('[data-id="text-code-block"]');
  const textCode = doc.querySelector('[data-id="text-code"]');

  assert.notEqual(jsCode.getAttribute('dir'), 'rtl');
  assert.equal(jsCode.classList.contains('YBYrtlClean'), false);
  assert.equal(jsBlock.classList.contains('fa-rtl-clean-text'), false);
  assert.equal(textCode.getAttribute('dir'), 'ltr');
  assert.equal(textCode.classList.contains('fa-ltr-clean'), true);
  assert.equal(textCode.classList.contains('fa-rtl-clean'), false);
  assert.equal(textCodeBlock.classList.contains('fa-rtl-clean-text'), false);
});

test('Codex real code block DOM (header label + dir=ltr content, no <pre>) prose goes RTL', () => {
  // Mirrors the active bundle: the language label lives in a
  // [data-markdown-copy="exclude"] header and the content sits in a hardcoded
  // dir="ltr" container with the prose directly inside <code> (no <pre>).
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div data-markdown-copy="exclude"><div class="min-w-0 flex-1 truncate">text</div><button>Copy</button></div>
        <div class="text-size-chat overflow-auto p-2" dir="ltr"><code data-id="code"><span data-id="leaf">این یک پاراگراف نثر فارسی داخل بلاک متن است که باید راست‌چین شود.</span></code></div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildCodexCss();

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(block.getAttribute('dir'), 'rtl');
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
  // Prose wraps instead of horizontal-scrolling like code.
  assert.match(css, /\.fa-rtl-clean-text code\.fa-rtl-clean[^{]*\{[^}]*white-space: pre-wrap !important/);
  assert.match(css, /\.fa-rtl-clean-text code\.fa-rtl-clean[^{]*\{[^}]*overflow-x: visible !important/);
  // The horizontal scrollbar lives on the intermediate `div.overflow-auto`
  // between the wrapper and the <code>; neutralise its x-scroll for prose blocks.
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text \.overflow-auto[^{]*\{[^}]*overflow: visible !important/,
    'the intermediate overflow-auto scroll container must lose overflow scrolling for prose',
  );
  // Children inherit the RTL flow + Vazirmatn (no monospace leak onto spans).
  assert.match(css, /\.fa-rtl-clean-text code\.fa-rtl-clean \*[^{]*\{[^}]*font-family: inherit !important/);
});

test('Codex real code block DOM: bash label keeps Persian-string command LTR', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div data-markdown-copy="exclude"><div class="truncate">bash</div></div>
        <div dir="ltr"><code data-id="code">echo "سلام" && npm test</code></div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const code = doc.querySelector('[data-id="code"]');

  assert.notEqual(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), false);
  assert.equal(block.classList.contains('fa-rtl-clean-text'), false);
});

test('Codex text block horizontal scroll: prose tags the wrapper so the overflow-auto scroller is neutralised', () => {
  // Live-bug repro: a `text`-labelled fence of Persian PROSE. The wrapper carries
  // the header, then an intermediate `div.overflow-auto` (hardcoded dir="ltr") is
  // the node that produced the horizontal scrollbar. The runtime must tag the
  // wrapper .fa-rtl-clean-text and the <code> .fa-rtl-clean, and the generated CSS
  // must kill x-scroll + flip RTL specifically on that .overflow-auto div.
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div data-markdown-copy="exclude"><div class="min-w-0 flex-1 truncate">text</div><button>Copy</button></div>
        <div class="text-size-chat overflow-auto p-2" data-id="scroller" dir="ltr"><code data-id="code"><span>لورم ایپسوم متن ساختگی نثر فارسی است که باید به‌جای اسکرول افقی به‌صورت طبیعی wrap شود و در یک خط نماند.</span></code></div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildCodexCss();

  // The wrapper carries the prose hook the scroll-fix CSS is scoped to.
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(code.getAttribute('dir'), 'rtl');

  // CSS targets the intermediate overflow-auto scroller, scoped to prose only.
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text \.overflow-auto[^{]*\{[^}]*overflow: visible !important/,
    'overflow-auto scroll container must lose its x-scroll under .fa-rtl-clean-text',
  );
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text \.overflow-auto[^{]*\{[^}]*direction: rtl !important/,
    'the scroller flips RTL so the wrapping prose flows right-to-left',
  );
});

test('Codex text block scroll-fix is prose-gated: a bash block with the same overflow-auto div is untouched', () => {
  // Regression guard: the SAME DOM shape (intermediate div.overflow-auto) but a
  // real `bash` label must NOT get .fa-rtl-clean-text, so the scroll-fix selector
  // (scoped to .fa-rtl-clean-text .overflow-auto) never matches real code blocks —
  // they keep their monospace + horizontal scroll exactly as before.
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div data-markdown-copy="exclude"><div class="min-w-0 flex-1 truncate">bash</div><button>Copy</button></div>
        <div class="text-size-chat overflow-auto p-2" data-id="scroller" dir="ltr"><code data-id="code"><span>echo "سلام دنیا" &amp;&amp; npm test</span></code></div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const scroller = doc.querySelector('[data-id="scroller"]');
  const code = doc.querySelector('[data-id="code"]');

  // Real code: wrapper not prose-tagged, scroller still ltr, code not RTL-clean.
  assert.equal(block.classList.contains('fa-rtl-clean-text'), false);
  assert.equal(scroller.getAttribute('dir'), 'ltr');
  assert.equal(code.classList.contains('fa-rtl-clean'), false);
  assert.notEqual(code.getAttribute('dir'), 'rtl');
});

test('Codex direct text block body: Persian prose in generic overflow-auto wraps RTL', () => {
  // New active Codex shape: for some `text` fences the prose is rendered directly
  // inside the overflow-auto body, not inside pre/code. The active bundle also
  // gives that body whitespace-pre-wrap.
  // The runtime must watch and tag that body, then the CSS must remove scroll
  // intent directly on the body and not rely only on the wrapper hook.
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block" class="relative w-full min-w-0 overflow-clip rounded-lg border border-token-border bg-transparent contain-inline-size _codeBlock_u88jw_342">
        <div data-markdown-copy="exclude" data-id="header"><div class="min-w-0 flex-1 truncate">text</div><button data-id="copy">Copy</button></div>
        <div class="text-size-chat overflow-auto px-4 pt-2 pb-4 whitespace-pre-wrap" data-id="body" dir="ltr">در کوچه‌ای آرام که بوی باران تازه از سنگ‌فرش‌هایش برمی‌خاست، مردمان با گام‌هایی آهسته از کنار پنجره‌های روشن می‌گذشتند.</div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const body = doc.querySelector('[data-id="body"]');
  const header = doc.querySelector('[data-id="header"]');
  const copy = doc.querySelector('[data-id="copy"]');
  const css = injections.buildCodexCss();
  const js = injections.buildCodexJs();

  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
  assert.equal(block.getAttribute('dir'), 'rtl');
  assert.equal(body.classList.contains('fa-rtl-clean'), true);
  assert.equal(body.classList.contains('YBYrtlClean'), true);
  assert.equal(body.getAttribute('dir'), 'rtl');
  assert.equal(header.classList.contains('fa-rtl-clean-text'), false);
  assert.notEqual(header.getAttribute('dir'), 'rtl');
  assert.equal(copy.classList.contains('fa-rtl-clean'), false);

  assert.equal(
    js.includes('[data-markdown-copy=\\"code-block\\"] .overflow-auto'),
    true,
  );
  assert.equal(
    js.includes('[data-markdown-copy=\\"code-block\\"] .overflow-auto[class*=\\"whitespace-pre-wrap\\"]'),
    false,
  );
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text \.overflow-auto:not\(\[data-markdown-copy="exclude"\]\)[^{]*\{[^}]*white-space: pre-wrap !important/,
  );
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text \.overflow-auto:not\(\[data-markdown-copy="exclude"\]\)[^{]*\{[^}]*overflow: visible !important/,
  );
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\] \.overflow-auto\.fa-rtl-clean:not\(\[data-markdown-copy="exclude"\]\)[^{]*\{[^}]*overflow: visible !important/,
    'the RTL-clean body scroller must be neutralised directly, even if wrapper-tagging drifts',
  );
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\] \.overflow-auto\.fa-rtl-clean:not\(\[data-markdown-copy="exclude"\]\)[^{]*\{[^}]*min-width: 0 !important/,
  );
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\] \.overflow-auto\.fa-rtl-clean:not\(\[data-markdown-copy="exclude"\]\)[^{]*\{[^}]*max-width: 100% !important/,
  );
});

test('Codex direct text block body: non-text labels keep the direct body LTR', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div data-markdown-copy="exclude"><div class="min-w-0 flex-1 truncate">bash</div><button>Copy</button></div>
        <div class="text-size-chat overflow-auto px-4 pt-2 pb-4" data-id="body" dir="ltr">echo "سلام دنیا" &amp;&amp; npm test</div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const body = doc.querySelector('[data-id="body"]');

  assert.equal(block.classList.contains('fa-rtl-clean-text'), false);
  assert.equal(body.classList.contains('fa-rtl-clean'), false);
  assert.equal(body.classList.contains('YBYrtlClean'), false);
  assert.equal(body.getAttribute('dir'), 'ltr');
});

test('Codex text block copy: the exclude header + copy button stay LTR and untouched by prose rules', () => {
  // Regression guard for the copy/selection break: a Persian PROSE text block. The
  // copy button lives in the [data-markdown-copy="exclude"] header, a SIBLING of
  // the .overflow-auto scroller. Forcing display:block + direction:rtl on the
  // wrapper leaked into that header and reflowed the copy button; the prose rules
  // must reach only the <pre>/<code> content, and the header must be pinned LTR.
  const doc = renderRoot(`
    <div class="_markdownContent_abc">
      <div data-markdown-copy="code-block" data-id="block">
        <div data-markdown-copy="exclude" data-id="header"><div class="min-w-0 flex-1 truncate">text</div><button data-id="copy">Copy</button></div>
        <div class="text-size-chat overflow-auto p-2" data-id="scroller" dir="ltr"><code data-id="code"><span>این یک نثر فارسی است که باید راست‌چین و wrap شود ولی دکمه‌ی کپی سالم بماند.</span></code></div>
      </div>
    </div>`);
  const block = doc.querySelector('[data-id="block"]');
  const header = doc.querySelector('[data-id="header"]');
  const copy = doc.querySelector('[data-id="copy"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildCodexCss();

  // The prose block is recognised and the content flips RTL...
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(code.getAttribute('dir'), 'rtl');

  // ...but the copy button stays in the DOM and is never RTL/clean-tagged.
  assert.ok(copy, 'copy button must still exist in the DOM');
  assert.notEqual(copy.getAttribute('dir'), 'rtl');
  assert.equal(copy.classList.contains('fa-rtl-clean'), false);
  assert.equal(copy.classList.contains('YBYrtlClean'), false);

  // The header is never given the prose RTL/wrap treatment.
  assert.equal(header.classList.contains('fa-rtl-clean-text'), false);
  assert.notEqual(header.getAttribute('dir'), 'rtl');

  // CSS pins the exclude header (and its children) back to LTR.
  assert.match(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text \[data-markdown-copy="exclude"\][^{]*\{[^}]*direction: ltr !important/,
    'the exclude header must be pinned LTR so the copy button stays clickable',
  );

  // The bare wrapper selector must NOT be part of the prose display:block rule,
  // or display:block + direction:rtl leak into the header.
  assert.doesNotMatch(
    css,
    /\[data-markdown-copy="code-block"\]\.fa-rtl-clean-text\s*,/,
    'the bare wrapper selector must not carry the prose display:block / RTL rule',
  );
});

test('Codex text block copy: no selection/click suppression is introduced', () => {
  // jsdom cannot compute real clipping/selection, so guard at the CSS-rule level:
  // the prose/scroll fixes must never disable text selection or pointer clicks.
  const css = injections.buildCodexCss();
  assert.doesNotMatch(css, /user-select:\s*none/i, 'prose rules must not disable text selection');
  assert.doesNotMatch(css, /pointer-events:\s*none/i, 'prose rules must not disable clicks (copy button)');
  // The prose scroller must not keep horizontal scrolling, and the fix must not
  // use hidden clipping that could interfere with selection overlays.
  assert.doesNotMatch(
    css,
    /\.fa-rtl-clean-text \.overflow-auto[^{]*\{[^}]*overflow-x: hidden/,
    'overflow-auto prose scroller must not use overflow-x: hidden',
  );
  assert.doesNotMatch(
    css,
    /\.fa-rtl-clean-text \.overflow-auto[^{]*\{[^}]*overflow-x: auto/,
    'overflow-auto prose scroller must not keep overflow-x auto',
  );
});

test('Codex span-wrapped pre preview: inner span goes clean + CSS re-asserts Vazirmatn', () => {
  // A plaintext file preview renders its content inside <span> children of a
  // <pre>, so the runtime classes the SPAN, not the pre. commonScopedCss forces
  // pre descendants to monospace with !important; a higher-specificity, gated
  // rule must re-assert Vazirmatn on the Persian-clean span WITHOUT wildcarding
  // all descendants, or inline code/path fragments in a mixed preview lose mono.
  const doc = renderRoot(`
    <pre class="whitespace-pre-wrap" data-id="pre"><span data-id="sp">تست راست‌چین</span><code data-id="code">npm test</code></pre>`);
  const pre = doc.querySelector('[data-id="pre"]');
  const sp = doc.querySelector('[data-id="sp"]');
  const code = doc.querySelector('[data-id="code"]');

  // The runtime tags the inner span (pre has no direct Persian text node).
  assert.equal(sp.classList.contains('YBYrtlClean'), true, 'inner span must be Persian-clean');
  assert.equal(sp.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('YBYrtlClean'), false, 'inline code must not become Persian-clean');

  // The CSS must re-assert the Persian font on clean spans inside
  // pre.whitespace-pre-wrap with enough specificity to beat the !important
  // monospace from #root pre *, but it must not use a broad descendant wildcard.
  const css = injections.buildCodexCss();
  assert.match(
    css,
    /#root pre\.whitespace-pre-wrap \.YBYrtlClean[^{]*\{[^}]*var\(--persian-rtl-clean-font-family\) !important/,
    'a gated rule must give pre-descendant Persian spans the Vazirmatn font',
  );
  assert.doesNotMatch(
    css,
    /#root pre\.whitespace-pre-wrap \.YBYrtlClean \*/,
    'the re-assertion rule must not wildcard descendants and steal inline code font',
  );
  assert.doesNotMatch(
    css,
    /#root code\.YBYrtlClean/,
    'the re-assertion rule must not force Vazirmatn on clean code nodes globally',
  );
  // And the aggressor monospace rule must still exist for non-clean code.
  assert.match(css, /#root pre \*[\s\S]*?monospace !important/);
});

// Builds a #root containing a <diffs-container> whose OPEN shadow root holds the
// given [data-line] rows, then runs the Codex runtime. Mirrors the real
// file-create preview, where Persian file content lives inside the diff custom
// element's shadow DOM (out of reach of page CSS) and is otherwise monospace.
function renderDiffsContainer(lines) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const { window } = dom;
  const doc = window.document;
  const host = doc.createElement('diffs-container');
  doc.getElementById('root').appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  for (const line of lines) {
    const el = doc.createElement('div');
    el.setAttribute('data-line', '');
    if (line.type) el.setAttribute('data-line-type', line.type);
    el.innerHTML = `<span>${line.html}</span>`;
    shadow.appendChild(el);
  }
  const raf = (cb) => setTimeout(cb, 0);
  const runtime = injections.buildCodexJs().replace(/^\/\*.*\*\/$/gm, '');
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, doc, window.MutationObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  doc.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { doc, host, shadow };
}

test('Codex diffs-container shadow: Persian file line gets Vazirmatn+RTL, code stays mono', () => {
  const { shadow } = renderDiffsContainer([
    { type: 'add', html: 'تست راست‌چین' },
    { type: 'add', html: 'const answer = 42;' },
  ]);
  const lines = shadow.querySelectorAll('[data-line]');
  const persianLine = lines[0];
  const codeLine = lines[1];

  // Persian file content must be tagged for the RTL/Vazirmatn shadow rule...
  assert.equal(persianLine.classList.contains('fa-rtl-clean'), true, 'Persian diff line must be tagged RTL');
  // ...while a pure-code line must stay monospace/LTR (untagged).
  assert.equal(codeLine.classList.contains('fa-rtl-clean'), false, 'code diff line must not be tagged');

  // A shadow-scoped <style> must give tagged lines the persian font + RTL.
  const styleEl = shadow.querySelector('style');
  assert.ok(styleEl, 'a shadow style must be injected');
  assert.match(styleEl.textContent, /\[data-line\]\.fa-rtl-clean[^}]*font-family: var\(--persian-rtl-clean-font-family[^)]*\) !important/);
  assert.match(styleEl.textContent, /\[data-line\]\.fa-rtl-clean[^}]*direction: rtl !important/);
});

test('Codex diffs-container shadow: a line that becomes Persian after mount is re-tagged', async () => {
  const { shadow } = renderDiffsContainer([{ type: 'add', html: 'plain ascii' }]);
  const line = shadow.querySelector('[data-line]');
  assert.equal(line.classList.contains('fa-rtl-clean'), false);

  // Streamed-in Persian content must be picked up by the shadow observer.
  line.querySelector('span').textContent = 'محتوای فارسی';
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(line.classList.contains('fa-rtl-clean'), true, 'observer must re-tag the line once it turns Persian');
});

test('Codex diffs-container shadow: code-like line with Persian string stays monospace/LTR', () => {
  const { shadow } = renderDiffsContainer([
    { type: 'add', html: 'const msg = "سلام";' },
    { type: 'add', html: '("سلام");' },
  ]);
  const lines = shadow.querySelectorAll('[data-line]');

  assert.equal(lines[0].classList.contains('fa-rtl-clean'), false, 'an assignment line must not be tagged just because it contains a Persian string');
  assert.equal(lines[1].classList.contains('fa-rtl-clean'), false, 'a punctuation-led code-like line must not be tagged just because its first strong letter is Persian');
});

test('Codex JS: diffs-container handler applies persian font var inside the shadow', () => {
  const js = injections.buildCodexJs();
  assert.equal(js.includes('fa-rtl-clean'), true);
  assert.equal(js.includes('var(--persian-rtl-clean-font-family'), true);
  assert.equal(js.includes("querySelectorAll('[data-line]')"), true);
});

test('Codex CSS: plain text bubbles and review previews use plaintext bidi', () => {
  const css = injections.buildCodexCss();

  assert.equal(css.includes('.whitespace-pre-wrap.YBYrtlClean'), true);
  assert.equal(css.includes('unicode-bidi: plaintext !important;'), true);
  assert.equal(css.includes('.codex-review-diff-card pre.YBYrtlClean'), true);
  assert.equal(css.includes('[data-local-conversation-user-anchor]'), true);
  assert.equal(css.includes('.text-token-conversation-body.YBYrtlClean'), true);
  assert.equal(css.includes('pre.whitespace-pre-wrap.YBYrtlClean'), true);
});

test('Codex injection exposes robust card hooks (not a single hashed class)', () => {
  const js = injections.buildCodexJs();
  const css = injections.buildCodexCss();
  assert.equal(js.includes('data-codex-approval-surface'), true);
  assert.equal(js.includes('data-codex-composer-request-navigation'), true);
  assert.equal(js.includes('role="radiogroup"') || js.includes("role=\\\"radiogroup\\\"") || js.includes('radiogroup'), true);
  assert.equal(/role=\\?"radio\\?"/.test(js) || js.includes('[role="radio"]'), true);
  assert.equal(css.includes('data-codex-approval-surface'), true);
  assert.equal(css.includes('data-codex-composer-request-navigation'), true);
  assert.equal(js.includes('[data-codex-composer]'), true);
  assert.equal(css.includes('[data-codex-composer] textarea'), true);
  assert.equal(js.includes('.codex-review-diff-card pre'), true);
});

// --- Assistant markdown TABLES (real active-bundle DOM: _markdownContent_ >
// _tableWrapper_ > _tableContainer_ > table._table_ > tr._tableRow_ >
// th._tableHeaderCell_ / td._tableCell_). This was the live, permanent breakage:
// the markdown body delegates away (hasRtlChildBlock && !ownDirectRtlText &&
// !semantic) and never tagged its cells, while TEXT_LEAF_SEL excluded th/td, so
// Persian tables rendered LTR forever. The dedicated table pass fixes it.

test('Codex assistant markdown table: Persian cells flip RTL while the table stays LTR (column order preserved)', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_u88jw_43" data-id="md">
      <p data-id="intro">جدول مقایسه دستورها:</p>
      <div class="_tableWrapper_u88jw_265"><div class="_tableContainer_u88jw_258">
        <table class="_table_u88jw_258" data-id="table">
          <thead>
            <tr class="_tableRow_u88jw_305">
              <th class="_tableHeaderCell_u88jw_309" data-id="th-fa">ستون فارسی</th>
              <th class="_tableHeaderCell_u88jw_309" data-id="th-en">Command</th>
            </tr>
          </thead>
          <tbody>
            <tr class="_tableRow_u88jw_305">
              <td class="_tableCell_u88jw_305" data-id="td-fa">توضیح فارسی این ردیف از جدول است</td>
              <td class="_tableCell_u88jw_305" data-id="td-code"><code data-id="cmd">npm test</code></td>
            </tr>
          </tbody>
        </table>
      </div></div>
    </div>`);
  const table = doc.querySelector('[data-id="table"]');
  const thFa = doc.querySelector('[data-id="th-fa"]');
  const tdFa = doc.querySelector('[data-id="td-fa"]');
  const thEn = doc.querySelector('[data-id="th-en"]');
  const tdCode = doc.querySelector('[data-id="td-code"]');
  const cmd = doc.querySelector('[data-id="cmd"]');

  // The Persian intro paragraph still flips (delegate-branch leaf tagging).
  assert.equal(doc.querySelector('[data-id="intro"]').getAttribute('dir'), 'rtl');

  // The table element itself stays LTR so columns keep their order.
  assert.equal(table.getAttribute('dir'), 'ltr');
  assert.equal(table.classList.contains('fa-table-clean'), true);

  // Persian header + body cells become RTL with the clean class.
  assert.equal(thFa.getAttribute('dir'), 'rtl', 'Persian header cell must be RTL');
  assert.equal(thFa.classList.contains('YBYrtlClean'), true);
  assert.equal(tdFa.getAttribute('dir'), 'rtl', 'Persian body cell must be RTL');
  assert.equal(tdFa.classList.contains('YBYrtlClean'), true);

  // An English header and a code/command cell stay LTR; the inline command is
  // never RTL-tagged.
  assert.equal(thEn.getAttribute('dir'), 'ltr', 'English header cell stays LTR');
  assert.equal(thEn.classList.contains('YBYrtlClean'), false);
  assert.equal(tdCode.getAttribute('dir'), 'ltr', 'a command-only cell stays LTR');
  assert.notEqual(cmd.getAttribute('dir'), 'rtl', 'inline command must stay LTR');
  assert.equal(cmd.classList.contains('YBYrtlClean'), false);

  // CSS backs the runtime: fa-table-clean tables are LTR; rtl cells flip with
  // !important so a Codex _table_{text-align:left} cannot override them.
  const css = injections.buildCodexCss();
  assert.match(css, /table\.fa-table-clean[^}]*direction: ltr !important/);
  assert.match(css, /th\[dir="rtl"\][\s\S]*?direction: rtl !important/);
  assert.match(css, /td\[dir="rtl"\][\s\S]*?text-align: right !important/);
});

test('Codex assistant markdown table: a Persian cell streamed in after mount becomes RTL', async () => {
  const doc = renderRoot(`
    <div class="_markdownContent_u88jw_43">
      <table class="_table_u88jw_258" data-id="t"><tbody><tr data-id="row"></tr></tbody></table>
    </div>`);
  const row = doc.querySelector('[data-id="row"]');
  const table = doc.querySelector('[data-id="t"]');
  assert.equal(table.classList.contains('fa-table-clean'), true, 'table is tagged on first scan');

  // Tables stream cell-by-cell during assistant rendering; a late cell must be
  // re-tagged by the table-scoped observer, not stay LTR.
  const td = doc.createElement('td');
  td.setAttribute('data-id', 'late');
  td.textContent = 'سلولی که بعداً استریم شد و باید راست‌چین شود';
  row.appendChild(td);
  await new Promise((resolve) => setTimeout(resolve, 10));

  const late = doc.querySelector('[data-id="late"]');
  assert.equal(late.getAttribute('dir'), 'rtl', 'streamed-in Persian cell must become RTL');
  assert.equal(late.classList.contains('YBYrtlClean'), true);
});

test('Codex table: an all-English table is left LTR and untagged at the cell level', () => {
  const doc = renderRoot(`
    <div class="_markdownContent_u88jw_43">
      <table class="_table_u88jw_258" data-id="t">
        <tbody><tr><td data-id="c1">First</td><td data-id="c2">Second</td></tr></tbody>
      </table>
    </div>`);
  const c1 = doc.querySelector('[data-id="c1"]');
  const c2 = doc.querySelector('[data-id="c2"]');
  assert.notEqual(c1.getAttribute('dir'), 'rtl');
  assert.equal(c1.classList.contains('YBYrtlClean'), false);
  assert.notEqual(c2.getAttribute('dir'), 'rtl');
  assert.equal(c2.classList.contains('YBYrtlClean'), false);
});
