'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PipeTransport } = require('../cdp/pipeTransport');
const { CdpClient } = require('../cdp/client');
const {
    buildCleanupExpression,
    buildCompatibilityProbe,
    buildInjection
} = require('../injectionBuilder');
const {
    executableNamesFor,
    getTarget,
    runtimeIsAvailable,
    runtimeSupportFor
} = require('../../targets/registry');
const { verifyMacAppBundle } = require('../macTrust');
const { inspectLinuxPackage } = require('../linuxTrust');

const SAFE_ENV_KEYS = [
    'ALLUSERSPROFILE', 'APPDATA', 'CommonProgramFiles', 'CommonProgramFiles(x86)',
    'CommonProgramW6432', 'COMPUTERNAME', 'ComSpec', 'HOMEDRIVE', 'HOMEPATH',
    'LOCALAPPDATA', 'LOGONSERVER', 'NUMBER_OF_PROCESSORS', 'OS', 'Path', 'PATHEXT',
    'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
    'ProgramW6432', 'PSModulePath', 'PUBLIC', 'SystemDrive', 'SystemRoot', 'TEMP',
    'TMP', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'windir'
];
const POSIX_SAFE_ENV_KEYS = [
    'DBUS_SESSION_BUS_ADDRESS', 'DISPLAY', 'HOME', 'LANG', 'LANGUAGE', 'LC_ALL',
    'LC_CTYPE', 'LC_MESSAGES', 'LOGNAME', 'PATH', 'SHELL', 'SSH_AUTH_SOCK',
    'TEMP', 'TMP', 'TMPDIR', 'USER', 'WAYLAND_DISPLAY', 'XAUTHORITY',
    'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_CURRENT_DESKTOP', 'XDG_DATA_DIRS',
    'XDG_DATA_HOME', 'XDG_RUNTIME_DIR', 'XDG_SESSION_DESKTOP', 'XDG_SESSION_TYPE',
    // User-session input method selection is required for Persian composition.
    // Loader overrides such as LD_PRELOAD and DYLD_* remain deliberately absent.
    'FCITX5_DBUS_ADDRESS', 'FCITX_DBUS_ADDRESS', 'GDK_BACKEND', 'GTK_IM_MODULE',
    'IBUS_ADDRESS', 'QT_IM_MODULE', 'SDL_IM_MODULE', 'XMODIFIERS'
];

const DEBUG_SWITCH_REFUSAL = /refusing to start[^\r\n]*debugging or network-override switch/i;

function sanitizedWindowsEnvironment(source = process.env) {
    const environment = {};
    for (const key of SAFE_ENV_KEYS) {
        if (source[key] !== undefined) environment[key] = source[key];
    }
    return environment;
}

function sanitizedPosixEnvironment(source = process.env) {
    const environment = {};
    for (const key of POSIX_SAFE_ENV_KEYS) {
        if (source[key] !== undefined) environment[key] = source[key];
    }
    return environment;
}

function sanitizedHostEnvironment(platform, source = process.env) {
    return platform === 'win32'
        ? sanitizedWindowsEnvironment(source)
        : sanitizedPosixEnvironment(source);
}

function resultValue(response) {
    if (response?.exceptionDetails) {
        const detail = response.exceptionDetails.exception?.description
            || response.exceptionDetails.text
            || 'Renderer evaluation failed.';
        throw new Error(detail);
    }
    return response?.result?.value;
}

function safeRendererUrl(value) {
    const raw = String(value || '');
    if (!raw) return '(empty)';
    try {
        const parsed = new URL(raw);
        const protocol = parsed.protocol.toLowerCase();
        const pathname = parsed.pathname || '';
        const knownRenderer = pathname.match(/\/(?:\.vite\/renderer\/main_window|renderer\/main_window|webview)\/index\.html$/i);
        if (knownRenderer) {
            return `${protocol}//${parsed.host}${knownRenderer[0]}`.slice(0, 240);
        }
        if (protocol === 'http:' || protocol === 'https:') {
            return `${parsed.origin}${pathname === '/' ? '/' : '/…'}`.slice(0, 240);
        }
        const basename = pathname.split('/').filter(Boolean).pop();
        return `${protocol}//${parsed.host}/…${basename ? `/${basename}` : ''}`.slice(0, 240);
    } catch (_) {
        const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() || 'unknown';
        return `${scheme}:(unparseable)`;
    }
}

function diagnosticError(error) {
    return String(error?.message || error || '')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 240);
}

