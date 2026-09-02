// src/background/service-worker.js
const extensionApi = globalThis.browser ?? globalThis.chrome;

extensionApi.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        extensionApi.tabs.create({
            url: extensionApi.runtime.getURL("src/ui/welcome/welcome.html")
        });
    }
});

// Toolbar click opens the RastChin side panel on Chrome/Edge 114+.
// Chromium gives the side panel precedence over action.default_popup once this
// behavior is set, and the setting persists in ExtensionPrefs, so a top-level
// idempotent call is enough. Where chrome.sidePanel is undefined after the
// manifest has loaded (for example, another Chromium fork), the click falls
// through to the existing popup automatically - keep default_popup in the
// manifest as that fallback.
if (globalThis.chrome?.sidePanel?.setPanelBehavior) {
    globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.warn('RastChin: side panel behavior failed', error));
} else if (extensionApi.sidebarAction?.open && extensionApi.action?.onClicked) {
    extensionApi.action.onClicked.addListener(() => {
        extensionApi.sidebarAction.open()
            .catch((error) => console.warn('RastChin: Firefox sidebar failed', error));
    });
}
