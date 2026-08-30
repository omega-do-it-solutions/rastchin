'use strict';

const fs = require('node:fs');
const { TARGETS } = require('../targets/registry');
const { summarizeTargets } = require('./discoverySummary');
const { inspectLinuxPackage } = require('./linuxTrust');

const SUPPORTED_LINUX_HOSTS = Object.freeze({
    ubuntu: Object.freeze({ versions: Object.freeze(['24.04', '26.04']), manager: 'dpkg' }),
    debian: Object.freeze({ versions: Object.freeze(['13']), manager: 'dpkg' }),
    fedora: Object.freeze({ versions: Object.freeze(['43', '44']), manager: 'rpm' })
});
const SUPPORTED_NODE_ARCHITECTURES = new Set(['x64', 'arm64']);

function parseOsRelease(source) {
    const values = {};
    for (const rawLine of String(source || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[match[1]] = value.replace(/\\([\\"'$`])/g, '$1');
    }
    return values;
}

function safeHostToken(value, fallback = 'unknown') {
    const normalized = String(value || '').replace(/[^a-z0-9._+-]/gi, '').slice(0, 32);
    return normalized || fallback;
}

function inspectLinuxHost(options = {}) {
    const readFile = options.readFile || fs.readFileSync;
    const arch = options.arch || process.arch;
    if (!SUPPORTED_NODE_ARCHITECTURES.has(arch)) {
        return {
            arch,
            distroId: 'unknown',
            manager: null,
            reason: `RastChin for Linux supports x64 and arm64 computers; detected ${safeHostToken(arch)}.`,
            supported: false,
            versionId: 'unknown'
        };
    }

    let release;
    try {
        release = parseOsRelease(readFile(options.osReleasePath || '/etc/os-release', 'utf8'));
    } catch (_) {
        return {
            arch,
            distroId: 'unknown',
            manager: null,
            reason: 'This Linux distribution could not be verified against the supported host matrix.',
            supported: false,
            versionId: 'unknown'
        };
    }

    const distroId = safeHostToken(release.ID).toLowerCase();
    const versionId = safeHostToken(release.VERSION_ID);
    const support = SUPPORTED_LINUX_HOSTS[distroId];
    if (!support || !support.versions.includes(versionId)) {
        return {
            arch,
            distroId,
            manager: support?.manager || null,
            reason: 'RastChin supports ChatGPT on Ubuntu 24.04/26.04, Debian 13, and Fedora 43/44 on x64 or arm64.',
            supported: false,
            versionId
        };
    }
    return {
        arch,
        distroId,
        manager: support.manager,
        reason: '',
        supported: true,
        versionId
    };
}

function applyLinuxHostSupport(targets, host) {
    return targets.map(target => {
        if (target.id !== 'chatgpt' || host.supported) return target;
        return {
            ...target,
            blockedReason: host.reason,
            compatibility: 'platform-unavailable',
            runtimeAvailability: 'platform-unavailable'
        };
    });
}

function runningLinuxExecutables(options = {}) {
    const readdir = options.readdir || fs.readdirSync;
    const readlink = options.readlink || fs.readlinkSync;
    const resolved = new Set();
    let entries;
    try {
        entries = readdir('/proc', { withFileTypes: true });
    } catch (_) {
        return resolved;
    }
    for (const entry of entries) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (!/^\d+$/.test(name)) continue;
        try {
            resolved.add(String(readlink(`/proc/${name}/exe`)).replace(/ \(deleted\)$/, ''));
        } catch (_) {}
    }
    return resolved;
}

async function discoverLinuxApps(options = {}) {
    const platform = options.platform || process.platform;
    if (platform !== 'linux') {
        return {
            platform,
            supportedPlatform: false,
            targets: summarizeTargets([], platform),
            diagnostics: ['Linux discovery can only run on Linux.']
        };
    }

    const diagnostics = [];
    const host = inspectLinuxHost(options);
    if (!host.supported) {
        return {
            platform,
            supportedPlatform: true,
            targets: applyLinuxHostSupport(summarizeTargets([], platform), host),
            diagnostics
        };
    }
    const running = runningLinuxExecutables(options);
    const rows = [];
    for (const target of TARGETS) {
        for (const spec of target.linuxPackages || []) {
            if (spec.manager !== host.manager) continue;
            const installation = await inspectLinuxPackage(spec, { ...options, arch: host.arch });
            if (!installation) continue;
            if (installation.invalid) {
                diagnostics.push(installation.diagnostic);
                continue;
            }
            rows.push({
                targetId: target.id,
                source: installation.source,
                name: installation.packageName,
                version: installation.version,
                architecture: installation.architecture,
                executable: installation.executable,
                realExecutable: installation.realExecutable,
                processExecutable: installation.processExecutable,
                realProcessExecutable: installation.realProcessExecutable,
                packageName: installation.packageName,
                packageManager: installation.manager,
                isRunning: running.has(installation.realProcessExecutable)
                    || running.has(installation.processExecutable)
            });
        }
    }

    const unique = [...new Map(rows.map(row => [row.executable, row])).values()];
    return {
        platform,
        supportedPlatform: true,
        targets: summarizeTargets(unique, platform),
        diagnostics
    };
}

module.exports = {
    applyLinuxHostSupport,
    discoverLinuxApps,
    inspectLinuxHost,
    parseOsRelease,
    runningLinuxExecutables
};
