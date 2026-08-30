const assert = require('node:assert/strict');
const test = require('node:test');

const { JSDOM } = require('jsdom');
const injections = require('../src/injections');

function renderClaudeRoot(inner) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${inner}</div></body></html>`);
  const { window } = dom;
  const raf = (cb) => setTimeout(cb, 0);
  const runtime = injections.buildClaudeJs().replace(/^\/\*.*\*\/$/gm, '');
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, window.MutationObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window.document;
}

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

// Instrumented boot: identical to renderClaudeRoot's boot path, but
//   (1) swaps in a MutationObserver subclass that tallies "self-origin"
//       deliveries -- callbacks whose records are ENTIRELY the runtime's own
//       writes (dir/class attribute flips + wrapArrows childList splices), and
//   (2) drives a manual rAF queue so animation frames can be pumped one batch at
//       a time and we can observe whether reapply work settles or free-runs.
function bootInstrumentedClaude(inner) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="root">${inner}</div></body></html>`,
  );
  const { window } = dom;

  // Manual animation-frame queue (mirrors the browser: one batch per frame).
  let pending = [];
  let rafScheduled = 0;
  const raf = (cb) => { rafScheduled += 1; pending.push(cb); };
  const pumpFrame = () => {
    const batch = pending;
    pending = [];
    batch.forEach((cb) => { try { cb(); } catch (_) { /* match runtime swallow */ } });
  };

  // Count observer callbacks that carry ONLY runtime-origin mutations. applyText
  // writes dir + our fa-*-clean classes; wrapArrows does childList replaceChild.
  // An external text edit shows up as characterData / a non-fa-* class, so it is
  // excluded -- this isolates the SELF-trigger signal.
  let selfOriginDeliveries = 0;
  const Native = window.MutationObserver;
  class CountingObserver extends Native {
    constructor(cb) {
      super((records, obs) => {
        const selfOnly = records.length > 0 && records.every((m) => (
          (m.type === 'attributes' && (m.attributeName === 'dir' || m.attributeName === 'class'))
          || m.type === 'childList'
        ));
        if (selfOnly) selfOriginDeliveries += 1;
        return cb(records, obs);
      });
    }
  }

  const runtime = injections.buildClaudeJs().replace(/^\/\*.*\*\/$/gm, '');
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, CountingObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  return {
    document: window.document,
    window,
    get rafScheduled() { return rafScheduled; },
    get selfOriginDeliveries() { return selfOriginDeliveries; },
    pendingFrames() { return pending.length; },
    // Pump n frames; jsdom delivers MutationObserver records as microtasks, so
    // await a macrotask between frames to let the queue flush like a real loop.
    async pump(n) {
      for (let i = 0; i < n; i += 1) {
        pumpFrame();
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
}

function bootClaudeWithObserverCount(inner) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${inner}</div></body></html>`);
  const { window } = dom;
  const raf = (cb) => setTimeout(cb, 0);
  let observerCount = 0;
  const Native = window.MutationObserver;
  class CountingObserver extends Native {
    constructor(cb) {
      observerCount += 1;
      super(cb);
    }
  }
  const runtime = injections.buildClaudeJs().replace(/^\/\*.*\*\/$/gm, '');
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'WeakMap', 'setTimeout', 'console',
    runtime,
  );
  run(window, window.document, CountingObserver, window.NodeFilter, raf, window.WeakMap, setTimeout, console);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { document: window.document, observerCount };
}

test('Claude runtime does not self-trigger a free-running reapply loop', async () => {
  // Mount English content so the runtime fully settles into an idempotent state.
  const h = bootInstrumentedClaude(
    '<div class="timelineMessage_07S1Yg" data-id="msg"><p data-id="p">Hello world english paragraph</p></div>',
  );
  await h.pump(12); // let boot settle

  // BASELINE: with no external change, draining frames must schedule nothing and
  // produce no self-origin observer deliveries (true quiescence).
  const quietRafBefore = h.rafScheduled;
  const quietSelfBefore = h.selfOriginDeliveries;
  await h.pump(20);
  assert.equal(h.rafScheduled - quietRafBefore, 0, 'idle runtime must not schedule animation frames');
  assert.equal(h.selfOriginDeliveries - quietSelfBefore, 0, 'idle runtime must not re-observe its own writes');
  assert.equal(h.pendingFrames(), 0, 'no animation-frame work should remain queued while idle');

  // ONE real external change (streaming tokens arrive as Persian prose). The
  // runtime MUST react: flip the node RTL + tag it. That reactivity is required.
  const selfBefore = h.selfOriginDeliveries;
  const p = h.document.querySelector('[data-id="p"]');
  p.textContent = 'سلام دنیا این یک پاراگراف فارسی است که باید راست‌چین و وزیرمتن شود';
  await h.pump(25); // settle the single change

  // Reactivity proof (fix must NOT disable this):
  assert.equal(p.getAttribute('dir'), 'rtl', 'external Persian content must still flip RTL');
  assert.equal(p.classList.contains('fa-rtl-clean'), true, 'external Persian content must still be tagged');

  // LOOP DETECTOR: the runtime must NOT keep hearing its OWN class/dir/childList
  // writes back through the observers it set up. On the buggy runtime the
  // per-element observer (attributes class/style/dir + childList + subtree +
  // characterData) and the root observer both observe the very attributes
  // applyText/wrapArrows write, so a single change cascades into multiple
  // self-origin deliveries (and, in a real browser's per-frame batching, an
  // unbounded reapply-every-frame loop). The fix drains those self-records so
  // this collapses to a tight constant.
  // A single change settles to a SMALL BOUNDED constant (the per-element and the
  // root observer can each surface the one reapply once across the rAF boundary
  // before drainObservers catches up) — NOT the unbounded every-frame cascade of
  // the buggy runtime. The decisive no-free-run guarantee is asserted just below.
  const selfDuringChange = h.selfOriginDeliveries - selfBefore;
  assert.ok(
    selfDuringChange <= 2,
    'runtime re-observed its own writes ' + selfDuringChange + ' times for a single change (self-trigger loop)',
  );

  // After settling, further frames must add NO new self-origin deliveries and NO
  // new scheduled frames -- the loop, if present, would keep firing here.
  const rafAfter = h.rafScheduled;
  const selfAfter = h.selfOriginDeliveries;
  await h.pump(30);
  assert.equal(h.rafScheduled - rafAfter, 0, 'reapply work must settle, not fire every frame');
  assert.equal(h.selfOriginDeliveries - selfAfter, 0, 'no self-triggered observer deliveries after settling');
  assert.equal(h.pendingFrames(), 0, 'no animation-frame work should remain queued after settling');
});

test('Claude runtime keeps observer count bounded for long transcripts', () => {
  const messages = Array.from({ length: 120 }, (_, i) => (
    `<div class="timelineMessage_07S1Yg"><p>پیام فارسی شماره ${i} برای سنجش هزینه observer.</p></div>`
  )).join('');
  const h = bootClaudeWithObserverCount(messages);

  assert.equal(h.document.querySelectorAll('.fa-rtl-clean').length > 100, true);
  assert.ok(h.observerCount <= 2, 'long transcript created ' + h.observerCount + ' MutationObservers');
});

test('Claude runtime keeps English progress statuses LTR inside Persian content', () => {
  const doc = renderClaudeRoot(`
    <div class="timelineMessage_07S1Yg" data-id="wrapper">
      <p data-id="message">این پیام فارسی باید راست‌چین باشد.</p>
      <div class="root_status" data-id="calculating">...Calculating</div>
      <div class="root_status" data-id="actioning">...Actioning</div>
      <div class="root_status" data-id="brewing">Brewing...</div>
      <div class="root_status" data-id="combobulating">Combobulating...</div>
      <div class="root_status" data-id="concocting">Concocting...</div>
      <div class="root_status" data-id="considering">Considering...</div>
      <div class="root_status" data-id="cooking">Cooking...</div>
      <div class="root_status" data-id="mixing">Mixing...</div>
      <div class="root_status" data-id="percolating">Percolating...</div>
      <div class="root_status" data-id="processing">Processing...</div>
      <div class="root_status" data-id="preparing">Preparing...</div>
      <div class="root_status" data-id="finishing">Finishing...</div>
      <div class="root_status" data-id="retrying">Retrying...</div>
      <div class="root_status" data-id="simmering">Simmering...</div>
      <div class="root_status" data-id="stirring">Stirring...</div>
      <div class="root_status" data-id="flibbertigibbeting">Flibbertigibbeting...</div>
      <div class="root_status" data-id="worked">Worked for 3s</div>
      <div class="root_status" data-id="thought">Thought for 4s</div>
    </div>`);

  const wrapper = doc.querySelector('[data-id="wrapper"]');
  const message = doc.querySelector('[data-id="message"]');
  const calculating = doc.querySelector('[data-id="calculating"]');
  const actioning = doc.querySelector('[data-id="actioning"]');
  const brewing = doc.querySelector('[data-id="brewing"]');
  const combobulating = doc.querySelector('[data-id="combobulating"]');
  const concocting = doc.querySelector('[data-id="concocting"]');
  const considering = doc.querySelector('[data-id="considering"]');
  const cooking = doc.querySelector('[data-id="cooking"]');
  const mixing = doc.querySelector('[data-id="mixing"]');
  const percolating = doc.querySelector('[data-id="percolating"]');
  const processing = doc.querySelector('[data-id="processing"]');
  const preparing = doc.querySelector('[data-id="preparing"]');
  const finishing = doc.querySelector('[data-id="finishing"]');
  const retrying = doc.querySelector('[data-id="retrying"]');
  const simmering = doc.querySelector('[data-id="simmering"]');
  const stirring = doc.querySelector('[data-id="stirring"]');
  const flibbertigibbeting = doc.querySelector('[data-id="flibbertigibbeting"]');
  const worked = doc.querySelector('[data-id="worked"]');
  const thought = doc.querySelector('[data-id="thought"]');

  assert.notEqual(wrapper.getAttribute('dir'), 'rtl', 'wrapper must not force RTL onto English status children');
  assert.equal(message.getAttribute('dir'), 'rtl');
  [
    calculating,
    actioning,
    brewing,
    combobulating,
    concocting,
    considering,
    cooking,
    mixing,
    percolating,
    processing,
    preparing,
    finishing,
    retrying,
    simmering,
    stirring,
    flibbertigibbeting,
    worked,
    thought,
  ].forEach((status) => {
    assert.equal(status.getAttribute('dir'), 'ltr');
    assert.equal(status.classList.contains('fa-ltr-clean'), true);
    assert.equal(status.classList.contains('fa-rtl-clean'), false);
  });
});

test('Claude AskUserQuestion: Persian question and Latin-first mixed choices become RTL', () => {
  // Mirrors Claude Code 2.1.241's AskUserQuestion DOM. CSS-module suffixes are
  // deliberately synthetic: the runtime targets the stable semantic prefixes.
  const doc = renderClaudeRoot(`
    <div class="permissionRequestContainer_mac123">
      <div class="permissionRequestContent_mac123">
        <div class="questionsContainer_build456">
          <div class="questionBlock_build456" data-id="question-card">
            <div class="questionHeader_build456">
              <span class="questionTextLarge_build456" data-id="claude-question">ریپوی خصوصی momikaeli.com کجا ساخته بشه؟</span>
            </div>
            <div class="optionsContainer_build456">
              <div class="option_build456" role="radio" aria-checked="false" data-id="claude-choice-1">
                <div class="optionCheckbox_build456"><div class="radio_build456"></div></div>
                <div class="optionContent_build456">
                  <div class="optionLabel_build456">momikaeli.com (پیشنهاد)</div>
                  <div class="optionDescription_build456">github.com/momikaeli/momikaeli.com — تنها حالتی که واقعاً فقط اکانت خودت دسترسی داره.</div>
                </div>
              </div>
              <div class="option_build456" role="radio" aria-checked="false" data-id="claude-choice-2">
                <div class="optionCheckbox_build456"><div class="radio_build456"></div></div>
                <div class="optionContent_build456">
                  <div class="optionLabel_build456">Mo-Private-Projects</div>
                  <div class="optionDescription_build456">github.com/Mo-Private-Projects/momikaeli.com — نزدیک‌ترین گزینه به چیزی که خواستی.</div>
                </div>
              </div>
              <div class="option_build456" role="radio" aria-checked="false" data-id="claude-other">Other</div>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  const question = doc.querySelector('[data-id="claude-question"]');
  const choice1 = doc.querySelector('[data-id="claude-choice-1"]');
  const choice2 = doc.querySelector('[data-id="claude-choice-2"]');
  const other = doc.querySelector('[data-id="claude-other"]');

  assert.equal(question.getAttribute('dir'), 'rtl');
  assert.equal(question.classList.contains('YBYrtlClean'), true);
  assert.equal(choice1.getAttribute('dir'), 'rtl', 'Latin URL prefix must not make a Persian choice LTR');
  assert.equal(choice2.getAttribute('dir'), 'rtl', 'Latin label plus Persian description must make the row RTL');
  assert.equal(choice1.classList.contains('fa-text-clean'), true, 'choice must inherit Vazirmatn');
  assert.notEqual(other.getAttribute('dir'), 'rtl', 'English-only Other choice stays untouched');
  assert.equal(other.classList.contains('YBYrtlClean'), false);
});

