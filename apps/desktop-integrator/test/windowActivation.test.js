'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { revealWindow } = require('../src/main/windowActivation');

test('Linux launcher restores and raises an existing minimized window', () => {
    const calls = [];
    const window = {
        isDestroyed: () => false,
        isMinimized: () => true,
        restore: () => calls.push('restore'),
        show: () => calls.push('show'),
        focus: () => calls.push('window-focus'),
        moveTop: () => calls.push('move-top')
    };
    const application = {
        focus: options => calls.push(['app-focus', options])
    };

    assert.equal(revealWindow(window, application, 'linux'), true);
    assert.deepEqual(calls, [
        'restore',
        'show',
        ['app-focus', { steal: true }],
        'window-focus',
        'move-top'
    ]);
});

test('launcher requests a new window when the existing one was destroyed', () => {
    const window = { isDestroyed: () => true };
    assert.equal(revealWindow(window, { focus() {} }, 'linux'), false);
});
