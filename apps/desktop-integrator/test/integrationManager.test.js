'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { IntegrationManager } = require('../src/main/services/integrationManager');

class FakeRuntime extends EventEmitter {
    constructor(options) { super(); this.options = options; this.state = 'idle'; }
    snapshot() { return { targetId: this.options.targetId, state: this.state, lastError: null }; }
    async start() { this.state = 'active'; this.emit('status', this.snapshot()); return this.snapshot(); }
    async stop() { this.state = 'stopped'; this.emit('status', this.snapshot()); return this.snapshot(); }
}

function discovery({ running = false } = {}) {
    return async () => ({
        platform: 'win32', supportedPlatform: true, diagnostics: [], targets: [
            {
                id: 'chatgpt', name: 'ChatGPT / Codex', vendor: 'OpenAI', detected: true,
                running, compatibility: 'needs-probe',
                installations: [{ targetId: 'chatgpt', executable: 'C:\\Apps\\ChatGPT.exe', version: '1.0.0', source: 'msix' }]
            },
            {
                id: 'claude', name: 'Claude Desktop', vendor: 'Anthropic', detected: false,
                running: false, compatibility: 'host-blocked', runtimeAvailability: 'host-blocked',
                blockedReason: 'پشتیبانی از Claude Desktop در نسخه‌های آینده اضافه خواهد شد.',
                installations: []
            }
        ]
    });
}

test('release mode refuses runtime injection', async () => {
    const manager = new IntegrationManager({
        platform: 'win32', runtimeEnabled: false, discover: discovery()
    });
    await manager.scan();
    await assert.rejects(manager.enable('chatgpt'), /disabled for this build or platform/);
});

test('enabled runtime policy enables and disables a detected stable target', async () => {
    const manager = new IntegrationManager({
        platform: 'win32', runtimeEnabled: true, discover: discovery(),
        runtimeFactory: options => new FakeRuntime(options)
    });
    await manager.scan();
    assert.equal((await manager.enable('chatgpt')).state, 'active');
    assert.equal(manager.snapshot().targets.find(target => target.id === 'chatgpt').runtime.state, 'active');
    assert.equal((await manager.disable('chatgpt')).state, 'stopped');
});

test('Claude desktop is rejected before any runtime or launch is created', async () => {
    let runtimes = 0;
    const manager = new IntegrationManager({
        platform: 'win32', runtimeEnabled: true, discover: discovery(),
        runtimeFactory: options => { runtimes += 1; return new FakeRuntime(options); }
    });
    await manager.scan();
    await assert.rejects(manager.enable('claude'), /مسدود.*نسخه‌های آینده/);
    assert.equal(runtimes, 0);
});

test('requires a normally running host to be closed before private-pipe launch', async () => {
    const manager = new IntegrationManager({
        platform: 'win32', runtimeEnabled: true, discover: discovery({ running: true }),
        runtimeFactory: options => new FakeRuntime(options)
    });
    await manager.scan();
    await assert.rejects(manager.enable('chatgpt'), /Close ChatGPT/);
});

test('a retry rescans process state instead of reusing a failed CDP runtime', async () => {
    let scans = 0;
    let runtimes = 0;
    const discover = async () => {
        scans += 1;
        return discovery({ running: scans > 1 })();
    };
    class FailingRuntime extends FakeRuntime {
        async start() {
            this.state = 'failed';
            this.emit('status', this.snapshot());
            throw new Error('probe failed');
        }
    }
    const manager = new IntegrationManager({
        platform: 'win32', runtimeEnabled: true, discover,
        runtimeFactory: options => { runtimes += 1; return new FailingRuntime(options); }
    });
    await assert.rejects(manager.enable('chatgpt'), /probe failed/);
    await assert.rejects(manager.enable('chatgpt'), /Close ChatGPT/);
    assert.equal(scans, 2);
    assert.equal(runtimes, 1);
});

for (const [platform, executable, source, extra] of [
    ['darwin', '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', 'app-bundle', {
        bundlePath: '/Applications/ChatGPT.app', bundleIdentifier: 'com.openai.codex'
    }],
    ['linux', '/usr/bin/chatgpt', 'deb', {
        packageName: 'chatgpt', packageManager: 'dpkg',
        processExecutable: '/usr/lib/chatgpt/ChatGPT'
    }]
]) {
    test(`${platform} can enable a discovered stable ChatGPT runtime`, async () => {
        const discover = async () => ({
            platform, supportedPlatform: true, diagnostics: [], targets: [{
                id: 'chatgpt', name: 'ChatGPT / Codex', vendor: 'OpenAI', detected: true,
                running: false, compatibility: 'needs-probe', runtimeAvailability: 'stable',
                installations: [{ targetId: 'chatgpt', executable, version: '1.0.0', source, ...extra }]
            }]
        });
        const manager = new IntegrationManager({
            platform, runtimeEnabled: true, discover,
            runtimeFactory: options => new FakeRuntime(options)
        });
        await manager.scan();
        const result = await manager.enable('chatgpt');
        assert.equal(result.state, 'active');
        assert.equal(manager.runtimes.get('chatgpt').options.platform, platform);
        assert.equal(manager.runtimes.get('chatgpt').options.installation.source, source);
    });
}

test('a Linux host outside the supported matrix is rejected after discovery', async () => {
    let runtimes = 0;
    const reason = 'This Linux distribution is outside the validated support matrix.';
    const manager = new IntegrationManager({
        platform: 'linux', runtimeEnabled: true,
        discover: async () => ({
            platform: 'linux', supportedPlatform: true, diagnostics: [], targets: [{
                id: 'chatgpt', name: 'ChatGPT / Codex', detected: false, running: false,
                compatibility: 'platform-unavailable', runtimeAvailability: 'platform-unavailable',
                blockedReason: reason, installations: []
            }]
        }),
        runtimeFactory: options => { runtimes += 1; return new FakeRuntime(options); }
    });

    await assert.rejects(manager.enable('chatgpt'), new RegExp(reason));
    assert.equal(runtimes, 0);
});

test('an unknown desktop platform fails closed before discovery or launch', async () => {
    const manager = new IntegrationManager({
        platform: 'freebsd', runtimeEnabled: true,
        discover: async () => ({ platform: 'freebsd', supportedPlatform: false, diagnostics: [], targets: [] })
    });
    await assert.rejects(manager.enable('chatgpt'), /not supported on this platform/);
});
