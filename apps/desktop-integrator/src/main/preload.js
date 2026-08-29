'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rastchin', Object.freeze({
    getStatus: () => ipcRenderer.invoke('rastchin:get-status'),
    scan: () => ipcRenderer.invoke('rastchin:scan'),
    enable: request => ipcRenderer.invoke('rastchin:enable', request),
    disable: request => ipcRenderer.invoke('rastchin:disable', request),
    openLink: url => ipcRenderer.invoke('rastchin:open-link', url),
    onStatus: callback => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, status) => callback(status);
        ipcRenderer.on('rastchin:status', handler);
        return () => ipcRenderer.removeListener('rastchin:status', handler);
    }
}));
