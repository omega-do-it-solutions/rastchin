'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const {
    diagnoseLaunchFailure,
    ExperimentalRuntime,
    resultValue,
    safeRendererUrl,
    sanitizedHostEnvironment,
    sanitizedPosixEnvironment,
    sanitizedWindowsEnvironment
} = require('../src/main/services/runtime/experimentalRuntime');

async function waitUntil(predicate, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`Condition was not met within ${timeoutMs}ms.`);
}

test('a host debug-switch refusal replaces the generic closed-client error', () => {
    const error = diagnoseLaunchFailure(
        { name: 'Claude Desktop' },
        new Error('CDP client closed.'),
        'Claude: refusing to start — a debugging or network-override switch is present on the command line.'
    );
    assert.match(error.message, /Claude Desktop rejected the private Chromium debugging connection/);
    assert.doesNotMatch(error.message, /CDP client closed/);
});

test('sanitized host environment does not forward API keys or debug flags', () => {
    const environment = sanitizedWindowsEnvironment({
        Path: 'C:\\Windows', USERPROFILE: 'C:\\Users\\Test',
        OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret',
        NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1'
    });
    assert.equal(environment.Path, 'C:\\Windows');
    assert.equal(environment.USERPROFILE, 'C:\\Users\\Test');
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.ANTHROPIC_API_KEY, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.ELECTRON_RUN_AS_NODE, undefined);
});

test('sanitized POSIX environment preserves desktop-session values but strips secrets and loader overrides', () => {
    const environment = sanitizedPosixEnvironment({
        HOME: '/home/test', PATH: '/usr/bin', LANG: 'fa_IR.UTF-8',
        DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', XDG_RUNTIME_DIR: '/run/user/1000',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
        GTK_IM_MODULE: 'ibus', QT_IM_MODULE: 'ibus', XMODIFIERS: '@im=ibus',
        IBUS_ADDRESS: 'unix:path=/run/user/1000/ibus/bus',
        OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret',
        NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1', DYLD_INSERT_LIBRARIES: '/tmp/bad'
    });
    assert.equal(environment.HOME, '/home/test');
    assert.equal(environment.WAYLAND_DISPLAY, 'wayland-0');
    assert.equal(environment.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
    assert.equal(environment.GTK_IM_MODULE, 'ibus');
    assert.equal(environment.QT_IM_MODULE, 'ibus');
    assert.equal(environment.XMODIFIERS, '@im=ibus');
    assert.equal(environment.IBUS_ADDRESS, 'unix:path=/run/user/1000/ibus/bus');
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.DYLD_INSERT_LIBRARIES, undefined);
    assert.deepEqual(sanitizedHostEnvironment('linux', { HOME: '/home/test' }), { HOME: '/home/test' });
});

test('macOS runtime revalidates the signed bundle immediately before launch', async () => {
    let checks = 0;
    const executable = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
    const runtime = new ExperimentalRuntime({
        targetId: 'chatgpt', platform: 'darwin', executable,
        installation: { bundlePath: '/Applications/ChatGPT.app' },
        exists: () => true,
        verifyMacAppBundle: async bundlePath => {
            checks += 1;
            assert.equal(bundlePath, '/Applications/ChatGPT.app');
            return { executable };
        }
    });
    await runtime.validateLaunch();
    assert.equal(checks, 1);
});

test('Linux runtime revalidates exact official package identity before launch', async () => {
    let checks = 0;
    const runtime = new ExperimentalRuntime({
        targetId: 'chatgpt', platform: 'linux', executable: '/usr/bin/chatgpt',
        installation: { packageName: 'chatgpt', packageManager: 'dpkg' },
        exists: () => true,
        inspectLinuxPackage: async (spec, options) => {
            checks += 1;
            assert.equal(spec.packageName, 'chatgpt');
            assert.equal(spec.launcher, '/usr/bin/chatgpt');
            assert.equal(options.strict, true);
            return { executable: spec.launcher };
        }
    });
    await runtime.validateLaunch();
    assert.equal(checks, 1);
});