test('Claude AskUserQuestion hooks stay scoped to permission/question cards', () => {
  const js = injections.buildClaudeJs();
  const css = injections.buildClaudeCss();

  assert.equal(js.includes('permissionRequestContent_'), true);
  assert.equal(js.includes('questionBlock_'), true);
  assert.match(css, /\[class\*="questionBlock_"\] \[role="radio"\]\.YBYrtlClean/);

  const doc = renderClaudeRoot(`
    <div class="settings-panel">
      <div role="radio" data-id="unrelated-radio">گزینه فارسی تنظیمات</div>
    </div>`);
  assert.notEqual(doc.querySelector('[data-id="unrelated-radio"]').getAttribute('dir'), 'rtl');
});

test('Claude runtime removes stale LTR state when a status node changes to Persian', async () => {
  const doc = renderClaudeRoot('<div class="timelineMessage_07S1Yg" data-id="status">Thinking...</div>');
  const status = doc.querySelector('[data-id="status"]');

  assert.equal(status.getAttribute('dir'), 'ltr');
  assert.equal(status.classList.contains('fa-ltr-clean'), true);

  status.textContent = 'متن فارسی دریافت شد';
  await nextFrame();

  assert.equal(status.getAttribute('dir'), 'rtl');
  assert.equal(status.classList.contains('fa-rtl-clean'), true);
  assert.equal(status.classList.contains('fa-ltr-clean'), false);
});

