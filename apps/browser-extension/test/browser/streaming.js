/* Browser fixture using real engine, observer, recipe lifecycle and font CSS.
   Only this fixture overrides the host gate to localhost. Production remains
   exact-host-only; there is no test hook or localhost match in the extension. */
(async () => {
    const results = document.querySelector('#results');
    const checks = [];
    const check = (label, passes) => {
        checks.push(`${passes ? 'PASS' : 'FAIL'} ${label}`);
        if (!passes) throw new Error(label);
    };
    const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const handles = {};
    const run = RastChinRecipe.runPlatformRecipe;
    RastChinRecipe.runPlatformRecipe = recipe => {
        const handle = run({ ...recipe, hosts: [location.hostname] });
        handles[recipe.storageKey] = handle;
        return handle;
    };
    try {
        for (const platform of ['twitch', 'kick']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = `/platforms/${platform}-rtl.js`;
                script.onload = resolve; script.onerror = reject;
                document.head.append(script);
            });
            const handle = handles[`${platform}Enabled`];
            const container = document.querySelector(platform === 'twitch' ? '#twitch-fixture' : '#channel-chatroom');
            const message = document.querySelector(`#${platform}-message`);
            const english = document.querySelector(`#${platform}-english`);
            const composer = container.querySelector('[contenteditable]');
            const children = [...message.childNodes];
            const editorChildren = [...composer.querySelectorAll('*')];
            const originalMessage = message.innerHTML;
            const originalDir = message.getAttribute('dir');
            handle.enable();
            await settle();
            await document.fonts.ready;
            check(`${platform}: Persian is RTL and right aligned`, getComputedStyle(message).direction === 'rtl' && getComputedStyle(message).textAlign === 'right');
            check(`${platform}: local Persian font is loaded`, document.fonts.check('16px Vazirmatn', 'سلام') && getComputedStyle(message).fontFamily.includes('Vazirmatn'));
            check(`${platform}: English-first stays LTR`, getComputedStyle(english).direction === 'ltr');
            check(`${platform}: username and chat row stay LTR`, getComputedStyle(container.querySelector('button')).direction === 'ltr' && getComputedStyle(message.parentElement).direction === 'ltr');
            check(`${platform}: composer is RTL`, getComputedStyle(composer).direction === 'rtl');
            check(`${platform}: message text/link/emote nodes are unchanged`, children.every((node, index) => message.childNodes[index] === node) && message.innerHTML === originalMessage);
            check(`${platform}: composer children untouched`, editorChildren.every(node => node.getAttribute('dir') === null && !node.className.includes('rastchin')));
            const fresh = message.cloneNode(true);
            fresh.removeAttribute('id'); fresh.classList.remove(`rastchin-${platform}-rtl`); fresh.removeAttribute('dir'); fresh.removeAttribute('style');
            fresh.textContent = 'این پیام تازه رسیده است.';
            message.parentElement.append(fresh);
            await settle();
            check(`${platform}: live arrival is processed by MutationObserver`, fresh.getAttribute('dir') === 'rtl');
            fresh.firstChild.data = 'English replacement';
            await settle();
            check(`${platform}: recycled English message restores`, fresh.getAttribute('dir') === null && getComputedStyle(fresh).direction === 'ltr');
            const editorText = composer.querySelector(platform === 'twitch' ? '[data-slate-node="text"]' : 'p').firstChild;
            editorText.data = 'English draft';
            composer.dispatchEvent(new InputEvent('input', { bubbles: true }));
            await settle();
            check(`${platform}: editing English restores composer`, composer.getAttribute('dir') === null);
            editorText.data = 'پیش‌نویس فارسی';
            composer.dispatchEvent(new InputEvent('input', { bubbles: true }));
            await settle();
            check(`${platform}: Persian draft reapplies without replacing children`, composer.getAttribute('dir') === 'rtl' && editorChildren.every(node => composer.contains(node)));
            handle.disable();
            check(`${platform}: disabling restores original direction and classes`, message.getAttribute('dir') === originalDir && !message.classList.contains(`rastchin-${platform}-rtl`) && composer.getAttribute('dir') === null);
            handle.enable();
            await settle();
            check(`${platform}: re-enabling works`, message.getAttribute('dir') === 'rtl');
            check(`${platform}: no horizontal overflow`, container.scrollWidth <= container.clientWidth);
        }
        results.dataset.result = 'pass';
        results.textContent = `${checks.length} checks passed\n${checks.join('\n')}`;
    } catch (error) {
        results.dataset.result = 'fail';
        results.textContent = `${checks.join('\n')}\nERROR: ${error.message}`;
    }
})();
