'use strict';

const { TARGETS, runtimeIsAvailable, runtimeSupportFor } = require('../targets/registry');

function summarizeTargets(rows, platform) {
    return TARGETS.map(target => {
        const installations = rows.filter(row => row.targetId === target.id);
        const support = runtimeSupportFor(target, platform);
        const compatibility = runtimeIsAvailable(support)
            ? (installations.length ? 'needs-probe' : 'not-installed')
            : support.availability;
        return {
            id: target.id,
            name: target.name,
            vendor: target.vendor,
            detected: installations.length > 0,
            running: installations.some(item => item.isRunning),
            installations,
            compatibility,
            runtimeAvailability: support.availability,
            blockedReason: support.reason
        };
    });
}

module.exports = { summarizeTargets };
