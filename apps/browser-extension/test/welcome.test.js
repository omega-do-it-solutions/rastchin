'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/ui/welcome/welcome.js'), 'utf8');

function check(label, actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function loadWelcome({ chrome, browser } = {}) {
    const calls = {
        panelOpens: [],
        sidebarOpens: 0,
        assignedUrls: []
    };
    const listeners = {};
    const elements = new Map();

    function element(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                href: 'chrome-extension://test/src/ui/side-panel/side-panel.html',
                textContent: '',
                addEventListener(type, listener) {
                    listeners[`${id}:${type}`] = listener;
                }
            });
        }
        return elements.get(id);
    }

    const context = {
        console,
        document: {
            addEventListener(type, listener) {
                listeners[`document:${type}`] = listener;
            },
            getElementById: element
        },
        window: {
            close() {},
            location: {
                assign(url) {
                    calls.assignedUrls.push(url);
                }
            }
        }
    };
    if (chrome) context.chrome = chrome(calls);
    if (browser) context.browser = browser(calls);

    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'welcome.js' });
    listeners['document:DOMContentLoaded']();

    return { calls, element, listeners };
}

function clickSettings(listeners) {
    let prevented = false;
    listeners['openSettingsBtn:click']({
        preventDefault() {
            prevented = true;
        }
    });
    return prevented;
}

(async () => {
    {
        const { calls, element, listeners } = loadWelcome({
            chrome: calls => ({
                runtime: { getManifest: () => ({ version: '1.1.77' }) },
                windows: { WINDOW_ID_CURRENT: -2 },
                sidePanel: {
                    open(options) {
                        calls.panelOpens.push(options);
                        return Promise.resolve();
                    }
                }
            })
        });

        check('welcome shows the installed version', element('welcomeVersion').textContent, 'v1.1.77');
        check('Chrome side-panel click prevents link navigation', clickSettings(listeners), true);
        check('Chrome side-panel opens in the current window', calls.panelOpens, [{ windowId: -2 }]);
    }

    {
        const { calls, listeners } = loadWelcome({
            chrome: () => ({ runtime: { getManifest: () => ({ version: 'test' }) } })
        });

        check('unsupported Chrome keeps direct-link fallback', clickSettings(listeners), false);
        check('unsupported Chrome does not try the side-panel API', calls.panelOpens, []);
    }

    {
        const { calls, listeners } = loadWelcome({
            browser: calls => ({
                sidebarAction: {
                    open() {
                        calls.sidebarOpens += 1;
                        return Promise.resolve();
                    }
                }
            })
        });

        check('Firefox sidebar click prevents link navigation', clickSettings(listeners), true);
        check('Firefox sidebar opens once', calls.sidebarOpens, 1);
    }

    {
        const { calls, listeners } = loadWelcome({
            chrome: () => ({
                runtime: { getManifest: () => ({ version: 'test' }) },
                windows: { WINDOW_ID_CURRENT: -2 },
                sidePanel: {
                    open() {
                        return Promise.reject(new Error('panel unavailable'));
                    }
                }
            })
        });

        clickSettings(listeners);
        await Promise.resolve();
        check(
            'rejected side-panel open navigates to the direct fallback',
            calls.assignedUrls,
            ['chrome-extension://test/src/ui/side-panel/side-panel.html']
        );
    }

    console.log('ALL PASS (welcome side-panel CTA)');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