function diagnoseLaunchFailure(target, error, stderr = '') {
    const original = error instanceof Error ? error : new Error(String(error || 'Runtime launch failed.'));
    const output = String(stderr || '');
    if (DEBUG_SWITCH_REFUSAL.test(output) || output === 'host-refused-debugging-switch') {
        return new Error(
            `${target?.name || 'The desktop app'} rejected the private Chromium debugging connection `
            + 'required for runtime RTL styling. Desktop support requires an official host integration and is planned for a future release.'
        );
    }
    return original;
}

function compactTargetInfo(info) {
    return {
        targetId: String(info?.targetId || '').slice(0, 80),
        type: String(info?.type || 'unknown').slice(0, 40),
        url: safeRendererUrl(info?.url),
        title: '',
        attached: Boolean(info?.attached)
    };
}

class ExperimentalRuntime extends EventEmitter {
    constructor(options) {
        super();
        this.target = getTarget(options.targetId);
        if (!this.target) throw new Error(`Unknown target: ${options.targetId}`);
        this.executable = options.executable;
        this.installation = options.installation || {};
        this.appVersion = options.appVersion || '';
        this.integratorVersion = options.integratorVersion || '0.1.0';
        this.spawn = options.spawn || spawn;
        this.exists = options.exists || fs.existsSync;
        this.environment = options.environment || process.env;
        this.platform = options.platform || process.platform;
        this.verifyMacAppBundle = options.verifyMacAppBundle || verifyMacAppBundle;
        this.inspectLinuxPackage = options.inspectLinuxPackage || inspectLinuxPackage;
        this.commandTimeoutMs = options.commandTimeoutMs || 10000;
        this.pollIntervalMs = options.pollIntervalMs || 1500;
        this.cleanupTimeoutMs = options.cleanupTimeoutMs || 3000;
        this.child = null;
        this.transport = null;
        this.client = null;
        this.pollTimer = null;
        this.pollPromise = null;
        this.pollGeneration = 0;
        this.sessions = new Map();
        this.state = 'idle';
        this.lastError = null;
        this.browserVersion = null;
        this.hostDiagnostic = '';
        this.stderrListener = null;
        this.rendererDiagnostics = [];
        this.cleanupPromise = null;
    }

    snapshot() {
        return {
            targetId: this.target.id,
            state: this.state,
            executable: this.executable,
            appVersion: this.appVersion,
            browserVersion: this.browserVersion,
            injectedTargets: Array.from(this.sessions.values()).filter(item => item.injected).length,
            lastError: this.lastError,
            diagnostics: this.hostDiagnostic,
            rendererDiagnostics: this.rendererDiagnostics.map(item => ({ ...item }))
        };
    }

    rememberRenderer(info, details = {}) {
        if (!info?.targetId) return;
        const title = String(info.title || '');
        const probe = details.probe || null;
        const entry = {
            targetId: String(info.targetId).slice(0, 80),
            type: String(info.type || 'unknown').slice(0, 40),
            url: safeRendererUrl(info.url),
            attached: Boolean(info.attached),
            likely: this.likelyTarget(info),
            titleMatches: this.target.titlePatterns.some(pattern => pattern.test(title)),
            titleLength: title.length,
            mode: probe?.mode || details.mode || 'not-probed',
            exactMatches: Number.isFinite(probe?.exactTotal) ? probe.exactTotal : null,
            desktop: probe?.desktop && typeof probe.desktop === 'object'
                ? {
                    roots: Number(probe.desktop.roots || 0),
                    editors: Number(probe.desktop.editors || 0),
                    prose: Number(probe.desktop.prose || 0),
                    dialogs: Number(probe.desktop.dialogs || 0)
                }
                : null,
            bodyChildren: Number.isFinite(probe?.bodyChildren) ? probe.bodyChildren : null,
            injected: Boolean(details.injected),
            error: details.error ? diagnosticError(details.error) : null
        };
        const index = this.rendererDiagnostics.findIndex(item => item.targetId === entry.targetId);
        if (index >= 0) this.rendererDiagnostics[index] = entry;
        else this.rendererDiagnostics.push(entry);
        this.rendererDiagnostics = this.rendererDiagnostics.slice(-24);
    }

    diagnosticSummary() {
        const summary = JSON.stringify(this.rendererDiagnostics);
        return summary.length > 2600 ? `${summary.slice(0, 2600)}…` : summary;
    }

    setState(state, error = null) {
        this.state = state;
        this.lastError = error ? String(error.message || error) : null;
        this.emit('status', this.snapshot());
    }

