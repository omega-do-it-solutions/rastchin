'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    discoverLinuxApps,
    inspectLinuxHost,
    parseOsRelease,
    runningLinuxExecutables
} = require('../src/main/services/linuxDiscovery');
const { discoverDesktopApps } = require('../src/main/services/platformDiscovery');
const {
    expectedPackagePaths,
    inspectLinuxPackage,
    packageArchitectureMatches,
    parsePackageInfo,
    rpmVerificationPath,
    validateLinuxFile
} = require('../src/main/services/linuxTrust');
const { getTarget } = require('../src/main/targets/registry');

const CHATGPT_DPKG_SPEC = getTarget('chatgpt').linuxPackages.find(spec => spec.manager === 'dpkg');
const CHATGPT_RPM_SPEC = getTarget('chatgpt').linuxPackages.find(spec => spec.manager === 'rpm');
const CHATGPT_PATHS = [
    '/usr/bin/chatgpt',
    '/usr/lib/chatgpt/codex-launcher',
    '/usr/lib/chatgpt/ChatGPT'
];

function osRelease(id = 'ubuntu', version = '24.04') {
    return `ID=${id}\nVERSION_ID="${version}"\n`;
}

function trustedFileOptions(extra = {}) {
    return {
        realpath: value => value === '/usr/bin/chatgpt'
            ? '/usr/lib/chatgpt/codex-launcher'
            : value,
        stat: () => ({ isFile: () => true, uid: 0, mode: 0o100755 }),
        ...extra
    };
}

function missingPackageError(packageName) {
    const error = new Error(`package '${packageName}' is not installed`);
    error.code = 1;
    error.stderr = error.message;
    return error;
}

function dpkgExec(options = {}) {
    const {
        architecture = 'amd64',
        includeChatgpt = true,
        includeClaude = false,
        ownedPaths = CHATGPT_PATHS,
        version = '26.825.41651'
    } = options;
    return async (command, args) => {
        assert.equal(command, '/usr/bin/dpkg-query');
        const packageName = args[args.length - 1];
        const installed = packageName === 'chatgpt' ? includeChatgpt : includeClaude;
        if (!installed) throw missingPackageError(packageName);
        if (args[0] === '-W') return { stdout: `ii \t${version}\t${architecture}` };
        if (args[0] === '-L') {
            const paths = packageName === 'chatgpt'
                ? ownedPaths
                : ['/usr/bin/claude-desktop'];
            return { stdout: `${paths.join('\n')}\n` };
        }
        throw new Error(`Unexpected dpkg-query arguments: ${args.join(' ')}`);
    };
}

function rpmExec(options = {}) {
    const {
        architecture = 'x86_64',
        ownedPaths = CHATGPT_PATHS,
        verificationOutput = '',
        version = '26.825.41651-1'
    } = options;
    return async (command, args) => {
        assert.equal(command, '/usr/bin/rpm');
        if (args[0] === '-q') return { stdout: `${version}\t${architecture}` };
        if (args[0] === '-ql') return { stdout: `${ownedPaths.join('\n')}\n` };
        if (args[0] === '-Vf') {
            assert.equal(args[1], '/usr/bin/chatgpt');
            if (!verificationOutput) return { stdout: '' };
            const error = new Error('RPM verification found differences');
            error.code = 1;
            error.stdout = verificationOutput;
            throw error;
        }
        throw new Error(`Unexpected rpm arguments: ${args.join(' ')}`);
    };
}

test('official Linux registry models the launcher, launcher target, and real process separately', () => {
    assert.deepEqual(expectedPackagePaths(CHATGPT_DPKG_SPEC), CHATGPT_PATHS);
    assert.equal(CHATGPT_DPKG_SPEC.executable, '/usr/bin/chatgpt');
    assert.equal(CHATGPT_DPKG_SPEC.launcherTarget, '/usr/lib/chatgpt/codex-launcher');
    assert.equal(CHATGPT_DPKG_SPEC.processExecutable, '/usr/lib/chatgpt/ChatGPT');
});

test('Linux package metadata parsers accept dpkg and rpm output', () => {
    assert.deepEqual(parsePackageInfo('dpkg', 'ii \t26.825.41651\tamd64'), {
        version: '26.825.41651', architecture: 'amd64'
    });
    assert.deepEqual(parsePackageInfo('rpm', '26.825.41651-1\tx86_64'), {
        version: '26.825.41651-1', architecture: 'x86_64'
    });
    assert.equal(parsePackageInfo('dpkg', 'rc \told\tamd64'), null);
});