test('Linux starts the verified package launcher with private pipes and Persian IME environment', async () => {
    let spawnCall = null;
    const spawnStub = (command, args, options) => {
        spawnCall = { command, args, options };
        const stderr = new PassThrough();
        const cdpWrite = new PassThrough();
        const cdpRead = new PassThrough();
        const child = Object.assign(new EventEmitter(), {
            stderr,
            stdio: [null, null, stderr, cdpWrite, cdpRead],
            unref() {}
        });
        cdpWrite.on('data', chunk => {
            for (const frame of String(chunk).split('\0').filter(Boolean)) {
                const request = JSON.parse(frame);
                cdpRead.write(`${JSON.stringify({
                    id: request.id,
                    result: request.method === 'Browser.getVersion' ? { product: 'Chrome/Test' } : {}
                })}\0`);
            }
        });
        return child;
    };
    const runtime = new ExperimentalRuntime({
        targetId: 'chatgpt', platform: 'linux', executable: '/usr/bin/chatgpt',
        installation: { packageName: 'chatgpt', packageManager: 'dpkg' },
        exists: () => true,
        environment: {
            HOME: '/home/test', PATH: '/usr/bin', DISPLAY: ':0',
            GTK_IM_MODULE: 'ibus', XMODIFIERS: '@im=ibus', OPENAI_API_KEY: 'secret'
        },
        inspectLinuxPackage: async spec => ({ executable: spec.launcher }),
        spawn: spawnStub,
        pollIntervalMs: 60000
    });
    runtime.waitForCompatibleRenderer = async () => true;

    const status = await runtime.start();
    assert.equal(status.state, 'active');
    assert.equal(spawnCall.command, '/usr/bin/chatgpt');
    assert.deepEqual(spawnCall.args, ['--remote-debugging-pipe']);
    assert.deepEqual(spawnCall.options.stdio, ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']);
    assert.equal(spawnCall.options.cwd, '/home/test');
    assert.equal(spawnCall.options.env.GTK_IM_MODULE, 'ibus');
    assert.equal(spawnCall.options.env.XMODIFIERS, '@im=ibus');
    assert.equal(spawnCall.options.env.OPENAI_API_KEY, undefined);
    await runtime.stop();
});

test('runtime cleanup closes and unreferences every child pipe', async () => {
    const makeStream = () => Object.assign(new EventEmitter(), {
        destroyedByTest: false,
        unreferencedByTest: false,
        destroy() { this.destroyedByTest = true; },
        unref() { this.unreferencedByTest = true; }
    });
    const stderr = makeStream();
    const cdpWrite = makeStream();
    const cdpRead = makeStream();
    const child = Object.assign(new EventEmitter(), {
        stderr,
        stdio: [null, null, stderr, cdpWrite, cdpRead],
        unreferencedByTest: false,
        unref() { this.unreferencedByTest = true; }
    });
    let transportClosed = false;
    const runtime = new ExperimentalRuntime({ targetId: 'chatgpt' });
    runtime.child = child;
    runtime.transport = { close() { transportClosed = true; } };
    runtime.client = { closed: true, close() {} };
    runtime.stderrListener = () => {};

    await runtime.cleanupResources();

    assert.equal(transportClosed, true);
    assert.equal(child.unreferencedByTest, true);
    for (const stream of [stderr, cdpWrite, cdpRead]) {
        assert.equal(stream.destroyedByTest, true);
        assert.equal(stream.unreferencedByTest, true);
    }
});

test('runtime polling never overlaps an in-flight renderer scan', async () => {
    const runtime = new ExperimentalRuntime({
        targetId: 'chatgpt', pollIntervalMs: 5
    });
    let concurrent = 0;
    let maximum = 0;
    let calls = 0;
    runtime.discoverAndInject = async () => {
        calls += 1;
        concurrent += 1;
        maximum = Math.max(maximum, concurrent);
        await new Promise(resolve => setTimeout(resolve, 20));
        concurrent -= 1;
    };
    runtime.state = 'active';
    runtime.pollGeneration = 1;
    runtime.schedulePoll(1);
    await waitUntil(() => calls >= 2);
    runtime.state = 'stopped';
    runtime.pollGeneration += 1;
    if (runtime.pollTimer) clearTimeout(runtime.pollTimer);
    await runtime.pollPromise;

    assert.ok(calls >= 2);
    assert.equal(maximum, 1);
});

test('runtime cleanup has a deadline when renderer commands do not answer', async () => {
    let transportClosed = false;
    let clientClosed = false;
    const runtime = new ExperimentalRuntime({
        targetId: 'chatgpt', cleanupTimeoutMs: 25
    });
    runtime.client = {
        closed: false,
        send: () => new Promise(() => {}),
        close() { this.closed = true; clientClosed = true; }
    };
    runtime.transport = { close() { transportClosed = true; } };
    runtime.sessions.set('renderer', { sessionId: 'session', injected: true });
    const started = Date.now();

    await runtime.cleanupResources();

    assert.ok(Date.now() - started < 250);
    assert.equal(transportClosed, true);
    assert.equal(clientClosed, true);
});

test('renderer exception details become a local diagnostic error', () => {
    assert.throws(() => resultValue({ exceptionDetails: { text: 'boom' } }), /boom/);
    assert.deepEqual(resultValue({ result: { value: { ok: true } } }), { ok: true });
});

test('local desktop renderer URLs are recognized without recording private text', async () => {
    const chatgpt = new ExperimentalRuntime({ targetId: 'chatgpt' });
    const claude = new ExperimentalRuntime({ targetId: 'claude' });
    assert.equal(chatgpt.likelyTarget({
        type: 'page', title: 'Private conversation title',
        url: 'file:///C:/Users/Test/AppData/Local/OpenAI/resources/app.asar/webview/index.html?secret=1'
    }), true);
    assert.equal(claude.likelyTarget({
        type: 'page', title: '',
        url: 'file:///C:/Program Files/WindowsApps/Claude/app/.vite/renderer/main_window/index.html'
    }), true);
    assert.equal(chatgpt.likelyTarget({ type: 'page', title: '', url: 'devtools://devtools/bundled/' }), false);

    chatgpt.rememberRenderer({
        targetId: 'renderer-1', type: 'page', attached: true,
        title: 'Private conversation title',
        url: 'https://chatgpt.com/c/private-route?token=secret'
    });
    const serialized = JSON.stringify(chatgpt.snapshot().rendererDiagnostics);
    assert.doesNotMatch(serialized, /Private conversation title|private-route|token|secret/);
    assert.match(safeRendererUrl('file:///C:/Users/Test/app/webview/index.html?secret=1'), /webview\/index\.html/);
});

test('discovery does not discard an already-attached desktop renderer', async () => {
    const runtime = new ExperimentalRuntime({ targetId: 'chatgpt' });
    const seen = [];
    runtime.client = {
        closed: false,
        send: async method => method === 'Target.getTargets'
            ? { targetInfos: [{
                targetId: 'attached-renderer', type: 'page', attached: true,
                title: 'ChatGPT', url: 'file:///app/webview/index.html'
            }] }
            : {}
    };
    runtime.probeTarget = async info => seen.push(info.targetId);
    await runtime.discoverAndInject();
    assert.deepEqual(seen, ['attached-renderer']);
});
