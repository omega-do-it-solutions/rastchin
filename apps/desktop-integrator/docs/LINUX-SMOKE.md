# Linux compatibility smoke checklist

Validate stable Linux support with this checklist on a native supported distribution
under both X11 and Wayland/XWayland.

## Source preparation

Use Node.js 24 and run the workspace commands from the RastChin monorepo root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter rastchin-desktop-integrator test
pnpm --filter rastchin-desktop-integrator verify
pnpm --filter rastchin-desktop-integrator dev:runtime
```

Do not run the integrator or these commands as root.

## Supported host applications

RastChin's supported Linux matrix covers Ubuntu 24.04/26.04, Debian 13, and Fedora
43/44 on x64 and arm64. RastChin accepts only the official package identity:

- DEB/RPM package: `chatgpt`
- Package launcher: `/usr/bin/chatgpt`
- Expected launcher target: `/usr/lib/chatgpt/codex-launcher`
- Running application: `/usr/lib/chatgpt/ChatGPT`

Claude Desktop can be detected from the official `claude-desktop` package, but its RTL
action remains disabled because the required renderer connection is not supported.

## Installation and use

Install the RastChin package matching the distribution:

```bash
# Ubuntu / Debian
sudo apt install ./RastChin-Desktop-Integrator-*-Linux-*.deb

# Fedora
sudo dnf install ./RastChin-Desktop-Integrator-*-Linux-*.rpm
```

Portable AppImage fallback:

```bash
chmod +x RastChin-Desktop-Integrator-*-Linux-*.AppImage
./RastChin-Desktop-Integrator-*-Linux-*.AppImage
```

Ubuntu 24.04 may require `sudo apt install libfuse2t64` for AppImage mounting. If
installing FUSE is not appropriate, use the DEB package or launch the portable build
without mounting it:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./RastChin-Desktop-Integrator-*-Linux-*.AppImage
```

Then fully quit ChatGPT, open RastChin, click **Scan again**, and click **Enable RTL**.
Keep RastChin running while the integration is active. If the desktop
does not display tray icons, RastChin keeps its manager window reachable (closing it
minimizes it). Starting RastChin again also focuses the existing single instance.

## Runtime checks

1. Confirm the package type, version, and architecture are detected.
2. Verify Persian paragraphs, headings, lists, tables, and final response fonts.
3. Verify links, file paths, inline code, and fenced code remain LTR.
4. Stop and regenerate a streaming response; verify both interrupted and settled DOM.
5. Type and paste mixed Persian/English text with the active input method. Verify any
   Persian text makes the composer RTL without scrambling English tokens.
6. Open an interactive Codex question and verify title, descriptions, labels, and
   indicators.
7. Repeat under X11 and Wayland/XWayland.
8. Click **Disable RTL** and verify complete restoration.

Do not run RastChin as root, change ownership of the vendor executable, or use an
unofficial repackaged ChatGPT application. A package/path/permission mismatch fails
closed by design.