test('Claude runtime flips RTL when message class and Persian text arrive after mount', async () => {
  const doc = renderClaudeRoot('<div data-id="stream-shell"></div>');
  const shell = doc.querySelector('[data-id="stream-shell"]');

  shell.className = 'timelineMessage_07S1Yg';
  shell.textContent = 'پاراگراف فارسی که پس از mount وارد شد باید فوری راست‌چین شود.';
  await nextFrame();

  assert.equal(shell.getAttribute('dir'), 'rtl');
  assert.equal(shell.classList.contains('fa-rtl-clean'), true);
});

test('Claude runtime tags a paragraph with span-wrapped Persian text RTL', () => {
  const doc = renderClaudeRoot(`
    <div class="timelineMessage_07S1Yg">
      <p data-id="paragraph"><span data-id="leaf">این پاراگراف فارسی داخل span رندر شده است.</span></p>
    </div>`);
  const paragraph = doc.querySelector('[data-id="paragraph"]');
  const leaf = doc.querySelector('[data-id="leaf"]');

  assert.equal(paragraph.getAttribute('dir'), 'rtl');
  assert.equal(paragraph.classList.contains('fa-rtl-clean'), true);
  assert.equal(leaf.getAttribute('dir'), 'rtl');
  assert.equal(leaf.classList.contains('fa-rtl-clean'), true);
});

