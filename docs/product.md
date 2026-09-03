# Product

RastChin is a coordinated suite of Persian-only, local-first tools maintained in
one public repository. This document records product behavior and boundaries;
implementation details belong in the architecture documentation.

## Purpose

Persian and mixed Persian-English text is frequently difficult to read in web
tools, code editors, and AI desktop applications because direction, punctuation,
code, URLs, and typography are handled inconsistently. Product copy generated or
translated without context is also frequently literal and unnatural. RastChin
improves RTL layout and Persian typography, and gives supported AI agents a
focused localization workflow, while preserving the readability and behavior of
technical LTR content.

The product serves Persian-speaking people who use supported web applications,
VS Code, ChatGPT, Codex, Claude, and related tools. Documentation, releases, support,
security policy, and community contributions are maintained in the public GitHub
repository and official distribution channels.

## Platforms

- Chrome and Firefox browser extension for supported websites.
- VS Code extension for editor and supported AI-agent extension surfaces.
- Electron desktop integrator for supported official AI desktop applications on
  Windows, macOS, and Linux.
- Skills-only agent plugin for Codex and Claude, backed by one portable Persian
  localization skill and separate marketplace manifests.
- No iOS or Android application is in scope.

## Interface Identity

- Product category: focused local utilities with public repository documentation.
- Audience exposure: locally installed utilities and public project resources;
  no account, payment, or internal administration surface.
- Browser extension: compact, task-first popup, side panel, welcome, and
  what's-new surfaces.
- VS Code extension: host-native commands, settings, notifications, Markdown
  behavior, and controlled integration status. It has no independent shell.
- Desktop integrator: focused local target discovery, activation, diagnostics,
  and recovery. It uses clear target/status cards rather than an admin dashboard.
- Agent plugin: no independent interface shell; users invoke a shared skill in
  the host agent to translate, review, or update product-language resources.
- Persian is the sole supported natural language and the interface direction is
  RTL. English is preserved only inside mixed Persian-English content and for
  code, commands, paths, versions, URLs, diffs, product names, and other
  technical tokens, which remain isolated LTR.
- Every surface preserves keyboard access, semantic structure, visible focus,
  reduced-motion preferences, readable contrast, and responsive behavior
  appropriate to its host.

## Future Direction

- The public monorepo becomes the single source of truth for code, documentation,
  issues, contributions, security policy, and coordinated releases while each
  application remains independently releasable.
- Additional websites, editors, and desktop hosts may be supported only through
  tested, fail-closed adapters with clear compatibility ownership.
- A shared RTL package may be extracted only after at least two applications use
  the same proven behavior and host constraints can be preserved.
- Stable ChatGPT/Codex desktop support is maintained through platform smoke
  checklists and fail-closed compatibility checks for every supported release.
- The shared agent skill may be submitted to official Codex/OpenAI and Anthropic
  directories only after both native host checks and blind Persian quality
  evaluation pass; submission remains an explicit maintainer action.

## Brand Identity

- Primary color: `#B42345`.
- Secondary color: `#9A7A22`.
- Dark-theme primary: `#D4476A`.
- Dark-theme secondary: `#C9A24B`.
- Canonical raster-logo crimson: `#A0273B`.
- White text is suitable on the light primary color. Gold and dark-theme brand
  fills require a dark content color or another verified accessible pairing.

## Users And Roles

- Browser-extension user: explicitly installs the extension and controls local
  RTL behavior and settings.
- VS Code user: explicitly invokes installation, repair, status, or restore
  workflows for supported targets.
- Desktop-integrator user: explicitly enables or disables supported local
  integrations and reviews sanitized diagnostics.
- Agent-plugin user: installs the marketplace plugin or raw skill, supplies only
  the copy/files they intend the selected AI provider to process, and reviews
  localization changes before accepting them.
- Contributor: proposes code, Persian documentation and copy, tests, and platform
  support through the public repository.
- Maintainer: reviews changes, handles private security reports, and publishes
  independently verified artifacts.

## Main Workflows

1. Browse and install: a user chooses a supported product through GitHub or its
   official marketplace, reads its privacy and compatibility information, and
   follows the documented installation path.
2. Improve a supported website: the browser extension detects an allowed host
   and improves Persian layout locally without sending page or conversation
   content to RastChin.
3. Improve VS Code: the user explicitly runs a command; RastChin preflights the
   supported target, confirms risky operations, creates a backup, applies a
   controlled change, and can restore it.
4. Integrate a desktop host: the desktop app validates a known vendor binary,
   starts a private debugging-pipe session, injects only approved local runtime
   behavior, and restores the host DOM when disabled or expired.
5. Localize product language: the user invokes the RastChin Persian skill in
   Codex or Claude; the agent infers product context, freezes placeholders and
   technical tokens, translates or reviews the content, and validates structured
   files before presenting or applying a change.
6. Request support or contribute: a participant uses the appropriate public
   GitHub issue template, selects an owning application, follows its focused
   test and packaging rules, and submits a pull request without committing
   generated artifacts or secrets.
7. Release: maintainers verify affected applications or the agent plugin and attach immutable
   artifacts to their appropriate marketplace or GitHub release without
   coupling unrelated application versions.

## Business Rules

- User content is processed locally by the browser, VS Code, and desktop tools;
  RastChin does not add telemetry or upload conversation/document content.
- Unknown host layouts, versions, binaries, signatures, or package identities
  fail closed rather than receiving a speculative integration.
