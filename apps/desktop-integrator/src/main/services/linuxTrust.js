'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const PACKAGE_ARCHITECTURES = Object.freeze({
    dpkg: Object.freeze({ x64: 'amd64', arm64: 'arm64' }),
    rpm: Object.freeze({ x64: 'x86_64', arm64: 'aarch64' })
});

class LinuxTrustError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'LinuxTrustError';
        this.code = code;
    }
}

function expectedPackagePaths(spec) {
    return [...new Set([
        spec.launcher || spec.executable,
        spec.launcherTarget,
        spec.processExecutable
    ].filter(Boolean))];
}

function packageArchitectureMatches(manager, packageArchitecture, nodeArchitecture = process.arch) {
    const expected = PACKAGE_ARCHITECTURES[manager]?.[nodeArchitecture];
    return Boolean(expected && String(packageArchitecture || '') === expected);
}

function parsePackageInfo(manager, stdout) {
    const fields = String(stdout || '').trim().split('\t');
    if (manager === 'dpkg') {
        if (fields.length < 3 || !/^ii\s*$/.test(fields[0])) return null;
        return { version: fields[1], architecture: fields[2] };
    }
    if (manager === 'rpm') {
        if (fields.length < 2) return null;
        return { version: fields[0], architecture: fields[1] };
    }
    return null;
}

async function packageMetadata(spec, options = {}) {
    const exec = options.execFile || execFileAsync;
    if (spec.manager === 'dpkg') {
        const { stdout } = await exec('/usr/bin/dpkg-query', [
            '-W', '-f=${db:Status-Abbrev}\t${Version}\t${Architecture}', spec.packageName
        ], { timeout: 5000, maxBuffer: 1024 * 1024 });
        return parsePackageInfo('dpkg', stdout);
    }
    if (spec.manager === 'rpm') {
        const { stdout } = await exec('/usr/bin/rpm', [
            '-q', '--qf', '%{VERSION}-%{RELEASE}\t%{ARCH}', spec.packageName
        ], { timeout: 5000, maxBuffer: 1024 * 1024 });
        return parsePackageInfo('rpm', stdout);
    }
    throw new Error(`Unsupported Linux package manager: ${spec.manager}`);
}

