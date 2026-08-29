# Windows compatibility smoke checklist

Run this checklist on a disposable Windows 11 test account before enabling any version
for general users.

## Preparation

1. Install the latest official ChatGPT/Codex and Claude desktop applications.
2. Install Node.js 24, enable Corepack, and clone the RastChin monorepo.
3. Open a non-administrator PowerShell terminal in the monorepo root.
4. Run:

   ```powershell
   corepack enable
   pnpm install --frozen-lockfile
   pnpm --filter rastchin-desktop-integrator test
   pnpm --filter rastchin-desktop-integrator verify
   pnpm --filter rastchin-desktop-integrator dev:runtime
   ```

5. Close ChatGPT completely, including tray processes.
6. Click **Scan again** and record the detected package name and version.

Never take ownership of `WindowsApps`, edit `app.asar`, disable package integrity, or
run the integrator as Administrator.

## ChatGPT/Codex checks

1. Click **Enable RTL**. A packaged stable build must show this action
   when opened normally, without PowerShell or an environment variable.
2. Confirm that the original official app opens and login/session state is preserved.
3. Send a Persian paragraph containing English words, a URL, and a file path.
4. Generate unordered and numbered Persian lists. Verify marker placement and
   Vazirmatn after streaming finishes.
5. Generate a fenced code block and inline code. Verify both remain LTR and monospace.
6. Stop a response during generation. Verify already-generated Persian blocks remain
   RTL and styled.
7. Regenerate the response. Verify the final DOM replacement is styled again.
8. Type and paste mixed Persian and English into the composer using IME/composition.
   Verify any Persian text makes the composer RTL without scrambling English tokens.
9. Open an interactive clarification/question card. Verify Persian titles and choices
   without changing buttons, icons, or control geometry.
10. Click **Disable RTL**. Verify added direction, font, styles, and observers are
    removed without closing or corrupting the conversation.
11. Restart the vendor app normally. Verify no RastChin behavior remains unless it is
    launched again through the integrator.

## Claude future-release checks

1. Confirm Claude Desktop is detected and marked as planned for a future release.
2. Confirm its card explains that the current host rejects the required private
   Chromium connection.
3. Confirm the Claude action is disabled and that no web fallback is offered.
4. Confirm Claude Desktop is not launched and no `CDP client closed` error appears.

## Failure evidence

If the probe fails, record only:

- Windows version and architecture.
- Vendor application version and package identity.
- RastChin version.
- The local error shown in the manager.
- The expanded **Renderer diagnostics (no conversation text)** block.
- A screenshot with private conversation content removed.

Before retrying, close the vendor app completely and click **Scan again**. A failed
private-pipe launch can leave the official app running normally; RastChin deliberately
does not terminate it. The next enable attempt should show **Close the app first**, not
`CDP client closed`.

Do not submit conversation text, authentication data, renderer dumps, or debugging
ports. The built-in diagnostic block is safe to submit because renderer titles, URL
queries, URL paths, and DOM text are excluded. Leave the version unsupported until an
adapter update and a complete retest.