test('Claude runtime styles Persian leaf text inside an unstyled wrapper', () => {
  const doc = renderClaudeRoot(`
    <div class="timelineMessage_07S1Yg" data-id="wrapper">
      <div class="nested_shell" data-id="shell">
        <span data-id="leaf">این متن فارسی داخلی باید راست‌چین و وزیرمتن باشد.</span>
      </div>
      <div class="root_status" data-id="actioning"><span>...Actioning</span></div>
    </div>`);

  const wrapper = doc.querySelector('[data-id="wrapper"]');
  const shell = doc.querySelector('[data-id="shell"]');
  const leaf = doc.querySelector('[data-id="leaf"]');
  const actioning = doc.querySelector('[data-id="actioning"]');

  assert.notEqual(wrapper.getAttribute('dir'), 'rtl', 'wrapper must not force RTL onto mixed children');
  assert.notEqual(shell.getAttribute('dir'), 'rtl', 'intermediate wrapper must stay neutral');
  assert.equal(leaf.getAttribute('dir'), 'rtl');
  assert.equal(leaf.classList.contains('fa-rtl-clean'), true);
  assert.equal(actioning.getAttribute('dir'), 'ltr');
});

test('Claude runtime promotes Latin-first Persian list items to RTL', () => {
  const doc = renderClaudeRoot(`
    <div class="timelineMessage_07S1Yg">
      <ol data-id="list">
        <li data-id="stale">stale RTL runtime در Claude/Codex webview محتمل‌ترین علت بود.</li>
        <li data-id="language">language server/file watcher شواهد قوی علیه‌اش بود.</li>
        <li data-id="path">src/گزارش.md</li>
      </ol>
    </div>`);
  const list = doc.querySelector('[data-id="list"]');
  const stale = doc.querySelector('[data-id="stale"]');
  const language = doc.querySelector('[data-id="language"]');
  const path = doc.querySelector('[data-id="path"]');

  assert.equal(stale.getAttribute('dir'), 'rtl');
  assert.equal(stale.classList.contains('fa-rtl-clean'), true);
  assert.equal(language.getAttribute('dir'), 'rtl');
  assert.equal(language.classList.contains('fa-rtl-clean'), true);
  assert.equal(path.getAttribute('dir'), 'ltr');
  assert.equal(path.classList.contains('fa-rtl-clean'), false);
  assert.equal(list.getAttribute('dir'), 'rtl');
  assert.equal(list.classList.contains('fa-rtl-clean'), true);
});

