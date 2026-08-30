'use strict';

const { discoverLinuxApps } = require('./linuxDiscovery');
const { discoverMacApps } = require('./macDiscovery');
const { discoverWindowsApps } = require('./windowsDiscovery');
const { summarizeTargets } = require('./discoverySummary');

async function discoverDesktopApps(options = {}) {
    const platform = options.platform || process.platform;
    if (platform === 'win32') return discoverWindowsApps({ ...options, platform });
    if (platform === 'darwin') return discoverMacApps({ ...options, platform });
    if (platform === 'linux') return discoverLinuxApps({ ...options, platform });
    return {
        platform,
        supportedPlatform: false,
        targets: summarizeTargets([], platform),
        diagnostics: [`Unsupported desktop platform: ${platform}`]
    };
}

module.exports = { discoverDesktopApps };
