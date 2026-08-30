'use strict';

const { EventEmitter } = require('node:events');
const { discoverDesktopApps } = require('./platformDiscovery');
const { ExperimentalRuntime } = require('./runtime/experimentalRuntime');
const { getTarget, runtimeIsAvailable, runtimeSupportFor } = require('../targets/registry');

const SUPPORTED_PLATFORMS = new Set(['win32', 'darwin', 'linux']);

class IntegrationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.platform = options.platform || process.platform;
        this.version = options.version || '0.1.0';
        this.buildChannel = options.buildChannel || 'development';
        this.runtimePolicySource = options.runtimePolicySource || 'constructor';
        this.runtimeEnabled = options.runtimeEnabled !== undefined
            ? Boolean(options.runtimeEnabled)
            : (options.experimentalEnabled !== undefined
                ? Boolean(options.experimentalEnabled)
                : process.env.RASTCHIN_ENABLE_RUNTIME_INJECTION === '1'
                    || process.env.RASTCHIN_ENABLE_EXPERIMENTAL_CDP === '1');
        this.discovery = null;
        this.runtimes = new Map();
        this.discover = options.discover || discoverDesktopApps;
        this.runtimeFactory = options.runtimeFactory || (settings => new ExperimentalRuntime(settings));
    }

    async scan() {
        this.discovery = await this.discover({ platform: this.platform });
        this.emitSnapshot();
        return this.snapshot();
    }

    snapshot() {
        const discovery = this.discovery || {
            platform: this.platform,
            supportedPlatform: SUPPORTED_PLATFORMS.has(this.platform),
            targets: [],
            diagnostics: []
        };
        const runtimeStates = Object.fromEntries(
            [...this.runtimes].map(([id, runtime]) => [id, runtime.snapshot()])
        );
        return {
            version: this.version,
            buildChannel: this.buildChannel,
            runtimePolicySource: this.runtimePolicySource,
            platform: this.platform,
            runtimeEnabled: this.runtimeEnabled,
            supportedPlatform: discovery.supportedPlatform,
            targets: discovery.targets.map(target => ({
                ...target,
                runtime: runtimeStates[target.id] || null
            })),
            diagnostics: discovery.diagnostics
        };
    }

    emitSnapshot() {
        this.emit('status', this.snapshot());
    }

    installationFor(targetId, executable = '') {
        const target = this.discovery?.targets.find(item => item.id === targetId);
        if (!target) return null;
        if (executable) return target.installations.find(item => item.executable === executable) || null;
        return target.installations.find(item => item.executable) || null;
    }

    async enable(targetId, executable = '') {
        const target = getTarget(targetId);
        if (!target) throw new Error(`Unknown target: ${targetId}`);
        const support = runtimeSupportFor(target, this.platform);
        if (!runtimeIsAvailable(support)) {
            throw new Error(support.reason || `${target.name} is not supported on this platform.`);
        }
        if (!this.runtimeEnabled) {
            throw new Error('Runtime injection is disabled for this build or platform.');
        }
        if (!SUPPORTED_PLATFORMS.has(this.platform)) {
            throw new Error('This integration is not supported on the current platform.');
        }

        const existing = this.runtimes.get(targetId);
        if (existing && !['idle', 'stopped', 'failed'].includes(existing.state)) {
            return existing.snapshot();
        }
        if (existing && existing.state !== 'idle') await existing.stop();

        // A failed probe leaves the vendor app open by design. Always refresh
        // process state before a retry so we give the user an actionable close-
        // app message instead of trying to reuse a Chromium pipe that has ended.
        await this.scan();

        const discovered = this.discovery.targets.find(item => item.id === targetId);
        if (discovered?.runtimeAvailability
            && !runtimeIsAvailable({ availability: discovered.runtimeAvailability })) {
            throw new Error(discovered.blockedReason || `${target.name} is not supported on this host.`);
        }
        if (discovered?.running) {
            throw new Error(`Close ${target.name} before enabling RTL so RastChin can establish a private launch pipe.`);
        }
        const installation = this.installationFor(targetId, executable);
        if (!installation) throw new Error(`No directly launchable ${target.name} executable was detected.`);

        const runtime = this.runtimeFactory({
            targetId,
            executable: installation.executable,
            appVersion: installation.version,
            integratorVersion: this.version,
            platform: this.platform,
            installation
        });
        runtime.on('status', () => this.emitSnapshot());
        this.runtimes.set(targetId, runtime);
        this.emitSnapshot();
        await runtime.start();
        this.emitSnapshot();
        return runtime.snapshot();
    }

    async disable(targetId) {
        const runtime = this.runtimes.get(targetId);
        if (!runtime) return null;
        const result = await runtime.stop();
        this.emitSnapshot();
        return result;
    }

    async shutdown() {
        await Promise.allSettled([...this.runtimes.values()].map(runtime => runtime.stop()));
    }
}

module.exports = { IntegrationManager, SUPPORTED_PLATFORMS };