test('Claude runtime does not mistake Update followed by Persian prose for SQL', () => {
  const doc = renderClaudeRoot(`
    <div class="timelineMessage_07S1Yg">
      <p data-id="update">Update افزونه نباید جهت این خط فارسی را به چپ‌چین تغییر دهد.</p>
    </div>`);
  const paragraph = doc.querySelector('[data-id="update"]');

  assert.equal(paragraph.getAttribute('dir'), 'rtl');
  assert.equal(paragraph.classList.contains('fa-rtl-clean'), true);
});

test('Claude runtime styles sent Persian user prompt bubbles RTL', () => {
  const doc = renderClaudeRoot(`
    <div class="message_07S1Yg userMessageContainer_07S1Yg" data-id="user-shell">
      <div class="userMessage_07S1Yg" data-id="user-bubble">
        یک فایل موقت به نام claude-rtl-check.txt بساز و داخلش بنویس تست راست‌چین
      </div>
    </div>
    <div class="timelineMessage_07S1Yg" data-id="puttering">Puttering...</div>`);

  const shell = doc.querySelector('[data-id="user-shell"]');
  const bubble = doc.querySelector('[data-id="user-bubble"]');
  const puttering = doc.querySelector('[data-id="puttering"]');

  assert.equal(shell.getAttribute('dir'), 'rtl');
  assert.equal(shell.classList.contains('fa-rtl-clean'), true);
  assert.equal(bubble.getAttribute('dir'), 'rtl');
  assert.equal(bubble.classList.contains('fa-rtl-clean'), true);
  assert.equal(puttering.getAttribute('dir'), 'ltr');
});