    async validateLaunch() {
        const support = runtimeSupportFor(this.target, this.platform);
        if (!runtimeIsAvailable(support)) {
            throw new Error(support.reason || `${this.target.name} is not supported on this platform.`);
        }
        if (!['win32', 'darwin', 'linux'].includes(this.platform)) {
            throw new Error('The compatibility runtime does not support this platform.');
        }
        const platformPath = this.platform === 'win32' ? path.win32 : path.posix;
        if (!this.executable || !platformPath.isAbsolute(this.executable)) {
            throw new Error('A validated absolute executable path is required.');
        }
        if (!this.exists(this.executable)) throw new Error('The detected executable no longer exists.');
        const basename = platformPath.basename(this.executable).toLowerCase();
        const allowed = executableNamesFor(this.target, this.platform).map(name => name.toLowerCase());
        if (!allowed.includes(basename)) {
            throw new Error(`Unexpected executable for ${this.target.name}: ${basename}`);
        }

        if (this.platform === 'darwin') {
            const trusted = await this.verifyMacAppBundle(
                this.installation.bundlePath,
                this.target
            );
            if (path.resolve(trusted.executable) !== path.resolve(this.executable)) {
                throw new Error('The macOS executable changed after discovery.');
            }
        }

        if (this.platform === 'linux') {
            const spec = (this.target.linuxPackages || []).find(candidate =>
                candidate.packageName === this.installation.packageName
                && candidate.manager === this.installation.packageManager
                && (candidate.launcher || candidate.executable) === this.executable
            );
            if (!spec) throw new Error('The Linux package identity changed after discovery.');
            const trusted = await this.inspectLinuxPackage(spec, { strict: true });
            if (path.resolve(trusted.executable) !== path.resolve(this.executable)) {
                throw new Error('The Linux launcher changed after discovery.');
            }
        }
    }

    async start() {
        if (this.state !== 'idle' && this.state !== 'stopped' && this.state !== 'failed') {
            return this.snapshot();
        }
        await this.validateLaunch();
        this.rendererDiagnostics = [];
        this.hostDiagnostic = '';
        this.setState('launching');

        try {
            const homeDirectory = String(this.environment.HOME || '');
            const posixCwd = path.posix.isAbsolute(homeDirectory) && this.exists(homeDirectory)
                ? homeDirectory
                : path.dirname(this.executable);
            this.child = this.spawn(this.executable, ['--remote-debugging-pipe'], {
                cwd: this.platform === 'win32' ? undefined : posixCwd,
                env: sanitizedHostEnvironment(this.platform, this.environment),
                windowsHide: this.platform === 'win32',
                detached: false,
                stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']
            });

            if (!this.child?.stdio?.[3] || !this.child?.stdio?.[4]) {
                throw new Error('The host did not expose Chromium debugging pipes.');
            }

            this.stderrListener = chunk => {
                if (DEBUG_SWITCH_REFUSAL.test(String(chunk))) {
                    this.hostDiagnostic = 'host-refused-debugging-switch';
                }
            };
            this.child.stderr?.on('data', this.stderrListener);
            this.child.once('error', error => this.fail(error));
            this.child.once('exit', (code, signal) => {
                if (this.state !== 'stopping' && this.state !== 'stopped') {
                    this.fail(new Error(`Host exited before integration completed (${code ?? signal ?? 'unknown'}).`));
                }
            });

            this.transport = new PipeTransport(this.child.stdio[4], this.child.stdio[3]);
            this.client = new CdpClient(this.transport, { timeoutMs: this.commandTimeoutMs });
            this.client.on('close', error => {
                if (this.state !== 'stopping' && this.state !== 'stopped') {
                    this.fail(error || new Error('Chromium debugging pipe closed.'));
                }
            });

            const browser = await this.client.send('Browser.getVersion');
            this.browserVersion = browser.product || browser.userAgent || 'Chromium';
            this.setState('probing');
            const found = await this.waitForCompatibleRenderer();

            if (!found) {
                throw new Error(
                    'The app launched, but no compatible conversation renderer was found. '
                    + `Renderer diagnostics (layout counts only; no conversation text): ${this.diagnosticSummary()}`
                );
            }

            this.setState('active');
            this.pollGeneration += 1;
            this.schedulePoll(this.pollGeneration);
            return this.snapshot();
        } catch (error) {
            const diagnosed = diagnoseLaunchFailure(this.target, error, this.hostDiagnostic);
            if (this.state === 'failed') {
                this.lastError = diagnosed.message;
                this.emit('status', this.snapshot());
            } else {
                this.fail(diagnosed);
            }
            await (this.cleanupPromise || Promise.resolve());
            throw diagnosed;
        }
    }

