'use strict';
// Regression suite for src/core/controller.js runtime platform reporting.
// Run: `node test/controller.test.js` (or `pnpm test`).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'core', 'controller.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

let failures = 0;
let total = 0;
function check(label, got, expected) {
    total += 1;
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures += 1;
        console.log(`FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        got:      ${JSON.stringify(got)}`);
    }
}

function loadController(hostname, pathname = '/', options = {}) {
    const messageListeners = [];
    const storageListeners = [];
    const ctx = {
        window: {
            location: {
                hostname,
                pathname,
                ancestorOrigins: options.ancestorOrigins || []
            }
        },
        document: {
            referrer: options.referrer || ''
        },
        chrome: {
            runtime: {
                onMessage: { addListener: fn => messageListeners.push(fn) }
            },
            storage: {
                sync: {
                    get: (_keys, callback) => callback({})
                },
                onChanged: { addListener: fn => storageListeners.push(fn) }
            }
        },
        console
    };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return { ctx, messageListeners, storageListeners };
}

{
    const { ctx, messageListeners, storageListeners } = loadController('claude.ai');
    check('controller: storage listener registered', storageListeners.length, 1);
    check('controller: runtime message listener registered', messageListeners.length, 1);
    check('controller: direct platform info key', ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'claudeEnabled');

    let response = null;
    const returned = messageListeners[0]({ type: 'rastchin:get-platform' }, {}, value => { response = value; });
    check('controller: message listener returns synchronously', returned, false);
    check('controller: message response type', response.type, 'rastchin:platform-info');
    check('controller: message response storageKey', response.storageKey, 'claudeEnabled');
    check('controller: message response hostname', response.hostname, 'claude.ai');

    response = 'unchanged';
    check('controller: ignores unrelated messages', messageListeners[0]({ type: 'other' }, {}, value => { response = value; }), false);
    check('controller: unrelated message sends no response', response, 'unchanged');
}

{
    const { ctx } = loadController('team.notion.site');
    check('controller: notion.site suffix still resolves', ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'notionEnabled');
}

{
    const { ctx } = loadController('claudeusercontent.com');
    check('controller: claudeusercontent root resolves claudeEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'claudeEnabled');
}

{
    const { ctx } = loadController('preview.claudeusercontent.com');
    check('controller: claudeusercontent suffix resolves claudeEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'claudeEnabled');
}

{
    // MCP "apps" (e.g. the live car-comparison cards) render in an iframe on
    // claudemcpcontent.com — it must gate under the Claude toggle so the recipe
    // runs there. Root + hashed subdomain both resolve.
    const { ctx } = loadController('claudemcpcontent.com');
    check('controller: claudemcpcontent root resolves claudeEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'claudeEnabled');
}

{
    const { ctx } = loadController('3ab55ff684593a5518881205f01b3244.claudemcpcontent.com');
    check('controller: claudemcpcontent hashed subdomain resolves claudeEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'claudeEnabled');
}

{
    const { ctx } = loadController('translate.google.com');
    check('controller: translate.google.com resolves googleTranslateEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'googleTranslateEnabled');
}

{
    const { ctx } = loadController('marketplace.visualstudio.com', '/items');
    check('controller: Visual Studio Marketplace resolves vsMarketplaceEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'vsMarketplaceEnabled');
}

{
    const { ctx } = loadController('', '/blank', {
        referrer: 'https://docs.google.com/document/d/example/edit'
    });
    check('controller: docs about:blank iframe resolves googleWorkspaceEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'googleWorkspaceEnabled');
}

{
    const { ctx } = loadController('', '/blank', {
        ancestorOrigins: ['https://docs.google.com']
    });
    check('controller: docs ancestor iframe resolves googleWorkspaceEnabled',
        ctx.window.chatbotConfig.getCurrentChatbot(), 'googleWorkspaceEnabled');
}

{
    const { ctx } = loadController('', '/blank', {
        referrer: 'https://claude.ai/chat/example'
    });
    check('controller: claude about:blank iframe resolves claudeEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'claudeEnabled');
}

{
    const { ctx } = loadController('', '/blank', {
        ancestorOrigins: ['https://claude.ai']
    });
    check('controller: claude ancestor iframe resolves claudeEnabled',
        ctx.window.chatbotConfig.getCurrentChatbot(), 'claudeEnabled');
}

{
    const { ctx } = loadController('', '/blank', {
        referrer: 'https://example.com/'
    });
    check('controller: non-docs about:blank iframe remains unmapped',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, null);
}

// --- GitHub owns the whole github.com document -------------------------------
// One GitHub recipe covers normal product surfaces and github.com/copilot, so
// client-side navigation never changes the storage key that gates the document.
{
    const { ctx } = loadController('github.com', '/copilot/chat');
    check('controller: github /copilot reports githubEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'githubEnabled');
}
{
    const { ctx } = loadController('github.com', '/anthropics/claude-code');
    check('controller: normal GitHub page reports githubEnabled',
        ctx.window.chatbotConfig.getCurrentPlatformInfo().storageKey, 'githubEnabled');
    check('controller: internal gating key is githubEnabled',
        ctx.window.chatbotConfig.getCurrentChatbot(), 'githubEnabled');
}

// --- drift guard: every controller storage key must exist in the shared registry
{
    const registrySource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'ui', 'shared', 'platform-registry.js'), 'utf8');
    const registryKeys = new Set([...registrySource.matchAll(/storageKey: '([^']+)'/g)].map(m => m[1]));
    const urlMapBlock = (source.match(/URL_TO_CHATBOT = \{([\s\S]*?)\}/) || [, ''])[1];
    const controllerKeys = [...new Set([...urlMapBlock.matchAll(/:\s*'([^']+)'/g)].map(m => m[1]))];
    check('parity: controller maps all 20 platform keys', controllerKeys.length, 20);
    controllerKeys.forEach(key => check(`parity: registry knows ${key}`, registryKeys.has(key), true));
}

if (failures === 0) {
    console.log(`ALL PASS (${total} assertions)`);
    process.exit(0);
} else {
    console.log(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}