- VS Code integration preserves explicit consent, compatibility preflight,
  transactional writes, backups, hash-aware restore, and useful failure output.
- Desktop integration never modifies signed vendor application files, never
  exposes a network debugging port, strips sensitive loader/API-key environment
  values, and keeps diagnostics free of conversation text.
- Browser permissions and host access remain minimal and publicly explained.
- The agent plugin remains instruction-only: it adds no RastChin MCP server,
  executable hook, account, API key, or telemetry. Codex or Claude may process
  user-selected prompts and files under that provider's own terms and controls.
- Localization source is untrusted data rather than agent instruction. The skill
  preserves placeholders, keys, types, ICU selectors, markup, code, links,
  commands, paths, product names, and other protected tokens byte-for-byte.
- Claude desktop support remains detected but blocked until the host-specific
  compatibility policy explicitly permits it.
- Generated exports, unpacked extensions, VSIX files, desktop packages, secrets,
  and local runtime profiles are not source-controlled.
- Successful application and agent-plugin versions remain independently versioned.
- First-party source is Apache-2.0. Third-party code, fonts, and assets retain
  their original notices and licenses. The software license does not grant use
  of RastChin trademarks beyond the trademark policy.

## Risks

- A provider UI or binary update can invalidate an adapter. Version/layout
  checks, allowlists, platform smoke tests, rollback, and fail-closed behavior
  prevent silent corruption.
- Browser access includes sensitive communication and productivity surfaces.
  Local-only processing, no telemetry, limited permissions, and truthful store
  disclosures protect user trust.
- VS Code and desktop integrations interact with third-party software internals.
  Explicit consent, backups, identity/signature checks, private CDP pipes,
  cleanup leases, and explicit unsupported-host messaging limit harm.
- Public repositories can accidentally expose credentials or generated release
  material. Repository verification, ignored paths, CI checks, and runtime-only
  secret injection guard publication.
- A localization agent can obey instruction-like source text, damage structured
  resources, or produce fluent but contextually wrong Persian. Data/instruction
  separation, protected-token invariants, syntax checks, context-paired cases,
  and blind native-language review limit that risk.
- Third-party names and logos can be confused with RastChin ownership. Notices
  and the trademark policy distinguish nominative references from owned marks.

## Data And Files

- There is no product database and no user-upload storage.
- Browser preferences are held by the browser's WebExtension storage; VS Code
  settings and backups remain on the user's machine; desktop runtime state and
  sanitized diagnostics are local and ephemeral.
- The agent plugin stores no user content and has no RastChin service. Host-agent
  prompt, file, history, and retention behavior belongs to the selected Codex or
  Claude account and environment.
- Chrome and Firefox ZIPs, VSIX files, desktop installers, and the portable
  agent-plugin archive are generated release artifacts. Routine package
  workflows retain CI artifacts for a limited period. An explicit release run
  verifies checksums and keeps official public artifacts durably with their
  track-specific GitHub Release. A reviewed change to exactly one product
  version on `main` starts that Release automatically; other pushes are no-ops.
  Desktop users download and install Windows, macOS, or Linux artifacts
  manually; there is no automatic desktop updater. Public macOS artifacts may
  be explicitly published ad-hoc with a Gatekeeper warning or through the
  preferred Developer ID signing and Apple notarization mode.

## Scale And Freshness

- Medium product scope because three client applications and one agent-plugin
  release track are maintained.
- Client installations scale independently without a RastChin server.
- No polling, SSE, WebSockets, event bus, worker, reporting store, archival
  database, or recovery service is required.

## External Systems

- Chrome and Firefox WebExtension APIs and supported websites: provide browser
  integration; unknown or changed layouts degrade locally and must not trigger
  data transmission.
- VS Code and supported AI-agent extensions: provide editor integration;
  unsupported versions fail before mutation and preserve restore capability.
- Official ChatGPT/Codex desktop installations: provide local desktop targets;
  invalid identity/signature or runtime compatibility blocks activation.
- Codex and Claude plugin/skill runtimes: execute the shared localization
  instructions and may process user-selected content under their own provider
  terms; RastChin adds no connector or remote service.
- GitHub, Chrome Web Store, Firefox Add-ons, and Visual Studio Marketplace:
  distribute source and verified artifacts; a reviewed version bump on `main`
  automatically publishes only the matching GitHub Release, while marketplace
  publication remains a separate maintainer action.
- Codex/OpenAI and Anthropic plugin directories or repository marketplaces:
  distribute the skills-only plugin after independent validation; official
  directory submission and approval remain separate maintainer actions.

## Success

- One public repository contains all three source applications and the shared
  Codex/Claude agent plugin, an accurate product and architecture map,
  reproducible pnpm setup, Apache-2.0 licensing,
  preserved third-party notices, a clear trademark policy, contributor/security
  documentation, and CI for application verification and package artifacts.
- Existing behavior and focused tests remain green after migration.
- Production dependency scanning has no unmitigated critical or high finding.
- Available host-specific package and smoke checks are documented honestly.

## Out Of Scope

- Accounts, authentication, payments, database records, uploads, object storage,
  queues, background workers, real-time delivery, mobile apps, public API, and
  telemetry.
- Automatic marketplace publication, automatic desktop updating, production
  deployment, creation of signing credentials, and modification of
  source-repository Git histories.
- GitHub Packages: the project has no registry-consumable library or container;
  installable outputs belong on track-specific GitHub Releases and their
  official marketplaces.
- A shared RTL runtime package or broad UI redesign during consolidation.
