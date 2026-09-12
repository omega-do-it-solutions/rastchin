document.addEventListener('DOMContentLoaded', () => {
    setWelcomeVersion();
    wireSettingsButton();
    wireCloseButton();
});

function setWelcomeVersion() {
    const versionElement = document.getElementById('welcomeVersion');
    if (!versionElement) return;

    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
        versionElement.textContent = `v${chrome.runtime.getManifest().version}`;
    }
}

function wireSettingsButton() {
    const settingsBtn = document.getElementById('openSettingsBtn');
    if (!settingsBtn) return;

    settingsBtn.addEventListener('click', event => {
        const sidePanelApi = globalThis.chrome?.sidePanel;
        const currentWindowId = globalThis.chrome?.windows?.WINDOW_ID_CURRENT;

        if (sidePanelApi?.open && Number.isInteger(currentWindowId)) {
            event.preventDefault();
            sidePanelApi.open({ windowId: currentWindowId })
                .catch(() => window.location.assign(settingsBtn.href));
            return;
        }

        const sidebarApi = globalThis.browser?.sidebarAction;
        if (sidebarApi?.open) {
            event.preventDefault();
            sidebarApi.open()
                .catch(() => window.location.assign(settingsBtn.href));
        }
    });
}

function wireCloseButton() {
    const closeBtn = document.getElementById('closeBtn');
    if (!closeBtn) return;

    closeBtn.addEventListener('click', () => {
        window.close();

        if (typeof chrome === 'undefined' || !chrome.tabs) return;

        chrome.tabs.getCurrent(tab => {
            if (tab?.id) {
                chrome.tabs.remove(tab.id);
            }
        });
    });
}
