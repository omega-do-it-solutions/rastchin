'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    encodePowerShell,
    normalizeRows,
    powershellDiscoveryScript,
    summarizeTargets
} = require('../src/main/services/windowsDiscovery');

test('PowerShell discovery is encoded as UTF-16LE and remains read-only', () => {
    const script = powershellDiscoveryScript();
    const decoded = Buffer.from(encodePowerShell(script), 'base64').toString('utf16le');
    assert.equal(decoded, script);
    assert.match(script, /Get-AppxPackage/);
    assert.doesNotMatch(script, /Remove-AppxPackage|Set-Content|Add-Content|Remove-Item/);
});

test('normalizes a single PowerShell JSON result', () => {
    const rows = normalizeRows(JSON.stringify({
        targetId: 'chatgpt',
        source: 'msix',
        name: 'OpenAI.Codex',
        version: '26.820.10647.0',
        executable: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\ChatGPT.exe',
        isRunning: false
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].targetId, 'chatgpt');
    assert.equal(rows[0].source, 'msix');
    assert.equal(rows[0].isRunning, false);
});

test('summarizes both registered apps and keeps unknown support closed', () => {
    const summary = summarizeTargets([{
        targetId: 'claude', source: 'msix', name: 'Claude', version: '1.0.0',
        executable: 'C:\\Apps\\Claude.exe', packageFamilyName: '', packageFullName: '', isRunning: true
    }]);
    assert.equal(summary.length, 2);
    const claude = summary.find(item => item.id === 'claude');
    const chatgpt = summary.find(item => item.id === 'chatgpt');
    assert.equal(claude.detected, true);
    assert.equal(claude.running, true);
    assert.equal(claude.compatibility, 'host-blocked');
    assert.equal(claude.runtimeAvailability, 'host-blocked');
    assert.match(claude.blockedReason, /مسدود.*نسخه‌های آینده/);
    assert.equal('fallbackUrl' in claude, false);
    assert.equal(chatgpt.compatibility, 'not-installed');
    assert.equal(chatgpt.runtimeAvailability, 'stable');
});
