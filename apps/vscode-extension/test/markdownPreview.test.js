const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { JSDOM } = require('jsdom');

function renderPreview(body) {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`);
  const { window } = dom;
  const script = fs.readFileSync(path.join(__dirname, '..', 'media', 'markdown-preview.js'), 'utf8');
  const raf = (cb) => setTimeout(cb, 0);
  const run = new Function(
    'window', 'document', 'MutationObserver', 'NodeFilter', 'requestAnimationFrame', 'console',
    script,
  );
  run(window, window.document, window.MutationObserver, window.NodeFilter, raf, console);
  return window.document;
}

function attachPreviewCss(document) {
  const style = document.createElement('style');
  style.textContent = fs.readFileSync(path.join(__dirname, '..', 'media', 'markdown-preview.css'), 'utf8');
  document.head.appendChild(style);
}

test('Markdown Preview: Latin-first Persian prose headings become RTL', () => {
  const doc = renderPreview(`
    <h2 data-id="deploy">deploy و publish</h2>
    <h3 data-id="prompt">Prompt و گزارش Claude Code</h3>
  `);

  for (const id of ['deploy', 'prompt']) {
    const el = doc.querySelector(`[data-id="${id}"]`);
    assert.equal(el.getAttribute('dir'), 'rtl');
    assert.equal(el.classList.contains('fa-rtl-clean'), true);
  }
});

test('Markdown Preview CSS: RTL prose keeps one explicit base direction for mixed Latin text', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'markdown-preview.css'), 'utf8');

  assert.match(
    css,
    /body,\s*\nbody\.vscode-body\s*\{\s*font-family:\s*var\(--persian-rtl-clean-font-family\) !important;/,
  );
  assert.match(
    css,
    /\.fa-rtl-clean,\s*\n\[dir="rtl"\]\.fa-text-clean\s*\{[\s\S]*?direction:\s*rtl !important;[\s\S]*?text-align:\s*right !important;[\s\S]*?unicode-bidi:\s*isolate !important;/,
  );
  assert.match(
    css,
    /\[dir="ltr"\]\.fa-text-clean,\s*\n\[dir="ltr"\]\.fa-ltr-clean,\s*\n\.fa-ltr-clean\s*\{[\s\S]*?direction:\s*ltr !important;[\s\S]*?text-align:\s*left !important;/,
  );
  assert.match(
    css,
    /pre,\s*\ncode,\s*\nkbd,\s*\nsamp,[\s\S]*?unicode-bidi:\s*isolate !important;/,
  );
});

test('Markdown Preview: Latin-first README prose stays RTL instead of using plaintext auto-direction', () => {
  const doc = renderPreview(`
    <h2 data-id="heading">Update و بازیابی</h2>
    <p data-id="paragraph">RastChin هدف فعال را با API رسمی extension registry پیدا می‌کند.</p>
  `);

  for (const id of ['heading', 'paragraph']) {
    const el = doc.querySelector(`[data-id="${id}"]`);
    assert.equal(el.getAttribute('dir'), 'rtl');
    assert.equal(el.classList.contains('fa-rtl-clean'), true);
  }
});

test('Markdown Preview: Latin-first Persian list items become RTL and promote the parent list', () => {
  const doc = renderPreview(`
    <ul data-id="list">
      <li data-id="package">package افزونه، DMG، VSIX، release asset یا marketplace listing بدون تأیید صریح منتشر نشود.</li>
      <li data-id="artifact">artifactهای generated مثل DMG، VSIX، ZIP، CRX، dist/، build/, unpacked/, .next/, out/ و node_modules/ نباید وارد source commit شوند.</li>
    </ul>
  `);
  const list = doc.querySelector('[data-id="list"]');

  assert.equal(doc.querySelector('[data-id="package"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="artifact"]').getAttribute('dir'), 'rtl');
  assert.equal(list.classList.contains('fa-rtl-clean'), true);
});

test('Markdown Preview: pure English remains neutral while protected LTR text stays LTR', () => {
  const doc = renderPreview(`
    <p data-id="english">deploy and publish</p>
    <p data-id="url">https://example.com/مسیر</p>
    <p data-id="email">support@example.com</p>
    <p data-id="command">git commit -m "گزارش"</p>
    <p data-id="path">src/گزارش.md</p>
    <p data-id="inline-code">مسیر <code data-id="inline-code-token">src/گزارش.md</code> را بررسی کن</p>
    <pre data-id="pre"><code data-id="code">deploy و publish</code></pre>
  `);

  assert.notEqual(doc.querySelector('[data-id="english"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="english"]').getAttribute('dir'), 'ltr');
  assert.equal(doc.querySelector('[data-id="english"]').classList.contains('fa-ltr-clean'), true);
  assert.equal(doc.querySelector('[data-id="english"]').classList.contains('fa-rtl-clean'), false);
  assert.equal(doc.querySelector('[data-id="url"]').getAttribute('dir'), 'ltr');
  assert.notEqual(doc.querySelector('[data-id="email"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="email"]').classList.contains('fa-rtl-clean'), false);
  assert.equal(doc.querySelector('[data-id="command"]').getAttribute('dir'), 'ltr');
  assert.equal(doc.querySelector('[data-id="path"]').getAttribute('dir'), 'ltr');
  assert.equal(doc.querySelector('[data-id="inline-code"]').getAttribute('dir'), 'rtl');
  assert.notEqual(doc.querySelector('[data-id="inline-code-token"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="inline-code-token"]').classList.contains('fa-rtl-clean'), false);
  assert.notEqual(doc.querySelector('[data-id="pre"]').getAttribute('dir'), 'rtl');
  assert.notEqual(doc.querySelector('[data-id="code"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('[data-id="code"]').classList.contains('fa-rtl-clean'), false);
});

test('Markdown Preview: table order remains LTR while Persian cells are RTL', () => {
  const doc = renderPreview(`
    <table data-id="table">
      <tr>
        <td data-id="en">Name</td>
        <td data-id="fa">package افزونه منتشر نشود</td>
      </tr>
    </table>
  `);

  assert.equal(doc.querySelector('[data-id="table"]').getAttribute('dir'), 'ltr');
  assert.equal(doc.querySelector('[data-id="en"]').getAttribute('dir'), 'ltr');
  assert.equal(doc.querySelector('[data-id="fa"]').getAttribute('dir'), 'rtl');
});

test('Markdown Preview: a Persian paragraph containing an inline URL remains RTL', () => {
  const doc = renderPreview(`
    <p data-id="mixed-url">برای اطلاعات بیشتر آدرس <a href="https://rastchin.tools/">https://rastchin.tools/</a> را بررسی کن.</p>
  `);
  assert.equal(doc.querySelector('[data-id="mixed-url"]').getAttribute('dir'), 'rtl');
  assert.equal(doc.querySelector('a').classList.contains('fa-ltr-clean'), true, 'the URL itself remains isolated LTR');
});

test('Markdown Preview: semantic README blocks such as summary and definition terms get per-block direction', () => {
  const doc = renderPreview(`
    <details>
      <summary data-id="summary">جزئیات نصب افزونه</summary>
      <dl>
        <dt data-id="term">نسخه فعال</dt>
        <dd data-id="description">نسخه‌ای که VS Code بارگذاری کرده است.</dd>
      </dl>
    </details>
  `);
  for (const id of ['summary', 'term', 'description']) {
    assert.equal(doc.querySelector(`[data-id="${id}"]`).getAttribute('dir'), 'rtl');
  }
});

test('Markdown Preview: Vazirmatn propagates through nested prose while inline code remains monospace', () => {
  const doc = renderPreview(`
    <p data-id="paragraph">متن <strong data-id="strong"><em>تأکیدی فارسی</em></strong> و <code data-id="code">npm test</code></p>
  `);
  attachPreviewCss(doc);

  const proseFont = doc.defaultView.getComputedStyle(doc.querySelector('[data-id="strong"]')).fontFamily;
  const codeFont = doc.defaultView.getComputedStyle(doc.querySelector('[data-id="code"]')).fontFamily;
  const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'markdown-preview.css'), 'utf8');
  assert.match(css, /\.fa-text-clean :is\([^)]+\)[\s\S]*?font-family:\s*inherit !important;/);
  assert.match(proseFont, /Vazirmatn|persian-rtl-clean-font-family|inherit/i);
  assert.match(codeFont, /monospace/i);
  assert.doesNotMatch(codeFont, /^Vazirmatn/i);
});

test('Markdown Preview: nested README list prose inherits Vazirmatn while code and URLs stay isolated LTR', () => {
  const doc = renderPreview(`
    <p data-id="lead">مراحل اجرا:</p>
    <ol data-id="steps">
      <li><p><span data-id="nested">ترمینال را در پوشه اصلی پروژه باز کنید.</span></p></li>
      <li><p>آزمایش‌ها را با <code data-id="command">npm run test</code> اجرا کنید.</p></li>
    </ol>
    <p>مستندات: <a data-id="url" href="https://example.com/docs">https://example.com/docs</a></p>
  `);
  attachPreviewCss(doc);

  const nestedFont = doc.defaultView.getComputedStyle(doc.querySelector('[data-id="nested"]')).fontFamily;
  const commandFont = doc.defaultView.getComputedStyle(doc.querySelector('[data-id="command"]')).fontFamily;
  const urlFont = doc.defaultView.getComputedStyle(doc.querySelector('[data-id="url"]')).fontFamily;
  assert.equal(doc.querySelector('[data-id="steps"]').classList.contains('fa-rtl-clean'), true);
  assert.match(nestedFont, /Vazirmatn|persian-rtl-clean-font-family/i);
  assert.match(commandFont, /monospace/i);
  assert.match(urlFont, /monospace/i);
});

test('Markdown Preview: BACKLOG-style mixed list items all keep explicit RTL direction', () => {
  const doc = renderPreview(`
    <h4>معیار خروج فاز ۲</h4>
    <ul data-id="criteria">
      <li data-id="verify">verify زنده‌ی Codex و Claude Code برای flowهای هدف انجام شده باشد.</li>
      <li data-id="tests"><code>npm test</code> و <code>npm run package</code> سبز باشند.</li>
      <li data-id="patch">patchها بعد از reload و startup re-apply پایدار بمانند.</li>
      <li data-id="checklist">یک checklist کوتاه smoke/manual برای اجراهای بعدی ثبت شده باشد.</li>
      <li data-id="english">English-only diagnostic item</li>
    </ul>
  `);
  attachPreviewCss(doc);

  for (const id of ['verify', 'tests', 'patch', 'checklist']) {
    const item = doc.querySelector(`[data-id="${id}"]`);
    assert.equal(item.getAttribute('dir'), 'rtl');
    assert.equal(item.classList.contains('fa-rtl-clean'), true);
    assert.match(doc.defaultView.getComputedStyle(item).fontFamily, /Vazirmatn|persian-rtl-clean-font-family/i);
  }
  assert.equal(doc.querySelector('[data-id="criteria"]').classList.contains('fa-rtl-clean'), true);
  assert.equal(doc.querySelector('[data-id="english"]').getAttribute('dir'), 'ltr');
  assert.equal(doc.querySelector('[data-id="english"]').classList.contains('fa-rtl-clean'), false);

  const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'markdown-preview.css'), 'utf8');
  assert.match(css, /:is\(ul, ol\)\.fa-rtl-clean > li::marker[\s\S]*?font-family:\s*var\(--persian-rtl-clean-font-family\) !important;/);
});
