// src/background/service-worker.js
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: chrome.runtime.getURL("src/ui/welcome/welcome.html")
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
if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.warn('RastChin: side panel behavior failed', error));
}
