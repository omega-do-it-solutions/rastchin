import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

const schema = new Schema({
    nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', { class: 'text-node' }, ['span', { class: 'attr' }, 0]] },
        heading: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'h2' }], toDOM: () => ['h2', { class: 'heading-node' }, 0] },
        bullet_list: { group: 'block', content: 'list_item+', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', { class: 'list-node' }, 0] },
        list_item: { content: 'paragraph block*', parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
        table: { group: 'block', content: 'row+', parseDOM: [{ tag: 'table' }], toDOM: () => ['div', { class: 'tableContainer' }, ['table', ['tbody', 0]]] },
        row: { content: 'cell+', parseDOM: [{ tag: 'tr' }], toDOM: () => ['tr', 0] },
        cell: { content: 'paragraph+', parseDOM: [{ tag: 'td' }], toDOM: () => ['td', 0] },
        code_block: { group: 'block', content: 'text*', marks: '', code: true, parseDOM: [{ tag: 'pre' }], toDOM: () => ['pre', ['code', 0]] },
        text: { group: 'inline' }
    },
    marks: { code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] } }
});
const n = (name, children) => schema.node(name, null, children);
const p = text => n('paragraph', schema.text(text));
let transactions = 0;
function editor(place, label, doc) {
    return new EditorView(document.querySelector(place), {
        state: EditorState.create({ schema, doc }),
        attributes: { 'aria-label': label, role: 'textbox', class: 'editor' },
        dispatchTransaction(tr) { transactions++; this.updateState(this.state.apply(tr)); }
    });
}
const title = editor('#title', 'Issue title', n('doc', p('عنوان فارسی در Linear')));
const view = editor('#description', 'Issue description', n('doc', [
    p('این Issue آزمایشی برای بررسی اتصال Linear و عملکرد افزونهٔ RastChin ایجاد شده است.'),
    n('heading', schema.text('موارد بررسی')),
    n('bullet_list', [
        n('list_item', [p('این بند فارسی باید راست‌چین شود.'), p('English continuation فارسی')]),
        n('list_item', p('English-first with فارسی text')),
        n('list_item', [p('فهرست تو در تو'), n('bullet_list', [
            n('list_item', p('این مورد فارسی تو در تو است.')),
            n('list_item', p('English nested item with فارسی'))
        ])])
    ]),
    n('table', n('row', [n('cell', p('وضعیت فارسی')), n('cell', p('English status'))])),
    n('paragraph', [schema.text('نسخهٔ '), schema.text('v1.1.73', [schema.mark('code')]), schema.text(' باید خوانا بماند.')]),
    n('code_block', schema.text('const فارسی = "English";')),
    p('English-first paragraph with فارسی remains LTR')
]));
const result = document.querySelector('#results');
const checks = [];
const assert = (name, value) => { checks.push({ name, passed: Boolean(value) }); };
const settle = async () => {
    // The extension batches scans in requestAnimationFrame. Await actual paint
    // cycles as well as editor reconciliation; timers alone race hidden tabs.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await new Promise(resolve => setTimeout(resolve, 350));
};
const style = el => getComputedStyle(el);
const bulletOn = (el, side) => {
    const marker = getComputedStyle(el, '::before');
    const opposite = side === 'right' ? 'left' : 'right';
    return marker.content.includes('counter(') && parseFloat(marker[side]) < 0 && parseFloat(marker[opposite]) > 0;
};
let handle;
let observer;
try {
    const run = RastChinRecipe.runPlatformRecipe;
    RastChinRecipe.runPlatformRecipe = recipe => {
        handle = run({ ...recipe, hosts: [location.hostname] });
        return handle;
    };
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/linear.js'; script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
    });
    const originalDoc = view.state.doc.toJSON();
    const originalNodes = [...view.dom.querySelectorAll('*')];
    const originalHTML = view.dom.innerHTML;
    let contentMutations = 0;
    observer = new MutationObserver(records => {
        contentMutations += records.filter(m => m.target !== view.dom).length;
    });
    observer.observe(view.dom, { attributes: true, childList: true, characterData: true, subtree: true });
    handle.enable();
    await settle();
    await document.fonts.ready;
    const first = view.dom.querySelector('p');
    assert('Persian paragraph computes RTL and right alignment', style(first).direction === 'rtl' && style(first).textAlign === 'right');
    assert('Issue title computes RTL', style(title.dom.querySelector('p')).direction === 'rtl');
    assert('Heading computes RTL', style(view.dom.querySelector('h2')).direction === 'rtl');
    assert('List item computes RTL', style(view.dom.querySelector('li')).direction === 'rtl');
    assert('English continuation inside Persian list remains LTR', style(view.dom.querySelector('li p:nth-child(2)')).direction === 'ltr');
    assert('English list item remains LTR', style(view.dom.querySelectorAll('li')[1]).direction === 'ltr');
    assert('Linear Persian pseudo-bullet is on the right', bulletOn(view.dom.querySelector('li'), 'right'));
    assert('Linear English pseudo-bullet stays on the left', bulletOn(view.dom.querySelectorAll('li')[1], 'left'));
    assert('Nested Persian bullet is on the right', bulletOn(view.dom.querySelector('ul ul > li'), 'right'));
    assert('Nested English bullet stays on the left', bulletOn(view.dom.querySelectorAll('ul ul > li')[1], 'left'));
    assert('Persian cell computes RTL', style(view.dom.querySelector('td')).direction === 'rtl');
    assert('English cell remains LTR', style(view.dom.querySelectorAll('td')[1]).direction === 'ltr');
    assert('Table geometry stays LTR', style(view.dom.querySelector('table')).direction === 'ltr');
    assert('Inline code stays LTR and monospace', style(view.dom.querySelector('p code')).direction === 'ltr' && style(view.dom.querySelector('p code')).fontFamily.includes('monospace'));
    assert('Code block stays LTR', style(view.dom.querySelector('pre')).direction === 'ltr');
    assert('Persian font is provided through CSS', style(first).fontFamily.includes('Vazirmatn'));
    assert('Bundled Persian font loads', document.fonts.check('16px Vazirmatn', 'فارسی'));
    assert('Editor content DOM identities survive enable', originalNodes.every(node => node.isConnected));
    assert('Editor content markup is unchanged', view.dom.innerHTML === originalHTML);
    assert('No content mutation or editor transaction from extension', contentMutations === 0 && transactions === 0);
    assert('Document model is unchanged', JSON.stringify(view.state.doc.toJSON()) === JSON.stringify(originalDoc));
    assert('Board title discovered and RTL', style(document.querySelector('#board-title')).direction === 'rtl');
    assert('Board layout and Persian metadata remain unchanged', !document.querySelector('[data-board-item]').hasAttribute('dir') && !document.querySelector('#badge').hasAttribute('dir'));
    observer.disconnect();
    // Real editor transactions exercise rescanning and path changes.
    view.dispatch(view.state.tr.insertText('English replacement فارسی', 1, view.state.doc.firstChild.nodeSize - 1));
    await settle();
    assert('Changing first paragraph to English restores LTR', style(view.dom.querySelector('p')).direction === 'ltr');
    view.dispatch(view.state.tr.insert(0, p('بند تازه در ابتدای متن')));
    await settle();
    assert('Inserted Persian paragraph receives RTL', style(view.dom.querySelector('p')).direction === 'rtl');
    assert('Shifted English paragraph retains LTR', style(view.dom.querySelectorAll(':scope > p')[1]).direction === 'ltr');
    let listParagraphPos;
    view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'list_item' && listParagraphPos === undefined) listParagraphPos = pos + 1;
    });
    const listParagraph = view.state.doc.nodeAt(listParagraphPos);
    view.dispatch(view.state.tr.insertText('English replacement for list item', listParagraphPos + 1, listParagraphPos + listParagraph.nodeSize - 1));
    await settle();
    assert('Changing list item to English restores the left bullet', bulletOn(view.dom.querySelector('li'), 'left'));
    const beforeDisable = view.dom.innerHTML;
    handle.disable();
    await settle();
    assert('Disable removes editor rules and scope', !view.dom.hasAttribute('data-rastchin-linear-editor') && !document.querySelector('[data-rastchin-linear-directions]'));
    assert('Disable restores host direction', style(view.dom.querySelector('p')).direction === 'ltr');
    assert('Disable restores Linear’s original bullet position', bulletOn(view.dom.querySelector('ul ul > li'), 'left'));
    assert('Disable does not rewrite content', view.dom.innerHTML === beforeDisable);
    handle.enable();
    await settle();
    assert('Re-enable restores RTL without rewriting content', style(view.dom.querySelector('p')).direction === 'rtl' && view.dom.innerHTML === beforeDisable);
    assert('Re-enable restores Persian bullet on the right', bulletOn(view.dom.querySelector('ul ul > li'), 'right'));
    const nodes = [...view.dom.querySelectorAll('*')];
    await settle();
    assert('No delayed editor replacement loop', nodes.every(node => node.isConnected));
} catch (error) {
    checks.push({ name: error.stack || String(error), passed: false });
} finally {
    observer?.disconnect();
    const failures = checks.filter(check => !check.passed);
    if (failures.length) handle?.disable();
    result.textContent = JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', checks: checks.length, failures, results: checks }, null, 2);
}
