# Architecture

RastChin is a pnpm monorepo containing three independently releasable local-first
applications and one independently versioned agent-plugin distribution.
Applications are deployable products; `plugins/` contains installable agent
capabilities; `packages/` is reserved for a future stable contract proven useful
to at least two applications.

| Unit | Responsibility | Runtime boundary |
| --- | --- | --- |
| `apps/browser-extension` | Persian-only RTL behavior for supported websites | Chrome/Firefox Manifest V3 backgrounds, content scripts, toolbar action, and side panel/sidebar |
| `apps/vscode-extension` | Persian-only RTL behavior and controlled agent-extension integration | VS Code extension host with transactional local patching and restore |
| `apps/desktop-integrator` | Runtime integration for supported official AI desktop apps | Electron manager and private CDP pipe; vendor files remain unchanged |
| `plugins/rastchin-persian` | Native Persian product-copy translation, review, and structured localization | One portable `SKILL.md`; thin Codex and Claude manifests; no executable, hook, MCP server, account, or RastChin network service |

## Dependency direction

Each application owns its host-specific composition, adapters, product behavior,
and tests. Shared-looking RTL modules remain app-local because the browser,
VS Code, and Electron injection environments have different loading, safety, and
compatibility requirements.

Browser background, core, platform, and UI modules retain their current
responsibilities. VS Code keeps extension entry points separate from file
transactions and target discovery. Electron keeps process composition,
discovery/trust services, CDP runtime, injected code, and renderer concerns
separated.

The agent plugin is not an application or a shared runtime package. Its
`skills/rastchin-persian/` tree is the single behavioral source for both hosts.
`.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` contain only
host-specific metadata, while `.agents/plugins/marketplace.json` and
`.claude-plugin/marketplace.json` expose the same plugin directory. References
needed at runtime remain inside the plugin because marketplaces cache the plugin
as a self-contained unit.

## Data flow

Browser, VS Code, and desktop content processing is local. RastChin adds no
telemetry or remote content API. There is no centralized application service,
database, object store, API service, worker, polling, SSE, WebSocket, or durable
event bus.

The agent plugin also adds no RastChin transport or storage. It supplies
instructions to Codex or Claude; any prompt/file processing, history, and
retention occur inside the user's selected provider environment and are not an
on-device guarantee made by RastChin.

## Safety boundaries

- Browser permissions and host patterns are explicit and documented.
- VS Code changes require supported targets, explicit user intent, backups,
  transactional writes, and hash-aware restore.
- Desktop targets require known executable and package/signature identity,
  private debugging pipes, sanitized environments and diagnostics, and cleanup
  on disable or lease expiry.
- Unknown versions and layouts fail closed.
- Agent localization treats source text as untrusted data, freezes technical
  tokens before translation, keeps structured resource shape intact, and uses
  deterministic invariant checks plus blind Persian-quality review.
- The agent plugin remains skills-only. Introducing hooks, executables, an MCP
  server, authentication, or network access requires a separate product,
  security, privacy, and release decision.
- Secrets are runtime-injected and generated releases are not committed.

The durable engineering rules used by project agents live in
[`docs/ai/architecture.md`](ai/architecture.md).
