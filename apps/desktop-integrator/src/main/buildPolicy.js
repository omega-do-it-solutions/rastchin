'use strict';

const VALID_CHANNELS = new Set(['development', 'preview', 'stable']);

function resolveBuildPolicy(packageMetadata = {}, environment = process.env, platform = process.platform) {
    const baked = packageMetadata.rastchinBuild || {};
    const hasBakedPolicy = Object.prototype.hasOwnProperty.call(packageMetadata, 'rastchinBuild');
    const requestedChannel = String(baked.channel || 'development').toLowerCase();
    const channel = VALID_CHANNELS.has(requestedChannel) ? requestedChannel : 'development';
    const emergencyDisabled = environment.RASTCHIN_DISABLE_RUNTIME_INJECTION === '1';
    const developmentEnabled = environment.RASTCHIN_ENABLE_RUNTIME_INJECTION === '1'
        || environment.RASTCHIN_ENABLE_EXPERIMENTAL_CDP === '1';
    const bakedEnabled = baked.runtimeInjectionEnabled === true;
    const packagedPlatforms = Array.isArray(baked.runtimeInjectionPlatforms)
        ? baked.runtimeInjectionPlatforms.map(value => String(value))
        : [];
    const packagedPlatformAllowed = packagedPlatforms.includes(platform);
    const packagedEnabled = bakedEnabled && packagedPlatformAllowed;
    const developmentOverrideEnabled = !hasBakedPolicy && developmentEnabled;

    return Object.freeze({
        channel,
        runtimeInjectionEnabled: !emergencyDisabled && (packagedEnabled || developmentOverrideEnabled),
        source: packagedEnabled
            ? 'packaged-policy'
            : (developmentOverrideEnabled
                ? 'development-environment'
                : (bakedEnabled && !packagedPlatformAllowed ? 'platform-disabled' : 'disabled'))
    });
}

module.exports = { resolveBuildPolicy, VALID_CHANNELS };