test('os-release parsing and the supported Linux host matrix are strict', () => {
    assert.deepEqual(parseOsRelease('ID="ubuntu"\nVERSION_ID=24.04\nNAME="Ubuntu Linux"\n'), {
        ID: 'ubuntu', VERSION_ID: '24.04', NAME: 'Ubuntu Linux'
    });
    for (const [id, versions, manager] of [
        ['ubuntu', ['24.04', '26.04'], 'dpkg'],
        ['debian', ['13'], 'dpkg'],
        ['fedora', ['43', '44'], 'rpm']
    ]) {
        for (const version of versions) {
            const host = inspectLinuxHost({ readFile: () => osRelease(id, version), arch: 'x64' });
            assert.equal(host.supported, true, `${id} ${version} should be supported`);
            assert.equal(host.manager, manager);
        }
    }
    assert.equal(inspectLinuxHost({ readFile: () => osRelease('ubuntu', '22.04'), arch: 'x64' }).supported, false);
    assert.equal(inspectLinuxHost({ readFile: () => osRelease('arch', 'rolling'), arch: 'x64' }).supported, false);
    assert.match(
        inspectLinuxHost({ readFile: () => osRelease(), arch: 'ia32' }).reason,
        /x64 and arm64.*ia32/
    );
});

test('package architecture must match both package manager and Node architecture', () => {
    assert.equal(packageArchitectureMatches('dpkg', 'amd64', 'x64'), true);
    assert.equal(packageArchitectureMatches('dpkg', 'arm64', 'arm64'), true);
    assert.equal(packageArchitectureMatches('rpm', 'x86_64', 'x64'), true);
    assert.equal(packageArchitectureMatches('rpm', 'aarch64', 'arm64'), true);
    assert.equal(packageArchitectureMatches('dpkg', 'arm64', 'x64'), false);
    assert.equal(packageArchitectureMatches('rpm', 'amd64', 'x64'), false);
    assert.equal(packageArchitectureMatches('dpkg', 'amd64', 'ia32'), false);
});

test('Linux package inspection trusts the package launcher and returns the real process path', async () => {
    const result = await inspectLinuxPackage(CHATGPT_DPKG_SPEC, {
        execFile: dpkgExec(),
        arch: 'x64',
        ...trustedFileOptions(),
        strict: true
    });
    assert.equal(result.packageName, 'chatgpt');
    assert.equal(result.executable, '/usr/bin/chatgpt');
    assert.equal(result.realExecutable, '/usr/lib/chatgpt/codex-launcher');
    assert.equal(result.processExecutable, '/usr/lib/chatgpt/ChatGPT');
    assert.equal(result.realProcessExecutable, '/usr/lib/chatgpt/ChatGPT');
    assert.equal(result.version, '26.825.41651');
});

test('Linux trust rejects missing package-owned paths and a redirected launcher', async () => {
    const missingPath = await inspectLinuxPackage(CHATGPT_DPKG_SPEC, {
        execFile: dpkgExec({ ownedPaths: CHATGPT_PATHS.slice(0, 2) }),
        arch: 'x64',
        ...trustedFileOptions()
    });
    assert.equal(missingPath.invalid, true);
    assert.match(missingPath.diagnostic, /expected launcher or process file/);

    const redirected = await inspectLinuxPackage(CHATGPT_DPKG_SPEC, {
        execFile: dpkgExec(),
        arch: 'x64',
        ...trustedFileOptions({ realpath: value => value === '/usr/bin/chatgpt' ? '/tmp/lookalike' : value })
    });
    assert.equal(redirected.invalid, true);
    assert.match(redirected.diagnostic, /unexpected target/);
    assert.doesNotMatch(redirected.diagnostic, /\/tmp\/lookalike/);
});

test('Linux trust rejects unsafe ownership, permissions, and foreign package architecture', async () => {
    assert.throws(() => validateLinuxFile('/usr/lib/chatgpt/ChatGPT', trustedFileOptions({
        stat: () => ({ isFile: () => true, uid: 1000, mode: 0o100755 })
    })), /not owned by root/);
    assert.throws(() => validateLinuxFile('/usr/lib/chatgpt/ChatGPT', trustedFileOptions({
        stat: () => ({ isFile: () => true, uid: 0, mode: 0o100777 })
    })), /world-writable/);

    const foreign = await inspectLinuxPackage(CHATGPT_DPKG_SPEC, {
        execFile: dpkgExec({ architecture: 'arm64' }),
        arch: 'x64',
        ...trustedFileOptions()
    });
    assert.equal(foreign.invalid, true);
    assert.match(foreign.diagnostic, /architecture does not match/);
});

