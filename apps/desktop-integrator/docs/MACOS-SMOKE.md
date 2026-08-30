# macOS compatibility smoke checklist

Validate stable macOS support with this checklist on both Apple Silicon and Intel
using the current unified ChatGPT application.

## Source preparation

Use Node.js 24 and run the workspace commands from the RastChin monorepo root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter rastchin-desktop-integrator test
pnpm --filter rastchin-desktop-integrator verify
pnpm --filter rastchin-desktop-integrator package:mac
```

The last command creates internal ad-hoc-signed artifacts. Public artifacts
must follow the signed release path below.

## Preparation

1. Use macOS 14 or newer.
2. Install the current official **ChatGPT** application. RastChin deliberately ignores
   ChatGPT Classic (`com.openai.chat`).
3. Install the RastChin DMG matching the Mac architecture and move RastChin to
   `/Applications`.
4. Fully quit ChatGPT with **Command+Q**.
5. Open RastChin and click **Scan again**.

RastChin accepts only the official unified OpenAI bundle (`com.openai.codex`) signed by
the pinned OpenAI Apple Team ID. It never edits the application bundle.

## Runtime checks

1. Confirm ChatGPT/Codex is detected as a macOS Application.
2. Click **Enable RTL** and confirm the official ChatGPT application opens.
3. Send a Persian paragraph containing English words, a URL, and a file path.
4. Generate unordered and numbered Persian lists. Verify marker placement and
   Vazirmatn after streaming finishes.
5. Generate fenced and inline code. Verify code remains LTR and monospace.
6. Stop a response during generation and verify the existing Persian text remains RTL.
7. Type and paste mixed Persian/English text in the composer. Verify any Persian text
   makes the composer RTL without scrambling English tokens.
8. Open a Codex interactive question. Verify the Persian title/descriptions, English
   labels, radio indicators, links, and code.
9. Close the RastChin window. Confirm the menu-bar process remains available while RTL
   is active.
10. Choose **Disable RTL** and verify the DOM, font, observers, and direction changes
    are restored.

## Release validation

The regular `Desktop packages` workflow creates internal ad-hoc-signed artifacts.
It verifies the unpacked app and the exact app mounted from every generated DMG before
uploading them. Ad-hoc signatures are not a replacement for Developer ID trust, so
public DMGs must use the manual `Signed macOS desktop release` workflow with its
Developer ID and Apple notarization secrets configured; the workflow fails closed
when credentials are missing. Validate the final artifact:

```bash
codesign --verify --deep --strict "/Applications/RastChin Desktop Integrator.app"
spctl --assess --type exec "/Applications/RastChin Desktop Integrator.app"
xcrun stapler validate "/Applications/RastChin Desktop Integrator.app"
```

If the private debugging pipe is rejected or no compatible renderer is found, mark
that host version unsupported and record only the sanitized renderer diagnostics
shown by RastChin.
