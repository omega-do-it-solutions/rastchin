'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { executableNamesFor } = require('../targets/registry');

const execFileAsync = promisify(execFile);

async function readPlistValue(plistPath, key, options = {}) {
    const exec = options.execFile || execFileAsync;
    const { stdout } = await exec('/usr/bin/plutil', [
        '-extract', key, 'raw', '-o', '-', plistPath
    ], { timeout: 5000, maxBuffer: 1024 * 1024 });
    return String(stdout || '').trim();
}

function signatureRequirement(identity) {
    return `identifier "${identity.bundleIdentifier}" and anchor apple generic and certificate leaf[subject.OU] = "${identity.teamIdentifier}"`;
}

async function verifyMacAppBundle(bundlePath, target, options = {}) {
    if (!path.posix.isAbsolute(bundlePath || '') || !String(bundlePath).endsWith('.app')) {
        throw new Error('A validated absolute macOS application bundle is required.');
    }
    const exists = options.exists || fs.existsSync;
    const exec = options.execFile || execFileAsync;
    const plistPath = path.join(bundlePath, 'Contents', 'Info.plist');
    if (!exists(plistPath)) throw new Error('The macOS application Info.plist is missing.');

    const identity = target.macIdentity || {};
    const bundleIdentifier = await readPlistValue(plistPath, 'CFBundleIdentifier', { execFile: exec });
    if (identity.bundleIdentifier && bundleIdentifier !== identity.bundleIdentifier) {
        throw new Error(`Unexpected macOS bundle identifier: ${bundleIdentifier || '(empty)'}`);
    }

    if (identity.signatureRequired) {
        if (!identity.bundleIdentifier || !identity.teamIdentifier) {
            throw new Error('The target has no pinned macOS signing identity.');
        }
        const requirement = signatureRequirement(identity);
        try {
            await exec('/usr/bin/codesign', [
                '--verify', '--deep', '--strict', `-R=${requirement}`, bundlePath
            ], { timeout: 15000, maxBuffer: 1024 * 1024 });
        } catch (_) {
            throw new Error('The macOS application failed official vendor signature verification.');
        }
    }

    const executableName = await readPlistValue(plistPath, 'CFBundleExecutable', { execFile: exec });
    const allowedNames = executableNamesFor(target, 'darwin');
    if (!allowedNames.includes(executableName)) {
        throw new Error(`Unexpected macOS executable for ${target.name}: ${executableName || '(empty)'}`);
    }
    const executable = path.join(bundlePath, 'Contents', 'MacOS', executableName);
    if (!exists(executable)) throw new Error('The signed macOS application executable is missing.');

    let version = '';
    try {
        version = await readPlistValue(plistPath, 'CFBundleShortVersionString', { execFile: exec });
    } catch (_) {
        try {
            version = await readPlistValue(plistPath, 'CFBundleVersion', { execFile: exec });
        } catch (_) {}
    }

    return {
        bundlePath,
        bundleIdentifier,
        executable,
        executableName,
        signatureVerified: Boolean(identity.signatureRequired),
        teamIdentifier: identity.teamIdentifier || '',
        version
    };
}

module.exports = {
    readPlistValue,
    signatureRequirement,
    verifyMacAppBundle
};