    schedulePoll(generation) {
        if (generation !== this.pollGeneration || this.state !== 'active') return;
        this.pollTimer = setTimeout(() => {
            this.pollTimer = null;
            if (generation !== this.pollGeneration || this.state !== 'active') return;
            this.pollPromise = this.discoverAndInject()
                .catch(error => {
                    if (generation === this.pollGeneration && this.state === 'active') this.fail(error);
                })
                .finally(() => {
                    this.pollPromise = null;
                    this.schedulePoll(generation);
                });
        }, this.pollIntervalMs);
        this.pollTimer.unref?.();
    }

    async discoverAndInject() {
        if (!this.client || this.client.closed || ['stopping', 'stopped', 'failed'].includes(this.state)) return;
        const { targetInfos = [] } = await this.client.send('Target.getTargets');
        const candidates = targetInfos.filter(info => {
            if (!['page', 'webview', 'other'].includes(info.type)) return false;
            return true;
        }).slice(0, 24);

        for (const info of candidates) {
            if (!this.client || this.client.closed || ['stopping', 'stopped', 'failed'].includes(this.state)) break;
            this.rememberRenderer(info);
            const existing = this.sessions.get(info.targetId);
            if (existing) await this.refreshTarget(info, existing);
            else await this.probeTarget(info);
        }

        const liveIds = new Set(targetInfos.map(info => info.targetId));
        for (const targetId of this.sessions.keys()) {
            if (!liveIds.has(targetId)) this.sessions.delete(targetId);
        }
    }

    async waitForCompatibleRenderer(timeoutMs = 20000) {
        const deadline = Date.now() + timeoutMs;
        do {
            await this.discoverAndInject();
            if ([...this.sessions.values()].some(item => item.injected)) return true;
            if (!this.client || this.client.closed || ['failed', 'stopping', 'stopped'].includes(this.state)) return false;
            await new Promise(resolve => setTimeout(resolve, 350));
        } while (Date.now() < deadline);
        return false;
    }

    likelyTarget(info) {
        const url = String(info.url || '');
        const title = String(info.title || '');
        return this.target.urlPatterns.some(pattern => pattern.test(url))
            || (this.target.rendererUrlPatterns || []).some(pattern => pattern.test(url))
            || this.target.titlePatterns.some(pattern => pattern.test(title))
            || (!url && ['page', 'webview'].includes(info.type));
    }

    async probeTarget(info) {
        if (!this.likelyTarget(info) || ['stopping', 'stopped', 'failed'].includes(this.state)) return;
        let sessionId = null;
        try {
            const attached = await this.client.send('Target.attachToTarget', {
                targetId: info.targetId,
                flatten: true
            });
            sessionId = attached.sessionId;
            await this.client.send('Runtime.enable', {}, sessionId);
            const probeResponse = await this.client.send('Runtime.evaluate', {
                expression: buildCompatibilityProbe(this.target.id),
                returnByValue: true,
                awaitPromise: true
            }, sessionId);
            if (['stopping', 'stopped', 'failed'].includes(this.state)) {
                try { await this.client.send('Target.detachFromTarget', { sessionId }); } catch (_) {}
                return;
            }
            const probe = resultValue(probeResponse) || {};
            const record = { sessionId, targetInfo: compactTargetInfo(info), probe, injected: false };
            this.sessions.set(info.targetId, record);
            this.rememberRenderer(info, { probe });
            if (!probe.compatible) return;
            await this.injectRecord(record);
        } catch (error) {
            if (sessionId) {
                try { await this.client.send('Target.detachFromTarget', { sessionId }); } catch (_) {}
            }
            this.sessions.set(info.targetId, {
                sessionId,
                targetInfo: compactTargetInfo(info),
                probe: null,
                injected: false,
                error: error.message
            });
            this.rememberRenderer(info, { error });
        }
    }

