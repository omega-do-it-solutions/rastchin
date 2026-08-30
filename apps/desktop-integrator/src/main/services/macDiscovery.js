'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { TARGETS } = require('../targets/registry');
const { summarizeTargets } = require('./discoverySummary');
const { verifyMacAppBundle } = require('./macTrust');

const execFileAsync = promisify(execFile);

function applicationRoots(homeDir = os.homedir()) {
    return ['/Applications', path.join(homeDir, 'Applications')];
}

function runningProcessNames(stdout) {
    return new Set(String(stdout || '')
        .split(/\r?\n/)
        .map(value => path.basename(value.trim()))
        .filter(Boolean));
}

function normalizeExecutablePath(value, options = {}) {
    const candidate = String(value || '').trim();
    if (!path.posix.isAbsolute(candidate)) return '';
    const normalized = path.posix.normalize(candidate);
    const realpath = options.realpath || fs.realpathSync;
    try {
        return path.posix.normalize(String(realpath(normalized)));
    } catch (_) {
        // A process may exit between ps and realpath. Its absolute ps path is
        // still safe to compare, while a same-name process is never accepted.
        return normalized;
    }
}

function runningExecutablePaths(stdout, options = {}) {
    return new Set(String(stdout || '')
        .split(/\r?\n/)
        .map(value => normalizeExecutablePath(value, options))
        .filter(Boolean));
}

async function discoverMacApps(options = {}) {
    const platform = options.platform || process.platform;
    if (platform !== 'darwin') {
        return {
            platform,
            supportedPlatform: false,
            targets: summarizeTargets([], platform),
            diagnostics: ['macOS discovery can only run on macOS.']
        };
    }

    const exists = options.exists || fs.existsSync;
    const exec = options.execFile || execFileAsync;
    const roots = options.applicationRoots || applicationRoots(options.homeDir);
    const diagnostics = [];
    let runningExecutables = new Set();
    try {
        const { stdout } = await exec('/bin/ps', ['-axo', 'comm='], {
            timeout: 5000,
            maxBuffer: 2 * 1024 * 1024
        });
        runningExecutables = runningExecutablePaths(stdout, { realpath: options.realpath });
    } catch (error) {
        diagnostics.push(`Process discovery failed: ${error.message}`);
    }

    const rows = [];
    for (const target of TARGETS) {
        for (const root of roots) {
            for (const bundle of target.macBundles || []) {
                const bundlePath = path.join(root, bundle.name);
                if (!exists(bundlePath)) continue;
                try {
                    const trusted = await verifyMacAppBundle(bundlePath, target, {
                        exists,
                        execFile: exec
                    });
                    rows.push({
                        targetId: target.id,
                        source: 'app-bundle',
                        name: bundle.name.replace(/\.app$/i, ''),
                        version: trusted.version,
                        executable: trusted.executable,
                        bundlePath,
                        bundleIdentifier: trusted.bundleIdentifier,
                        teamIdentifier: trusted.teamIdentifier,
                        signatureVerified: trusted.signatureVerified,
                        isRunning: runningExecutables.has(normalizeExecutablePath(
                            trusted.executable,
                            { realpath: options.realpath }
                        ))
                    });
                } catch (error) {
                    diagnostics.push(`${bundlePath}: ${error.message}`);
                }
            }
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
    applicationRoots,
    discoverMacApps,
    normalizeExecutablePath,
    runningExecutablePaths,
    runningProcessNames
};
