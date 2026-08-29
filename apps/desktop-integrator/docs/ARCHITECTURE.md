# Architecture

## Trust boundary

RastChin is a renderer styling companion, not an AI client. It does not authenticate
to OpenAI or Anthropic, proxy requests, inspect network traffic, or store conversation
content.

The cross-platform manager has four responsibilities:

1. Discover installed applications and report package/version information.
2. Refuse unsupported platforms, missing executables, already-running processes, and
   unvalidated layouts.
3. For a target whose host permits it, launch the vendor app with a private Chromium
   debugging pipe and attach to a renderer whose DOM signature matches its adapter.
4. Inject or remove the local RTL runtime in memory.

## Why vendor packages are never patched

ChatGPT/Codex and Claude are distributed as signed or package-managed applications.
Editing their deployed assets would be fragile, could invalidate package integrity,
and would be replaced by updates. This project deliberately contains no write path
for vendor application files on any platform.

Discovery validates the platform identity before offering an action:

- Windows: exact package/executable discovery.
- macOS: exact `com.openai.codex` bundle identity and pinned OpenAI Team ID, checked
  again immediately before launch. ChatGPT Classic is excluded.
- Linux: the expected `chatgpt` package name, launcher and renderer paths, host/package
  architecture, root ownership, permissions, and package-database file verification,
  checked again immediately before launch. Package-manager metadata is an integrity
  boundary, not cryptographic proof that a locally installed DEB came from OpenAI;
  users must install ChatGPT from OpenAI's official download.

## Shared renderer runtime

The injected runtime is derived from the established RastChin browser implementation:

- `rtl-engine.js`: mutation batching, protected-token classification, streaming
  settling, reversible styles.
- `bidi-isolate.js`: reversible isolation for LTR runs inside Persian text.
- `recipe-runner.js`: declarative target-specific selectors and lifecycle.
- `font-inject.js`: local Vazirmatn font application and shadow-root coverage.
- `auto-direction.js`: composer direction based on Persian presence, including
  controlled-editor paste commits; English-only content remains LTR.
- `desktop-fallback-rtl.js`: conservative prose/list/table handling for local Electron
  shells that do not expose the public website selectors.
- `chatgpt-rtl.js` / `claude-rtl.js`: target-specific DOM and code guards.
- `codex-question-card-rtl.js`: semantic interactive-question styling that preserves
  English labels, code, links, inputs, icons, and control geometry.

The desktop host supplies the font as an in-memory data URL and a virtual target
hostname. No browser-extension API is required.

## Runtime lifecycle

```text
Scan -> select exact executable -> require normal app to be closed
     -> launch with private debugging pipe -> enumerate renderers
     -> run read-only exact-selector + desktop-shell probe
     -> inject compatible renderer
     -> monitor renderer replacement -> re-probe/re-inject
     -> renew renderer lease while connected
     -> disable/lease expiry -> restore DOM -> detach -> close transport
```

The Chromium pipe remains a guarded runtime mechanism on every platform.
Current Claude Desktop
builds explicitly reject the required debugging switch, so Claude is marked
`host-blocked` before launch and the UI presents it as planned for a future release.
RastChin does
not attempt to forge host authorization, patch Claude's signed package, or fall back
to an exposed debugging port. Packaged builds declare
their channel and runtime policy through metadata baked into the application archive;
they do not depend on a user environment variable.

## Fail-closed rules

- Unknown platform: discovery reports unsupported and runtime policy remains disabled.
- Packaged platform absent from the baked allowlist: runtime injection is unavailable.
- macOS vendor identity/signature mismatch: installation is ignored and launch refused.
- Linux package ownership, path, permission, or verification mismatch: installation is
  ignored and launch refused.
- Unknown target: rejected.
- Host-declared blocked target: rejected before app launch, with a supported fallback.
- No explicit executable: rejected.
- Unexpected executable filename: rejected.
- App already running: user must close it first.
- No matching renderer signature: injection is not applied.
- Failed retry: process discovery is refreshed before creating another transport.
- Renderer or transport failure: cleanup is attempted, the status becomes failed, and
  a renderer-side lease restores injected changes if the controller disappears.
- A package without an enabled baked policy: runtime injection is unavailable.