test('RPM verification ignores unrelated package changes but rejects expected-file changes', async () => {
    assert.equal(rpmVerificationPath('S.5....T.  c /etc/chatgpt.conf'), '/etc/chatgpt.conf');
    assert.equal(rpmVerificationPath('missing     /usr/lib/chatgpt/ChatGPT'), '/usr/lib/chatgpt/ChatGPT');

    const unrelated = await inspectLinuxPackage(CHATGPT_RPM_SPEC, {
        execFile: rpmExec({ verificationOutput: 'S.5....T.  c /etc/chatgpt.conf\n' }),
        arch: 'x64',
        ...trustedFileOptions(),
        strict: true
    });
    assert.equal(unrelated.executable, '/usr/bin/chatgpt');

    const modifiedExpected = await inspectLinuxPackage(CHATGPT_RPM_SPEC, {
        execFile: rpmExec({ verificationOutput: 'S.5....T.    /usr/lib/chatgpt/ChatGPT\n' }),
        arch: 'x64',
        ...trustedFileOptions()
    });
    assert.equal(modifiedExpected.invalid, true);
    assert.match(modifiedExpected.diagnostic, /expected RPM application file was modified/);

    const failedVerification = await inspectLinuxPackage(CHATGPT_RPM_SPEC, {
        execFile: rpmExec({ verificationOutput: 'rpm database read failed\n' }),
        arch: 'x64',
        ...trustedFileOptions()
    });
    assert.equal(failedVerification.invalid, true);
    assert.match(failedVerification.diagnostic, /failed local validation/);
});

test('Linux running-process discovery compares exact /proc executable targets', () => {
    const running = runningLinuxExecutables({
        readdir: () => ['1', '2', 'self', 'not-a-pid'],
        readlink: value => value.includes('/1/')
            ? '/usr/lib/chatgpt/ChatGPT'
            : '/usr/bin/other (deleted)'
    });
    assert.equal(running.has('/usr/lib/chatgpt/ChatGPT'), true);
    assert.equal(running.has('/usr/bin/other'), true);
    assert.equal(running.has('/usr/bin/chatgpt-lookalike'), false);
});

test('Linux discovery launches the package launcher but detects the real ChatGPT process', async () => {
    const result = await discoverLinuxApps({
        platform: 'linux',
        readFile: () => osRelease('ubuntu', '24.04'),
        arch: 'x64',
        execFile: dpkgExec(),
        ...trustedFileOptions(),
        readdir: () => ['101'],
        readlink: () => '/usr/lib/chatgpt/ChatGPT'
    });
    assert.equal(result.supportedPlatform, true);
    const chatgpt = result.targets.find(target => target.id === 'chatgpt');
    const claude = result.targets.find(target => target.id === 'claude');
    assert.equal(chatgpt.detected, true);
    assert.equal(chatgpt.running, true);
    assert.equal(chatgpt.runtimeAvailability, 'stable');
    assert.equal(chatgpt.installations[0].source, 'deb');
    assert.equal(chatgpt.installations[0].executable, '/usr/bin/chatgpt');
    assert.equal(chatgpt.installations[0].processExecutable, '/usr/lib/chatgpt/ChatGPT');
    assert.equal(claude.detected, false);
    assert.equal(claude.runtimeAvailability, 'host-blocked');
    assert.deepEqual(result.diagnostics, []);
});

test('unsupported Linux hosts disable ChatGPT without running package commands', async () => {
    let commands = 0;
    const result = await discoverLinuxApps({
        platform: 'linux',
        readFile: () => osRelease('ubuntu', '22.04'),
        arch: 'x64',
        execFile: async () => { commands += 1; throw new Error('must not execute'); }
    });
    const chatgpt = result.targets.find(target => target.id === 'chatgpt');
    assert.equal(commands, 0);
    assert.equal(result.supportedPlatform, true);
    assert.equal(chatgpt.compatibility, 'platform-unavailable');
    assert.equal(chatgpt.runtimeAvailability, 'platform-unavailable');
    assert.match(chatgpt.blockedReason, /Ubuntu 24\.04\/26\.04.*Fedora 43\/44/);
    assert.deepEqual(result.diagnostics, []);
});

test('discovery reports only installed-but-invalid packages, not ordinary missing packages', async () => {
    const missing = await discoverLinuxApps({
        platform: 'linux',
        readFile: () => osRelease(),
        arch: 'x64',
        execFile: dpkgExec({ includeChatgpt: false }),
        ...trustedFileOptions(),
        readdir: () => []
    });
    assert.deepEqual(missing.diagnostics, []);

    const invalid = await discoverLinuxApps({
        platform: 'linux',
        readFile: () => osRelease(),
        arch: 'x64',
        execFile: dpkgExec(),
        ...trustedFileOptions({
            stat: () => ({ isFile: () => true, uid: 1000, mode: 0o100755 })
        }),
        readdir: () => []
    });
    assert.equal(invalid.targets.find(target => target.id === 'chatgpt').detected, false);
    assert.equal(invalid.diagnostics.length, 1);
    assert.match(invalid.diagnostics[0], /Installed chatgpt package was ignored.*not owned by root/);
    assert.doesNotMatch(invalid.diagnostics[0], /\/usr\/|uid|1000/);
});

test('platform discovery fails closed for an unsupported operating system', async () => {
    const result = await discoverDesktopApps({ platform: 'freebsd' });
    assert.equal(result.supportedPlatform, false);
    assert.match(result.diagnostics[0], /Unsupported desktop platform/);
    assert.ok(result.targets.every(target => target.runtimeAvailability === 'platform-unavailable'));
});
