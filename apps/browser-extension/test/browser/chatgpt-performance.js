import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Brave may throttle requestAnimationFrame on an automation tab. Flush actual
// paint cycles as well as settle timers before measuring idle/hover work.
const settle = async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await pause(400);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
};
const schema = new Schema({ nodes: {
    doc: { content:'paragraph+' }, paragraph: { content:'text*', toDOM:() => ['p', 0], parseDOM:[{tag:'p'}] }, text:{}
} });
let transactions = 0;
const editor = new EditorView(document.querySelector('#editor'), {
    state: EditorState.create({schema}),
    attributes: { 'data-composer-markdown':'', role:'textbox', 'aria-label':'Synthetic prompt' },
    dispatchTransaction(tr) { transactions++; this.updateState(this.state.apply(tr)); }
});
const conversation = document.querySelector('#conversation');
for (let i=0;i<24;i++) {
    const turn = document.createElement('article');
    turn.innerHTML = `<div data-chatgpt-selection-message-id="sample-${i}"><div data-markdown-text-style="assistant-message">
    <p>Open Notebook = یک NotebookLM شخصی Self-hosted و قابل اتصال به Agentها.</p>
    <ul><li>Self-hosted است.</li><li>OpenAI / Claude / Gemini / Ollama / LM Studio / OpenRouter را پشتیبانی می‌کند.</li><li>This English item includes سلام once.</li></ul>
    ${Array.from({length:8},(_,j)=>`<p>بند ${j+1}: این یک پاسخ ساختگی برای آزمایش متن فارسی و English token است.</p>`).join('')}
    <table><thead><tr><th><span>Tag</span></th><th><span>Notes</span></th><th><span>نوع</span></th><th><span>Action</span></th></tr></thead><tbody>
    ${[
        ['مهم', '43', 'فارسی', 'Merge'],
        ['Work', '89', 'English', 'Rename'],
        ['پروژه', '124', 'فارسی', 'فعال'],
        ['AI Research', '67', 'Mixed', 'Keep'],
        ['Archived', '32', 'System', 'This tag is read-only']
    ].map(row=>`<tr>${row.map((text,col)=>`<td${col===1?' align="right"':''}><span>${text}</span></td>`).join('')}</tr>`).join('')}
    </tbody></table>
    <table class="english-only"><tbody><tr><td>English label</td><td>English value</td></tr></tbody></table>
    <table class="centered"><tbody><tr><td align="center">سلول فارسی</td><td align="center">English cell</td></tr></tbody></table>
    <pre><code class="language-javascript">${Array.from({length:12},()=>'<span>const</span> <span>sample</span> = <span>"سلام"</span>;').join('\n')}</code></pre>
    </div></div>`;
    conversation.appendChild(turn);
}
// Sanitized shapes from the current ChatGPT word-stream and code-only
// renderer. These examples are synthetic, with no account/conversation data.
const nativeCases = document.createElement('article');
nativeCases.id = 'native-renderer-cases';
nativeCases.innerHTML = `<div data-markdown-text-style="assistant-message">
<h2>آزمون renderer فعلی ChatGPT</h2>
<p id="word-stream"><span data-d-stream-word>Open </span><span data-d-stream-word>Notebook </span><span data-d-stream-word>= </span><span data-d-stream-word>یک نمونهٔ فارسی برای آزمایش است.</span></p>
<p id="currency-label"><span data-d-default-strong><span data-d-stream-word>Revolut </span><span data-d-stream-word>(+€ </span><span data-d-stream-word>200):</span></span> <span data-d-stream-word>این یک نام ساختگی برای تست پرانتز و عدد در متن فارسی است.</span></p>
<p id="native-english">English-first paragraph with a later عبارت فارسی should stay left-to-right and left-aligned.</p>
<table id="native-alignment"><tbody><tr><td data-d-align="end"><p><span>43</span></p></td><td data-d-align="center"><p><span>فارسی</span></p></td><td data-d-align="center"><p>English</p></td><td style="text-align: left"><p>متن فارسی</p></td></tr></tbody></table>
<div data-markdown-copy="code-block" id="native-prose"><div data-markdown-copy="exclude"><div class="truncate">Plain text</div><button aria-label="Wrap example">↵</button><button aria-label="Copy example">Copy</button></div><div class="chatgpt-code-scrollport" dir="ltr"><code><span>این متن فقط نمونه است.</span>\n<span>مرحله اول → مرحله دوم</span>\n<span>نتیجه با English token و عدد ۱۲۳</span>\n<span>پایان نمایش آزمایشی متن فارسی در کادر.</span></code></div></div>
<div data-markdown-copy="code-block" id="native-technical"><div data-markdown-copy="exclude"><div class="truncate">JavaScript</div></div><div class="chatgpt-code-scrollport" dir="ltr"><code>const greeting = "سلام";\nconsole.log(greeting);</code></div></div>
</div>`;
conversation.prepend(nativeCases);
const openWord = nativeCases.querySelector('#word-stream span');
const openWordText = openWord.firstChild;
const nativeProse = nativeCases.querySelector('#native-prose .chatgpt-code-scrollport');
const proseText = nativeProse.textContent;
const prefix = new URLSearchParams(location.search).has('baseline') ? '/baseline/' : '/';
let handle;
const checks=[];
const assert=(name,value)=>checks.push({name,passed:!!value});
const metrics={nodes:conversation.querySelectorAll('*').length, scans:0, walks:0, scanTimeMs:0, maxScanMs:0};
const result=document.querySelector('#results');
const stage = name => result.setAttribute('data-stage', name);
let watchdog;
try {
    window.chrome = {runtime:{getURL:()=>'/font.ttf'}};
    await load(`${prefix}core/bidi-isolate.js`);
    await load(`${prefix}core/rtl-engine.js`);
    await load(`${prefix}core/recipe-runner.js`);
    const run = RastChinRecipe.runPlatformRecipe;
    RastChinRecipe.runPlatformRecipe = recipe => {
        handle = run({...recipe, hosts:[location.hostname]});
        const engine=handle.engine;
        const process=engine.processQueue.bind(engine);
        engine.processQueue=()=>{ const start=performance.now(); metrics.scans++; process(); const elapsed=performance.now()-start; metrics.scanTimeMs+=elapsed; metrics.maxScanMs=Math.max(metrics.maxScanMs,elapsed); result.setAttribute('data-metrics',JSON.stringify(metrics)); };
        const apply=engine.applyToMessage.bind(engine);
        engine.applyToMessage=node=>{metrics.walks++;return apply(node);};
        return handle;
    };
    await load(`${prefix}core/font-inject.js`);
    await load(`${prefix}core/auto-direction.js`);
    await load(`${prefix}platforms/chatgpt-rtl.js`);
    if (prefix !== '/') watchdog=setTimeout(()=>{
        // Background-tab paint throttling can make a healthy run take more
        // than ten seconds. Abort only if scans indicate a feedback loop.
        if (metrics.scans < 100 && metrics.walks < 10000) return;
        handle.engine.observer?.disconnect(); handle.disable();
        result.setAttribute('data-watchdog','previous build failed to settle within 10 seconds');
    },10000);
    stage('idle');
    await settle();
    const settledWalks=metrics.walks;
    await settle();
    metrics.idleWalks=metrics.walks-settledWalks;
    assert('Idle chat stops rescanning',metrics.idleWalks===0);
    stage('sidebar-hover');
    const beforeHover=metrics.walks;
    for (let i=0;i<12;i++) {
        const tooltip=document.createElement('div'); tooltip.setAttribute('role','tooltip'); tooltip.textContent='عنوان ساختگی';
        document.body.appendChild(tooltip); document.querySelector('#hover').classList.toggle('hover');
        await pause(25); tooltip.remove(); await pause(25);
    }
    await settle();
    metrics.hoverWalks=metrics.walks-beforeHover;
    assert('Sidebar tooltip/hover does not scan transcript',metrics.hoverWalks===0);
    stage('paste');
    const beforePaste=transactions;
    editor.dispatch(editor.state.tr.insertText(('این یک prompt ساختگی با English و code است.\n').repeat(200),1));
    const prompt=editor.dom.textContent;
    const children=[...editor.dom.querySelectorAll('*')];
    await settle();
    assert('Large prompt is preserved',editor.dom.textContent===prompt);
    assert('Prompt nodes survive extension processing',children.every(n=>n.isConnected));
    assert('Paste causes no extra editor transactions',transactions-beforePaste===1);
    assert('Prompt descendants have no extension directions/fonts',!editor.dom.querySelector('[dir], [style], .rastchin-chatgpt-rtl, bdi[data-rastchin-bidi]'));
    assert('Currency-label Persian paragraph is RTL',getComputedStyle(nativeCases.querySelector('#currency-label')).direction==='rtl');
    assert('Native English-first paragraph stays LTR',getComputedStyle(nativeCases.querySelector('#native-english')).direction==='ltr');
    const nativeCells = nativeCases.querySelectorAll('#native-alignment td');
    assert('Native data-d-align end survives in numeric paragraph',getComputedStyle(nativeCells[0].querySelector('p')).textAlign==='right');
    assert('Native data-d-align center survives in Persian paragraph',getComputedStyle(nativeCells[1].querySelector('p')).textAlign==='center');
    assert('Native data-d-align center survives in English paragraph',getComputedStyle(nativeCells[2].querySelector('p')).textAlign==='center');
    assert('Native inline left alignment survives in Persian paragraph',getComputedStyle(nativeCells[3].querySelector('p')).textAlign==='left');
    assert('Word-stream Text identity is preserved',openWord.firstChild===openWordText);
    assert('Settled word-stream contains no structural wrappers',!nativeCases.querySelector('bdi[data-rastchin-bidi]'));
    const notebookWord = openWord.nextElementSibling;
    // An inline span's bounding box also includes its trailing whitespace,
    // which can form a separate RTL fragment. Measure just the Latin glyphs.
    const wordLeft = span => {
        const text = document.createTreeWalker(span, NodeFilter.SHOW_TEXT).nextNode();
        const range = document.createRange();
        range.setStart(text, 0); range.setEnd(text, text.textContent.trimEnd().length);
        return range.getBoundingClientRect().left;
    };
    assert('Open Notebook keeps Latin word order',wordLeft(openWord) < wordLeft(notebookWord));
    assert('Native Persian code-only body is RTL',getComputedStyle(nativeProse).direction==='rtl');
    assert('Native Persian code-only text is right-aligned',getComputedStyle(nativeProse.querySelector('code')).textAlign==='right');
    assert('Native Persian code-only text uses Persian font',getComputedStyle(nativeProse.querySelector('code')).fontFamily.includes('Vazirmatn'));
    assert('Native Persian code-only copy content is unchanged',nativeProse.textContent===proseText);
    assert('Native code toolbar stays LTR',getComputedStyle(nativeCases.querySelector('#native-prose [data-markdown-copy="exclude"]')).direction==='ltr');
    assert('Native code toolbar is not forced to monospace',!getComputedStyle(nativeCases.querySelector('#native-prose [data-markdown-copy="exclude"] .truncate')).fontFamily.includes('monospace'));
    assert('Native JavaScript stays LTR/monospace',getComputedStyle(nativeCases.querySelector('#native-technical code')).direction==='ltr' && !getComputedStyle(nativeCases.querySelector('#native-technical code')).fontFamily.includes('Vazirmatn'));
    nativeProse.querySelector('code').textContent='const greeting = "سلام";\nconsole.log(greeting);';
    await settle();
    assert('Regenerated technical text restores native LTR/monospace',getComputedStyle(nativeProse.querySelector('code')).direction==='ltr' && !getComputedStyle(nativeProse.querySelector('code')).fontFamily.includes('Vazirmatn'));
    nativeProse.querySelector('code').textContent=proseText;
    await settle();
    assert('Regenerated Persian text returns to RTL',getComputedStyle(nativeProse).direction==='rtl');
    const first=conversation.querySelector('[data-chatgpt-selection-message-id="sample-0"]').closest('article');
    assert('Short Latin product label is RTL',getComputedStyle(first.querySelector('li')).direction==='rtl');
    assert('Product-name list is RTL',getComputedStyle(first.querySelectorAll('li')[1]).direction==='rtl');
    assert('English item in RTL list stays LTR',getComputedStyle(first.querySelectorAll('li')[2]).direction==='ltr');
    assert('Latin-labelled Persian paragraph is RTL',getComputedStyle(first.querySelector('p')).direction==='rtl');
    assert('Technical code remains LTR',getComputedStyle(first.querySelector('pre')).direction==='ltr');
    const table=first.querySelector('table');
    assert('English table cell stays LTR',getComputedStyle(table.rows[2].cells[2]).direction==='ltr');
    assert('Numeric column stays right-aligned',getComputedStyle(table.rows[1].cells[1]).textAlign==='right');
    assert('Explicit centered Persian cell stays centered',getComputedStyle(first.querySelector('.centered td')).textAlign==='center');
    const minGap=()=>Math.min(...[...table.rows].flatMap(row=>{
        const cells=[...row.cells].sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x);
        const textRect=cell=>{const range=document.createRange();range.selectNodeContents(cell);return range.getBoundingClientRect();};
        return cells.slice(1).map((cell,i)=>textRect(cell).left-textRect(cells[i]).right);
    }));
    metrics.tableMinGapPx=minGap();
    assert('Mixed-language cell text has a visible gap',metrics.tableMinGapPx>=10);
    const columns=[...table.rows[0].cells].map(cell=>cell.getBoundingClientRect().x);
    assert('Mixed-language rows retain matching column positions',[...table.rows].every(row=>[...row.cells].every((cell,i)=>Math.abs(cell.getBoundingClientRect().x-columns[i])<1)));
    assert('Host header action space is preserved',getComputedStyle(table.rows[0].cells[3]).paddingInlineEnd==='40px');
    assert('English-only table keeps native padding',getComputedStyle(first.querySelector('.english-only td')).paddingInlineStart==='0px');
    stage('streaming');
    const live=document.createElement('article');live.className='result-streaming';
    live.innerHTML='<p>یک پاسخ زنده با OpenAI</p>';conversation.appendChild(live);
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    assert('Streaming response is not structurally wrapped',!live.querySelector('bdi[data-rastchin-bidi]'));
    live.classList.remove('result-streaming');await settle();
    assert('Streaming completion keeps RTL',getComputedStyle(live.querySelector('p')).direction==='rtl');
    const oldWalks=metrics.walks;
    const last=conversation.lastElementChild.querySelector('p');last.firstChild.textContent='بند تازه پس از تولید پاسخ';await settle();
    metrics.singleUpdateWalks=metrics.walks-oldWalks;
    assert('Single paragraph update is bounded',metrics.singleUpdateWalks<10);
    handle.disable();await pause(100);
    stage('toggle');
    assert('Disable restores response direction',!first.querySelector('p').hasAttribute('dir'));
    assert('Disable restores native prose code-only body',nativeProse.getAttribute('dir')==='ltr' && !nativeProse.style.textAlign);
    assert('Disable restores native table padding',getComputedStyle(table.rows[0].cells[2]).paddingInlineStart==='0px');
    assert('Disable preserves native numeric alignment',table.rows[1].cells[1].getAttribute('align')==='right' && !table.rows[1].cells[1].style.textAlign);
    handle.enable();await settle();
    assert('Re-enable restores Persian text',getComputedStyle(first.querySelector('p')).direction==='rtl');
    assert('Re-enable restores native Persian code-only text',getComputedStyle(nativeProse.querySelector('code')).direction==='rtl');
    assert('Re-enable preserves mixed-cell spacing',minGap()>=10);
    assert('Re-enable preserves numeric alignment',getComputedStyle(table.rows[1].cells[1]).textAlign==='right');
} catch(error) {checks.push({name:String(error),passed:false});}
finally {
    clearTimeout(watchdog);
    // Do not leave the baseline's known feedback loop consuming CPU in Brave.
    if(prefix!=='/') { handle?.engine.observer?.disconnect();handle?.disable();editor.destroy(); }
    const report={mode:prefix==='/'?'fixed':'baseline',checks,metrics};
    result.textContent=JSON.stringify(report,null,2);
    result.setAttribute('data-finished','true');
    console.log('RastChin ChatGPT regression',report);
}
