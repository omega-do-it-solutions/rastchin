'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');
const { resolveBuildPolicy } = require('../src/main/buildPolicy');

test('packaged stable metadata enables runtime integration without an environment flag', () => {
    const packagedMetadata = packageJson.build.extraMetadata;
    const policy = resolveBuildPolicy(packagedMetadata, {}, 'darwin');
    assert.deepEqual(policy, {
        channel: 'stable',
        runtimeInjectionEnabled: true,
        source: 'packaged-policy'
    });
});

test('source development build stays disabled unless explicitly enabled', () => {
    assert.equal(resolveBuildPolicy(packageJson, {}).runtimeInjectionEnabled, false);
    assert.deepEqual(resolveBuildPolicy(packageJson, { RASTCHIN_ENABLE_RUNTIME_INJECTION: '1' }), {
        channel: 'development',
        runtimeInjectionEnabled: true,
        source: 'development-environment'
    });
});

test('emergency disable overrides a baked stable policy', () => {
    const policy = resolveBuildPolicy(packageJson.build.extraMetadata, {
        RASTCHIN_DISABLE_RUNTIME_INJECTION: '1',
        RASTCHIN_ENABLE_RUNTIME_INJECTION: '1'
    }, 'linux');
    assert.equal(policy.runtimeInjectionEnabled, false);
});

test('packaged runtime policy is explicitly allowlisted for every shipped platform', () => {
    const metadata = packageJson.build.extraMetadata;
    for (const platform of ['win32', 'darwin', 'linux']) {
        assert.equal(resolveBuildPolicy(metadata, {}, platform).runtimeInjectionEnabled, true);
    }
    assert.deepEqual(resolveBuildPolicy(metadata, {}, 'freebsd'), {
        channel: 'stable',
        runtimeInjectionEnabled: false,
        source: 'platform-disabled'
    });
    assert.deepEqual(resolveBuildPolicy(metadata, {
        RASTCHIN_ENABLE_RUNTIME_INJECTION: '1'
    }, 'freebsd'), {
        channel: 'stable',
        runtimeInjectionEnabled: false,
        source: 'platform-disabled'
    });
});
