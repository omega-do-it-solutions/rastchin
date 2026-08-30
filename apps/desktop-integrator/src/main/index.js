'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { IntegrationManager } = require('./services/integrationManager');
const { resolveBuildPolicy } = require('./buildPolicy');
const packageMetadata = require('../../package.json');

let mainWindow = null;
let tray = null;
let allowQuit = false;
let cleanupStarted = false;

const buildPolicy = resolveBuildPolicy(packageMetadata);
const manager = new IntegrationManager({
    version: app.getVersion(),
    buildChannel: buildPolicy.channel,
    runtimePolicySource: buildPolicy.source,
    runtimeEnabled: buildPolicy.runtimeInjectionEnabled
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    allowQuit = true;
    app.quit();
}

function rendererPath(filename) {
    return path.join(__dirname, '..', 'renderer', filename);
}

function assetPath(filename) {
    return path.join(__dirname, '..', '..', 'assets', filename);
}

function createMacTrayImage() {
    const width = 36;
    const height = 36;
    const bitmap = Buffer.alloc(width * height * 4);
    const paint = (x, y, w = 1, h = 1) => {
        for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
            for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1) {
                const offset = (row * width + column) * 4;
                bitmap[offset + 3] = 255;
            }
        }
    };

    paint(4, 5, 19, 3);
    paint(4, 5, 3, 26);
    paint(4, 28, 10, 3);
    for (let step = 0; step < 6; step += 1) {
        paint(13 - step, 11 + step, 2, 2);
        paint(8 + step, 17 + step, 2, 2);
        paint(19 - Math.floor(step / 2), 11 + (step * 2), 2, 3);
    }
    paint(26, 12, 6, 9);
    paint(22, 21, 6, 6);
    paint(17, 27, 6, 5);

    const image = nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 2 });
    image.setTemplateImage(true);
    return image;
}

function createTrayImage() {
    if (process.platform === 'darwin') return createMacTrayImage();
    return nativeImage.createFromPath(assetPath('icon.png')).resize({ width: 20, height: 20 });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1080,
        height: 760,
        minWidth: 860,
        minHeight: 620,
        show: false,
        backgroundColor: '#101114',
        icon: assetPath('icon.png'),
        title: 'یکپارچه‌ساز دسکتاپ راست‌چین',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    if (process.platform !== 'darwin') mainWindow.removeMenu();
    mainWindow.loadFile(rendererPath('index.html'));
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.on('close', event => {
        const active = manager.snapshot().targets.some(target => target.runtime?.state === 'active');
        if (active && !allowQuit) {
            event.preventDefault();
            // macOS always has the Dock as a recovery path. On trayless Linux
            // desktops (and an unexpected tray failure elsewhere), keep the
            // manager reachable instead of hiding its only window.
            if (process.platform === 'darwin' || tray) mainWindow.hide();
            else mainWindow.minimize();
        }
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.show();
    mainWindow?.focus();
}

function createTray() {
    if (!['win32', 'darwin', 'linux'].includes(process.platform) || tray) return;
    const trayImage = createTrayImage();
    try {
        tray = new Tray(trayImage);
    } catch (_) {
        // Some Linux desktop environments do not expose a status notifier.
        // The main window remains usable and active integrations still prevent quit.
        tray = null;
        return;
    }
    tray.setToolTip('یکپارچه‌ساز دسکتاپ راست‌چین');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'باز کردن راست‌چین', click: showMainWindow },
        { type: 'separator' },
        { label: 'خروج', click: () => app.quit() }
    ]));
    const activationEvent = process.platform === 'darwin' ? 'click' : 'double-click';
    tray.on(activationEvent, showMainWindow);
}

function registerIpc() {
    ipcMain.handle('rastchin:get-status', () => manager.snapshot());
    ipcMain.handle('rastchin:scan', () => manager.scan());
    ipcMain.handle('rastchin:enable', (_event, request) => {
        return manager.enable(String(request?.targetId || ''), String(request?.executable || ''));
    });
    ipcMain.handle('rastchin:disable', (_event, request) => {
        return manager.disable(String(request?.targetId || ''));
    });
    ipcMain.handle('rastchin:open-link', (_event, value) => {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || !['github.com', 'learn.chatgpt.com', 'support.claude.com'].includes(url.hostname)) {
            throw new Error('باز کردن این پیوند مجاز نیست.');
        }
        return shell.openExternal(url.toString());
    });

    manager.on('status', status => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('rastchin:status', status);
        }
    });
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
    registerIpc();
    createWindow();
    createTray();
    await manager.scan();

    app.on('activate', () => {
        showMainWindow();
    });
});

app.on('second-instance', () => {
    showMainWindow();
});

app.on('window-all-closed', () => {
    const active = manager.snapshot().targets.some(target => target.runtime?.state === 'active');
    if (process.platform === 'darwin' || active) return;
    app.quit();
});

app.on('before-quit', event => {
    if (allowQuit || cleanupStarted) return;
    event.preventDefault();
    cleanupStarted = true;
    manager.shutdown().finally(() => {
        allowQuit = true;
        tray?.destroy();
        tray = null;
        app.quit();
    });
});
