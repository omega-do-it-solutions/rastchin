// Kick's virtualized chat exposes the message span separately from identity,
// timestamps and reply controls. Scope its utility class to that known list.
(() => {
    RastChinRecipe.runPlatformRecipe(RastChinStreamText.createRecipe({
        storageKey: 'kickEnabled',
        hosts: ['kick.com', 'www.kick.com'],
        rtlClass: 'rastchin-kick-rtl',
        messageSelectors: [
            '#chatroom-messages [data-index] span.font-normal',
            '[data-testid="livestream-title"]',
            '[data-testid="channel-about-description"]'
        ],
        composerSelector: '#channel-chatroom [data-testid="chat-input"][contenteditable="true"]'
    }));
})();
