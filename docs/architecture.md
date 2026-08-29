# Architecture

RastChin is a pnpm monorepo containing four independently releasable local-first
applications. Applications are deployable products; `packages/` is reserved for
a future stable contract proven useful to at least two applications.

| Application | Responsibility | Runtime boundary |
| --- | --- | --- |
| `apps/web` | Public website, documentation, downloads, privacy, feedback | Static Next.js export plus a same-origin PHP feedback endpoint |
| `apps/browser-extension` | Persian-only RTL behavior for supported websites | Chrome Manifest V3 service worker, content scripts, popup, and side panel |
| `apps/vscode-extension` | Persian-only RTL behavior and controlled agent-extension integration | VS Code extension host with transactional local patching and restore |
| `apps/desktop-integrator` | Runtime integration for supported official AI desktop apps | Electron manager and private CDP pipe; vendor files remain unchanged |

## Dependency direction

Each application owns its host-specific composition, adapters, product behavior,
and tests. Shared-looking RTL modules remain app-local because the browser,
VS Code, and Electron injection environments have different loading, safety, and
compatibility requirements.

The website keeps Next.js `app/` as its framework route tree. Browser background,
core, platform, and UI modules retain their current responsibilities. VS Code
keeps extension entry points separate from file transactions and target
discovery. Electron keeps process composition, discovery/trust services, CDP
runtime, injected code, and renderer concerns separated.

## Data flow

Browser, VS Code, and desktop content processing is local. RastChin adds no
telemetry or remote content API. The only centralized request is website
feedback:

```text
feedback form -> same-origin PHP validation/rate limit -> SendGrid -> support mailbox
```

There is no database, object store, API service, worker, polling, SSE,
WebSocket, or durable event bus.

## Safety boundaries

- Browser permissions and host patterns are explicit and documented.
- VS Code changes require supported targets, explicit user intent, backups,
  transactional writes, and hash-aware restore.
- Desktop targets require known executable and package/signature identity,
  private debugging pipes, sanitized environments and diagnostics, and cleanup
  on disable or lease expiry.
- Unknown versions and layouts fail closed.
- Secrets are runtime-injected and generated releases are not committed.

The durable engineering rules used by project agents live in
[`docs/ai/architecture.md`](ai/architecture.md).