async function packageFiles(spec, options = {}) {
    const exec = options.execFile || execFileAsync;
    const command = spec.manager === 'dpkg' ? '/usr/bin/dpkg-query' : '/usr/bin/rpm';
    const args = spec.manager === 'dpkg'
        ? ['-L', spec.packageName]
        : ['-ql', spec.packageName];
    const { stdout } = await exec(command, args, { timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
    return new Set(String(stdout || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean));
}

function validateLinuxFile(executable, options = {}) {
    const realpath = options.realpath || fs.realpathSync;
    const stat = options.stat || fs.statSync;
    if (!path.posix.isAbsolute(executable || '')) {
        throw new LinuxTrustError('invalid-path', 'A validated absolute Linux executable path is required.');
    }
    const resolved = realpath(executable);
    const info = stat(resolved);
    if (!info.isFile()) {
        throw new LinuxTrustError('not-file', 'The Linux application executable is not a regular file.');
    }
    if (info.uid !== 0) {
        throw new LinuxTrustError('unsafe-owner', 'The Linux application executable is not owned by root.');
    }
    if ((info.mode & 0o022) !== 0) {
        throw new LinuxTrustError('unsafe-mode', 'The Linux application executable is group- or world-writable.');
    }
    if ((info.mode & 0o111) === 0) {
        throw new LinuxTrustError('not-executable', 'The Linux application file is not executable.');
    }
    return resolved;
}

function rpmVerificationPath(line) {
    const value = String(line || '').trimEnd();
    if (!value) return '';
    const missing = value.match(/^missing\s+(.+)$/i);
    if (missing) return missing[1].trim();
    const changed = value.match(/^\S{9}\s+(?:[a-z]\s+)?(.+)$/i);
    return changed ? changed[1].trim() : '';
}

async function verifyExpectedRpmFiles(spec, expectedPaths, options = {}) {
    const exec = options.execFile || execFileAsync;
    let stdout = '';
    let commandError = null;
    try {
        const result = await exec('/usr/bin/rpm', ['-Vf', spec.launcher || spec.executable], {
            timeout: 10000,
            maxBuffer: 1024 * 1024
        });
        stdout = result.stdout || '';
    } catch (error) {
        stdout = error.stdout || '';
        if (!String(stdout).trim()) throw error;
        commandError = error;
    }
    const expected = new Set(expectedPaths);
    const changedPaths = String(stdout).split(/\r?\n/)
        .map(rpmVerificationPath)
        .filter(Boolean);
    if (commandError && !changedPaths.length) throw commandError;
    const changedExpectedPaths = changedPaths.filter(value => expected.has(value));
    if (changedExpectedPaths.length) {
        throw new LinuxTrustError(
            'modified-file',
            'RPM verification reported a modified expected application file.'
        );
    }
}

function sanitizedTrustDiagnostic(error, spec) {
    const reasons = {
        'architecture-mismatch': 'package architecture does not match this computer',
        'launcher-target-mismatch': 'the package launcher points to an unexpected target',
        'missing-owned-path': 'an expected launcher or process file is not owned by the package',
        'modified-file': 'an expected RPM application file was modified',
        'not-executable': 'an expected application file is not executable',
        'not-file': 'an expected application path is not a regular file',
        'unsafe-mode': 'an expected application file is writable by non-root users',
        'unsafe-owner': 'an expected application file is not owned by root'
    };
    const reason = reasons[error?.code] || 'the installed package failed local validation';
    return `Installed ${spec.packageName} package was ignored: ${reason}.`;
}

async function inspectLinuxPackage(spec, options = {}) {
    let metadata;
    try {
        metadata = await packageMetadata(spec, options);
    } catch (error) {
        if (options.strict) throw error;
        // A missing package manager or package is an ordinary not-installed case.
        // Do not turn raw command output into a user-facing diagnostic.
        return null;
    }
    if (!metadata) {
        if (options.strict) {
            throw new LinuxTrustError('not-installed', `Package ${spec.packageName} is not installed.`);
        }
        return null;
    }

    try {
        const nodeArchitecture = options.arch || process.arch;
        if (!packageArchitectureMatches(spec.manager, metadata.architecture, nodeArchitecture)) {
            throw new LinuxTrustError(
                'architecture-mismatch',
                `Package ${spec.packageName} has an unexpected architecture.`
            );
        }

        const expectedPaths = expectedPackagePaths(spec);
        const files = await packageFiles(spec, options);
        if (expectedPaths.some(expected => !files.has(expected))) {
            throw new LinuxTrustError(
                'missing-owned-path',
                `Package ${spec.packageName} does not own every expected application path.`
            );
        }

        const launcher = spec.launcher || spec.executable;
        const launcherTarget = spec.launcherTarget || launcher;
        const processExecutable = spec.processExecutable || launcherTarget;
        const realLauncher = validateLinuxFile(launcher, options);
        const realLauncherTarget = validateLinuxFile(launcherTarget, options);
        const realProcessExecutable = validateLinuxFile(processExecutable, options);
        if (path.posix.resolve(realLauncher) !== path.posix.resolve(realLauncherTarget)) {
            throw new LinuxTrustError(
                'launcher-target-mismatch',
                `Package ${spec.packageName} launcher points to an unexpected target.`
            );
        }

        if (spec.manager === 'rpm') {
            await verifyExpectedRpmFiles(spec, expectedPaths, options);
        }
        return {
            architecture: metadata.architecture,
            executable: launcher,
            launcher,
            launcherTarget,
            manager: spec.manager,
            packageName: spec.packageName,
            processExecutable,
            realExecutable: realLauncher,
            realLauncherTarget,
            realProcessExecutable,
            source: spec.source,
            version: metadata.version
        };
    } catch (error) {
        if (options.strict) throw error;
        return {
            diagnostic: sanitizedTrustDiagnostic(error, spec),
            invalid: true,
            manager: spec.manager,
            packageName: spec.packageName
        };
    }
}

module.exports = {
    inspectLinuxPackage,
    expectedPackagePaths,
    LinuxTrustError,
    packageArchitectureMatches,
    packageFiles,
    packageMetadata,
    parsePackageInfo,
    rpmVerificationPath,
    sanitizedTrustDiagnostic,
    verifyExpectedRpmFiles,
    validateLinuxFile
};
