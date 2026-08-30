'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getTarget } = require('../src/main/targets/registry');
const {
    applicationRoots,
    discoverMacApps,
    normalizeExecutablePath,
    runningExecutablePaths,
    runningProcessNames
} = require('../src/main/services/macDiscovery');
const {
    signatureRequirement,
    verifyMacAppBundle
} = require('../src/main/services/macTrust');

function macExec({
    bundleIdentifier = 'com.openai.codex',
    signed = true,
    processes = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n/usr/bin/login\n'
} = {}) {
    const calls = [];
    const execFile = async (command, args) => {
        calls.push({ command, args });
        if (command === '/bin/ps') {
            return { stdout: processes };
        }
        if (command === '/usr/bin/codesign') {
            if (!signed) throw new Error('invalid signature');
            return { stdout: '' };
        }
        if (command === '/usr/bin/plutil') {
            const key = args[1];
            if (key === 'CFBundleIdentifier') return { stdout: `${bundleIdentifier}\n` };
            if (key === 'CFBundleExecutable') return { stdout: 'ChatGPT\n' };
            if (key === 'CFBundleShortVersionString') return { stdout: '26.825.1\n' };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };
    return { calls, execFile };
}

test('macOS application roots cover system and per-user Applications', () => {
    assert.deepEqual(applicationRoots('/Users/tester'), [
        '/Applications', '/Users/tester/Applications'
    ]);
    assert.deepEqual(
        [...runningProcessNames('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n/usr/bin/login\n')],
        ['ChatGPT', 'login']
    );
    assert.deepEqual(
        [...runningExecutablePaths('/Applications/ChatGPT.app/Contents/MacOS/../MacOS/ChatGPT\nChatGPT\n', {
            realpath: value => value
        })],
        ['/Applications/ChatGPT.app/Contents/MacOS/ChatGPT']
    );
    assert.equal(normalizeExecutablePath('ChatGPT'), '');
});

test('official ChatGPT macOS bundle requires the pinned OpenAI identity and Team ID', async () => {
    const target = getTarget('chatgpt');
    const fake = macExec();
    const trusted = await verifyMacAppBundle('/Applications/ChatGPT.app', target, {
        exists: () => true,
        execFile: fake.execFile
    });
    assert.equal(trusted.bundleIdentifier, 'com.openai.codex');
    assert.equal(trusted.teamIdentifier, '2DC432GLL2');
    assert.equal(trusted.executable, '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT');
    const codesign = fake.calls.find(call => call.command === '/usr/bin/codesign');
    assert.ok(codesign);
    assert.ok(codesign.args.includes(`-R=${signatureRequirement(target.macIdentity)}`));
});

test('macOS trust rejects ChatGPT Classic and an invalid vendor signature', async () => {
    const target = getTarget('chatgpt');
    await assert.rejects(
        verifyMacAppBundle('/Applications/ChatGPT.app', target, {
            exists: () => true,
            execFile: macExec({ bundleIdentifier: 'com.openai.chat' }).execFile
        }),
        /Unexpected macOS bundle identifier/
    );
    await assert.rejects(
        verifyMacAppBundle('/Applications/ChatGPT.app', target, {
            exists: () => true,
            execFile: macExec({ signed: false }).execFile
        }),
        /official vendor signature verification/
    );
});

test('macOS discovery reports only the trusted unified ChatGPT application', async () => {
    const fake = macExec();
    const result = await discoverMacApps({
        platform: 'darwin',
        applicationRoots: ['/Applications'],
        exists: value => String(value).startsWith('/Applications/ChatGPT.app'),
        execFile: fake.execFile
    });
    assert.equal(result.supportedPlatform, true);
    assert.deepEqual(result.diagnostics, []);
    const chatgpt = result.targets.find(target => target.id === 'chatgpt');
    const claude = result.targets.find(target => target.id === 'claude');
    assert.equal(chatgpt.detected, true);
    assert.equal(chatgpt.running, true);
    assert.equal(chatgpt.runtimeAvailability, 'stable');
    assert.equal(chatgpt.installations[0].source, 'app-bundle');
    assert.equal(chatgpt.installations[0].signatureVerified, true);
    assert.equal(claude.detected, false);
    assert.equal(claude.runtimeAvailability, 'host-blocked');
});

test('macOS discovery does not confuse ChatGPT Classic or same-name processes with the trusted app', async () => {
    const fake = macExec({
        processes: [
            '/Applications/ChatGPT Classic.app/Contents/MacOS/ChatGPT',
            '/Users/tester/bin/ChatGPT'
        ].join('\n')
    });
    const result = await discoverMacApps({
        platform: 'darwin',
        applicationRoots: ['/Applications'],
        exists: value => String(value).startsWith('/Applications/ChatGPT.app'),
        realpath: value => value,
        execFile: fake.execFile
    });
    const chatgpt = result.targets.find(target => target.id === 'chatgpt');
    assert.equal(chatgpt.detected, true);
    assert.equal(chatgpt.running, false);
    assert.equal(chatgpt.installations[0].isRunning, false);
});

test('macOS discovery fails closed on another platform', async () => {
    const result = await discoverMacApps({ platform: 'linux' });
    assert.equal(result.supportedPlatform, false);
    assert.match(result.diagnostics[0], /only run on macOS/);
});