test('Claude runtime styles Persian write-preview text RTL while regular code stays LTR', () => {
  const doc = renderClaudeRoot(`
    <div class="toolBodyRowContent_ZUQaOA">
      <pre data-id="preview">تست راست‌چین</pre>
    </div>
    <pre data-id="code">const name = "تست";</pre>`);

  const preview = doc.querySelector('[data-id="preview"]');
  const code = doc.querySelector('[data-id="code"]');

  assert.equal(preview.getAttribute('dir'), 'rtl');
  assert.equal(preview.classList.contains('fa-rtl-clean'), true);
  assert.equal(code.getAttribute('dir'), null);
  assert.equal(code.classList.contains('fa-rtl-clean'), false);
});

test('Claude runtime styles Persian read-preview plaintext RTL', () => {
  const doc = renderClaudeRoot(`
    <div class="toolBodyPlainText_0aBcD" data-id="plain">تست راست‌چین</div>
    <div class="toolBodyPlainText_0aBcD" data-id="wrapped"><span data-id="wrapped-leaf">تست راست‌چین</span></div>`);

  const plain = doc.querySelector('[data-id="plain"]');
  const wrapped = doc.querySelector('[data-id="wrapped"]');
  const wrappedLeaf = doc.querySelector('[data-id="wrapped-leaf"]');

  assert.equal(plain.getAttribute('dir'), 'rtl');
  assert.equal(plain.classList.contains('fa-rtl-clean'), true);
  assert.equal(wrapped.getAttribute('dir'), 'rtl');
  assert.equal(wrapped.classList.contains('fa-rtl-clean'), true);
  assert.equal(wrappedLeaf.getAttribute('dir'), null);
  assert.equal(wrappedLeaf.classList.contains('fa-rtl-clean'), false);
});

test('Claude runtime auto-RTL styles composer and mention mirror Persian input', async () => {
  const doc = renderClaudeRoot(`
    <div class="messageInput_abc" data-id="composer" contenteditable="true">Run tests</div>
    <div class="mentionMirror_abc" data-id="mirror">Run tests</div>`);
  const composer = doc.querySelector('[data-id="composer"]');
  const mirror = doc.querySelector('[data-id="mirror"]');

  assert.notEqual(composer.getAttribute('dir'), 'rtl');
  assert.notEqual(mirror.getAttribute('dir'), 'rtl');

  composer.textContent = 'یک متن فارسی داخل composer';
  composer.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
  mirror.textContent = 'پیش‌نمایش فارسی composer';
  await nextFrame();

  assert.equal(composer.getAttribute('dir'), 'rtl');
  assert.equal(composer.classList.contains('fa-rtl-clean'), true);
  assert.equal(mirror.getAttribute('dir'), 'rtl');
  assert.equal(mirror.classList.contains('fa-rtl-clean'), true);
});

