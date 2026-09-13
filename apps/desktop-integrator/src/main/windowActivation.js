'use strict';

function revealWindow(window, application, platform = process.platform) {
    if (!window || window.isDestroyed()) return false;
    if (window.isMinimized()) window.restore();
    window.show();
    if (platform === 'linux') application.focus({ steal: true });
    window.focus();
    if (platform === 'linux') window.moveTop();
    return true;
}

module.exports = { revealWindow };
