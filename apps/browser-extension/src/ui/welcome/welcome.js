document.addEventListener('DOMContentLoaded', () => {
    setWelcomeVersion();
    wireCloseButton();
});

function setWelcomeVersion() {
    const versionElement = document.getElementById('welcomeVersion');
    if (!versionElement) return;

    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
        versionElement.textContent = `v${chrome.runtime.getManifest().version}`;
    }
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