test('Claude runtime styles span-wrapped Persian preview text RTL while inline code stays LTR', () => {
  const doc = renderClaudeRoot(`
    <div class="toolBodyRowContent_ZUQaOA">
      <pre data-id="preview"><span data-id="leaf">تست راست‌چین</span><code data-id="code">npm test</code></pre>
    </div>`);

  const preview = doc.querySelector('[data-id="preview"]');
  const leaf = doc.querySelector('[data-id="leaf"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildClaudeCss();

  assert.equal(preview.getAttribute('dir'), 'rtl');
  assert.equal(preview.classList.contains('fa-rtl-clean'), true);
  assert.equal(leaf.getAttribute('dir'), null);
  assert.equal(leaf.classList.contains('fa-rtl-clean'), false);
  assert.equal(code.getAttribute('dir'), null);
  assert.equal(code.classList.contains('fa-rtl-clean'), false);
  assert.match(
    css,
    /#root \[class\*="toolBodyRowContent_"\] pre \.YBYrtlClean:not\(code\):not\(pre\):not\(kbd\):not\(samp\)/,
  );
});

test('Claude runtime styles preview prose inside code RTL, but keeps code-like lines LTR', () => {
  const doc = renderClaudeRoot(`
    <div class="toolBodyRowContent_ZUQaOA">
      <pre data-id="rtl-preview"><code data-id="rtl-code">تست راست‌چین</code></pre>
      <pre data-id="ltr-preview"><code data-id="ltr-code">const name = "تست";</code></pre>
    </div>`);

  const rtlCode = doc.querySelector('[data-id="rtl-code"]');
  const ltrCode = doc.querySelector('[data-id="ltr-code"]');
  const css = injections.buildClaudeCss();

  assert.equal(rtlCode.getAttribute('dir'), 'rtl');
  assert.equal(rtlCode.classList.contains('fa-rtl-clean'), true);
  assert.equal(ltrCode.getAttribute('dir'), 'ltr');
  assert.equal(ltrCode.classList.contains('fa-rtl-clean'), false);
  assert.match(
    css,
    /#root \[class\*="toolBodyRowContent_"\] pre code\.fa-rtl-clean,\n#root \[class\*="toolBodyPlainText_"\] code\.fa-rtl-clean/,
  );
});

test('Claude runtime styles Persian text block inside timeline markdown code RTL', () => {
  const doc = renderClaudeRoot(`
    <div class="timelineMessage_abc">
      <pre data-id="pre"><code data-id="code">لورم ایپسوم یک متن ساختگی برای تست راست‌چین است</code></pre>
    </div>`);
  const pre = doc.querySelector('[data-id="pre"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildClaudeCss();
  const js = injections.buildClaudeJs();

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(pre.getAttribute('dir'), 'rtl');
  assert.equal(pre.classList.contains('fa-rtl-clean'), true);
  assert.equal(js.includes('timelineMessage_'), true);
  assert.equal(js.includes('pre code'), true);
  assert.match(css, /\[class\*="timelineMessage_"\] pre code\.fa-rtl-clean/);
});

test('Claude runtime keeps code-like Persian content inside preview code LTR', () => {
  const doc = renderClaudeRoot(`
    <div class="toolBodyRowContent_ZUQaOA">
      <pre data-id="path-pre"><code data-id="path-code">/tmp/سلام.txt</code></pre>
      <pre data-id="code-pre"><code data-id="code-line">const msg = "سلام";</code></pre>
    </div>`);
  const pathCode = doc.querySelector('[data-id="path-code"]');
  const codeLine = doc.querySelector('[data-id="code-line"]');

  assert.equal(pathCode.getAttribute('dir'), 'ltr');
  assert.equal(pathCode.classList.contains('fa-ltr-clean'), true);
  assert.equal(pathCode.classList.contains('fa-rtl-clean'), false);
  assert.equal(codeLine.getAttribute('dir'), 'ltr');
  assert.equal(codeLine.classList.contains('fa-ltr-clean'), true);
  assert.equal(codeLine.classList.contains('fa-rtl-clean'), false);
});

// --- Assistant markdown code blocks (real DOM: codeBlockWrapper_ > pre > code).
// Claude renders NO visible language label; the only language signal is
// <code class="language-xxx">. There is no data-markdown-copy attribute here.

test('Claude assistant text code block: Persian prose becomes RTL + Vazirmatn', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="block">
        <button class="copyButton_-a7MRw">Copy</button>
        <pre data-id="pre"><code class="language-text" data-id="code">لورم ایپسوم یک متن ساختگی نثر برای تست راست‌چین است که باید وزیرمتن شود.</code></pre>
      </div>
    </span>`);
  const block = doc.querySelector('[data-id="block"]');
  const pre = doc.querySelector('[data-id="pre"]');
  const code = doc.querySelector('[data-id="code"]');
  const css = injections.buildClaudeCss();

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(pre.getAttribute('dir'), 'rtl');
  assert.equal(pre.classList.contains('fa-rtl-clean'), true);
  assert.equal(block.getAttribute('dir'), 'rtl');
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
  // Prose blocks must wrap naturally (no horizontal scroll / pre behaviour).
  assert.match(css, /\.fa-rtl-clean-text code\.fa-rtl-clean[^{]*\{[^}]*white-space: pre-wrap !important/);
  assert.match(css, /\.fa-rtl-clean-text code\.fa-rtl-clean[^{]*\{[^}]*overflow-x: visible !important/);
});

test('Claude assistant plaintext code block (no label) wraps Persian prose RTL', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="block">
        <pre data-id="pre"><code class="language-plaintext" data-id="code">این یک پاراگراف نثر فارسی داخل بلاک plaintext است.</code></pre>
      </div>
    </span>`);
  const code = doc.querySelector('[data-id="code"]');
  const block = doc.querySelector('[data-id="block"]');

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
});

