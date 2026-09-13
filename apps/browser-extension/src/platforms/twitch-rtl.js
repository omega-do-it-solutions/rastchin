// Observed Twitch web chat and channel prose. Do not target the row, username,
// player, navigation, third-party overlays or arbitrary page paragraphs.
(() => {
    RastChinRecipe.runPlatformRecipe(RastChinStreamText.createRecipe({
        storageKey: 'twitchEnabled',
        hosts: ['www.twitch.tv', 'twitch.tv'],
        rtlClass: 'rastchin-twitch-rtl',
        messageSelectors: [
            '[data-a-target="chat-line-message-body"]',
            '[data-a-target="stream-title"]',
            '#live-channel-about-panel .about-section__panel--content p[dir]'
        ],
        composerSelector: '[data-a-target="chat-input"][contenteditable="true"]'
    }));
})();
