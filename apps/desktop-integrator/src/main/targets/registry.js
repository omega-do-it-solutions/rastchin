'use strict';

const TARGETS = Object.freeze([
    Object.freeze({
        id: 'chatgpt',
        name: 'ChatGPT / Codex',
        vendor: 'OpenAI',
        runtimeHost: 'chatgpt.com',
        desktopRuntime: Object.freeze({
            availability: 'stable',
            platforms: Object.freeze({
                win32: Object.freeze({ availability: 'stable' }),
                darwin: Object.freeze({ availability: 'stable' }),
                linux: Object.freeze({ availability: 'stable' })
            })
        }),
        executableNames: ['ChatGPT.exe', 'OpenAI.exe'],
        packagePatterns: ['ChatGPT', 'OpenAI'],
        processNames: ['ChatGPT', 'OpenAI'],
        executableNamesByPlatform: Object.freeze({
            win32: Object.freeze(['ChatGPT.exe', 'OpenAI.exe']),
            darwin: Object.freeze(['ChatGPT', 'Codex']),
            linux: Object.freeze(['chatgpt'])
        }),
        processNamesByPlatform: Object.freeze({
            win32: Object.freeze(['ChatGPT', 'OpenAI']),
            darwin: Object.freeze(['ChatGPT', 'Codex']),
            linux: Object.freeze(['ChatGPT'])
        }),
        macBundles: Object.freeze([
            Object.freeze({ name: 'ChatGPT.app', executableNames: Object.freeze(['ChatGPT']) }),
            Object.freeze({ name: 'Codex.app', executableNames: Object.freeze(['Codex']) })
        ]),
        macIdentity: Object.freeze({
            bundleIdentifier: 'com.openai.codex',
            teamIdentifier: '2DC432GLL2',
            signatureRequired: true
        }),
        linuxPackages: Object.freeze([
            Object.freeze({
                manager: 'dpkg',
                packageName: 'chatgpt',
                launcher: '/usr/bin/chatgpt',
                launcherTarget: '/usr/lib/chatgpt/codex-launcher',
                processExecutable: '/usr/lib/chatgpt/ChatGPT',
                // Kept as a launch-path alias for the runtime registry contract.
                executable: '/usr/bin/chatgpt',
                source: 'deb'
            }),
            Object.freeze({
                manager: 'rpm',
                packageName: 'chatgpt',
                launcher: '/usr/bin/chatgpt',
                launcherTarget: '/usr/lib/chatgpt/codex-launcher',
                processExecutable: '/usr/lib/chatgpt/ChatGPT',
                // Kept as a launch-path alias for the runtime registry contract.
                executable: '/usr/bin/chatgpt',
                source: 'rpm'
            })
        ]),
        urlPatterns: [/^https:\/\/(?:chat\.)?chatgpt\.com\//i, /^https:\/\/chat\.openai\.com\//i],
        rendererUrlPatterns: [
            /\/webview\/index\.html(?:$|[?#])/i,
            /(?:^|\/)ChatGPT(?:\.exe)?\//i,
            /^(?:file|app|electron):/i,
            /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i
        ],
        titlePatterns: [/ChatGPT/i, /Codex/i],
        signatureSelectors: [
            '[data-type="unified-composer"]',
            '#prompt-textarea',
            '[data-message-author-role]',
            '[data-testid="conversation-turn"]',
            '[data-codex-composer-request-navigation="true"]'
        ]
    }),
    Object.freeze({
        id: 'claude',
        name: 'Claude Desktop',
        vendor: 'Anthropic',
        runtimeHost: 'claude.ai',
        desktopRuntime: Object.freeze({
            availability: 'host-blocked',
            reason: 'نسخه‌های فعلی Claude Desktop اتصال امن موردنیاز برای اعمال راست‌چین را مسدود می‌کنند. پشتیبانی از این برنامه پس از ارائهٔ روش رسمی، در نسخه‌های آینده اضافه خواهد شد.',
            platforms: Object.freeze({
                win32: Object.freeze({ availability: 'host-blocked' }),
                darwin: Object.freeze({ availability: 'host-blocked' }),
                linux: Object.freeze({ availability: 'host-blocked' })
            })
        }),
        executableNames: ['Claude.exe'],
        packagePatterns: ['Claude', 'Anthropic'],
        processNames: ['Claude'],
        executableNamesByPlatform: Object.freeze({
            win32: Object.freeze(['Claude.exe']),
            darwin: Object.freeze(['Claude']),
            linux: Object.freeze(['claude-desktop'])
        }),
        processNamesByPlatform: Object.freeze({
            win32: Object.freeze(['Claude']),
            darwin: Object.freeze(['Claude']),
            linux: Object.freeze(['claude-desktop'])
        }),
        macBundles: Object.freeze([
            Object.freeze({ name: 'Claude.app', executableNames: Object.freeze(['Claude']) })
        ]),
        macIdentity: Object.freeze({ signatureRequired: false }),
        linuxPackages: Object.freeze([
            Object.freeze({ manager: 'dpkg', packageName: 'claude-desktop', executable: '/usr/bin/claude-desktop', source: 'deb' })
        ]),
        urlPatterns: [/^https:\/\/claude\.ai\//i, /claudeusercontent\.com/i, /claudemcpcontent\.com/i],
        rendererUrlPatterns: [
            /\/\.vite\/renderer\/main_window\/index\.html(?:$|[?#])/i,
            /\/renderer\/main_window\/index\.html(?:$|[?#])/i,
            /^(?:file|app|electron):/i,
            /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i
        ],
        titlePatterns: [/Claude/i],
        signatureSelectors: [
            '.font-claude-message',
            '.font-claude-response',
            '[data-test-render-count]',
            '[data-testid*="composer" i]',
            '[contenteditable="true"]'
        ]
    })
]);

function getTarget(id) {
    return TARGETS.find(target => target.id === id) || null;
}

function runtimeSupportFor(targetOrId, platform = process.platform) {
    const target = typeof targetOrId === 'string' ? getTarget(targetOrId) : targetOrId;
    if (!target) return Object.freeze({ availability: 'unavailable', reason: 'Unknown target.' });
    const platformMap = target.desktopRuntime?.platforms;
    if (platformMap && !platformMap[platform]) {
        return Object.freeze({
            availability: 'platform-unavailable',
            reason: `${target.name} is not supported on this platform.`
        });
    }
    const platformSupport = platformMap?.[platform] || {};
    return Object.freeze({
        availability: platformSupport.availability || target.desktopRuntime?.availability || 'unavailable',
        reason: platformSupport.reason || target.desktopRuntime?.reason || ''
    });
}

function runtimeIsAvailable(support) {
    return support?.availability === 'stable' || support?.availability === 'preview';
}

function executableNamesFor(targetOrId, platform = process.platform) {
    const target = typeof targetOrId === 'string' ? getTarget(targetOrId) : targetOrId;
    if (!target) return [];
    return target.executableNamesByPlatform?.[platform] || target.executableNames || [];
}

function processNamesFor(targetOrId, platform = process.platform) {
    const target = typeof targetOrId === 'string' ? getTarget(targetOrId) : targetOrId;
    if (!target) return [];
    return target.processNamesByPlatform?.[platform] || target.processNames || [];
}

function publicTarget(target) {
    return {
        id: target.id,
        name: target.name,
        vendor: target.vendor,
        runtimeHost: target.runtimeHost
    };
}

module.exports = {
    TARGETS,
    executableNamesFor,
    getTarget,
    processNamesFor,
    publicTarget,
    runtimeIsAvailable,
    runtimeSupportFor
};