    async refreshTarget(info, record) {
        try {
            record.targetInfo = compactTargetInfo(info);
            const statusResponse = await this.client.send('Runtime.evaluate', {
                expression: `(() => {
                    const active = window.__RASTCHIN_DESKTOP__;
                    active?.renewLease?.();
                    return { targetId: active?.targetId || null };
                })()`,
                returnByValue: true
            }, record.sessionId);
            if (['stopping', 'stopped', 'failed'].includes(this.state)) return;
            const status = resultValue(statusResponse) || {};
            if (status.targetId === this.target.id) {
                record.injected = true;
                this.rememberRenderer(info, { probe: record.probe, injected: true });
                return;
            }

            record.injected = false;
            const probeResponse = await this.client.send('Runtime.evaluate', {
                expression: buildCompatibilityProbe(this.target.id),
                returnByValue: true,
                awaitPromise: true
            }, record.sessionId);
            record.probe = resultValue(probeResponse) || {};
            this.rememberRenderer(info, { probe: record.probe });
            if (record.probe.compatible) await this.injectRecord(record);
        } catch (error) {
            this.rememberRenderer(info, { probe: record.probe, error });
            try {
                await this.client.send('Target.detachFromTarget', { sessionId: record.sessionId });
            } catch (_) {}
            this.sessions.delete(info.targetId);
        }
    }

    async injectRecord(record) {
        if (['stopping', 'stopped', 'failed'].includes(this.state)) return;
        const injectionResponse = await this.client.send('Runtime.evaluate', {
            expression: buildInjection(this.target.id, { version: this.integratorVersion }),
            returnByValue: true,
            awaitPromise: true,
            userGesture: false
        }, record.sessionId);
        if (['stopping', 'stopped', 'failed'].includes(this.state)) return;
        record.result = resultValue(injectionResponse);
        record.injected = Boolean(record.result?.applied);
        this.rememberRenderer(record.targetInfo, { probe: record.probe, injected: record.injected });
        this.emit('status', this.snapshot());
    }

    async stop() {
        if (this.state === 'stopped' || this.state === 'idle') return this.snapshot();
        this.setState('stopping');
        await this.cleanupResources();
        this.setState('stopped');
        return this.snapshot();
    }

    cleanupResources() {
        if (this.cleanupPromise) return this.cleanupPromise;
        const cleanup = this.performCleanupResources();
        const tracked = cleanup.finally(() => {
            if (this.cleanupPromise === tracked) this.cleanupPromise = null;
        });
        this.cleanupPromise = tracked;
        return this.cleanupPromise;
    }

    async performCleanupResources() {
        this.pollGeneration += 1;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;

        const client = this.client;
        const transport = this.transport;
        const child = this.child;
        const activePoll = this.pollPromise;

        if (client && !client.closed) {
            const tasks = [...this.sessions.values()].filter(record => record.sessionId).map(async record => {
                if (record.injected) {
                    try {
                        await client.send('Runtime.evaluate', {
                            expression: buildCleanupExpression(),
                            returnByValue: true
                        }, record.sessionId);
                    } catch (_) {}
                }
                try {
                    await client.send('Target.detachFromTarget', { sessionId: record.sessionId });
                } catch (_) {}
            });
            let deadline = null;
            await Promise.race([
                Promise.allSettled(tasks),
                new Promise(resolve => { deadline = setTimeout(resolve, this.cleanupTimeoutMs); })
            ]);
            if (deadline) clearTimeout(deadline);
        }

        transport?.close();
        client?.close();

        if (child) {
            if (this.stderrListener) child.stderr?.removeListener?.('data', this.stderrListener);
            const streams = new Set([child.stderr, child.stdio?.[3], child.stdio?.[4]].filter(Boolean));
            for (const stream of streams) {
                stream.unref?.();
                stream.destroy?.();
            }
            child.removeAllListeners?.('error');
            child.removeAllListeners?.('exit');
            child.unref?.();
        }

        if (activePoll) {
            let deadline = null;
            await Promise.race([
                Promise.resolve(activePoll).catch(() => {}),
                new Promise(resolve => { deadline = setTimeout(resolve, 250); })
            ]);
            if (deadline) clearTimeout(deadline);
        }

        this.sessions.clear();
        this.transport = null;
        this.client = null;
        this.child = null;
        this.pollPromise = null;
        this.stderrListener = null;
    }

    fail(error) {
        if (this.state === 'failed' || this.state === 'stopped') return;
        this.setState('failed', error);
        this.cleanupResources().catch(() => {
            this.hostDiagnostic = 'cleanup-failed';
        });
    }
}

module.exports = {
    diagnoseLaunchFailure,
    ExperimentalRuntime,
    POSIX_SAFE_ENV_KEYS,
    SAFE_ENV_KEYS,
    resultValue,
    safeRendererUrl,
    sanitizedHostEnvironment,
    sanitizedPosixEnvironment,
    sanitizedWindowsEnvironment
};