test('Claude assistant unlabeled fence: Persian prose still becomes RTL', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="block">
        <pre data-id="pre"><code data-id="code">سلام دنیا، این متن فارسی بدون مشخص‌کردن زبان است.</code></pre>
      </div>
    </span>`);
  const code = doc.querySelector('[data-id="code"]');
  const block = doc.querySelector('[data-id="block"]');

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
});

test('Claude assistant javascript code block with Persian string/comment stays LTR', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="block">
        <pre data-id="pre"><code class="language-javascript" data-id="code">const msg = "سلام"; // یک نظر فارسی</code></pre>
      </div>
    </span>`);
  const code = doc.querySelector('[data-id="code"]');
  const pre = doc.querySelector('[data-id="pre"]');
  const block = doc.querySelector('[data-id="block"]');

  assert.notEqual(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), false);
  assert.notEqual(pre.getAttribute('dir'), 'rtl');
  assert.equal(block.classList.contains('fa-rtl-clean-text'), false);
});

test('Claude assistant bash code block with Persian echo stays LTR', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="block">
        <pre data-id="pre"><code class="language-bash" data-id="code">echo "سلام"; npm test</code></pre>
      </div>
    </span>`);
  const code = doc.querySelector('[data-id="code"]');
  const block = doc.querySelector('[data-id="block"]');

  assert.notEqual(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), false);
  assert.equal(block.classList.contains('fa-rtl-clean-text'), false);
});

test('Claude assistant text block: code-like Persian lines still stay LTR', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="path-block">
        <pre><code class="language-text" data-id="path-code">/tmp/سلام.txt</code></pre>
      </div>
      <div class="codeBlockWrapper_-a7MRw" data-id="js-block">
        <pre><code class="language-text" data-id="js-code">const msg = "سلام";</code></pre>
      </div>
    </span>`);
  const pathCode = doc.querySelector('[data-id="path-code"]');
  const jsCode = doc.querySelector('[data-id="js-code"]');

  assert.equal(pathCode.getAttribute('dir'), 'ltr');
  assert.equal(pathCode.classList.contains('fa-ltr-clean'), true);
  assert.equal(pathCode.classList.contains('fa-rtl-clean'), false);
  assert.equal(jsCode.getAttribute('dir'), 'ltr');
  assert.equal(jsCode.classList.contains('fa-ltr-clean'), true);
  assert.equal(jsCode.classList.contains('fa-rtl-clean'), false);
});

test('Claude JS watches assistant code block wrappers for RTL previews', () => {
  const js = injections.buildClaudeJs();
  assert.equal(js.includes('codeBlockWrapper_'), true);
  assert.equal(js.includes('pre code'), true);
});

test('Claude text block: Persian prose with a Latin number prefix resolves RTL', () => {
  const doc = renderClaudeRoot(`
    <span class="root_-a7MRw">
      <div class="codeBlockWrapper_-a7MRw" data-id="block">
        <pre><code class="language-text" data-id="code">1. مرحله اول را با دقت انجام بده تا تست راست‌چین شود.</code></pre>
      </div>
    </span>`);
  const code = doc.querySelector('[data-id="code"]');
  const block = doc.querySelector('[data-id="block"]');

  assert.equal(code.getAttribute('dir'), 'rtl');
  assert.equal(code.classList.contains('fa-rtl-clean'), true);
  assert.equal(block.classList.contains('fa-rtl-clean-text'), true);
});
