# Product

RastChin is a coordinated suite of Persian-only, local-first tools maintained in
one public repository. This document records product behavior and boundaries;
implementation details belong in the architecture documentation.

## Purpose

Persian and mixed Persian-English text is frequently difficult to read in web
tools, code editors, and AI desktop applications because direction, punctuation,
code, URLs, and typography are handled inconsistently. RastChin improves RTL
layout and Persian typography while preserving the readability and behavior of
technical LTR content.

The product serves Persian-speaking people who use supported web applications,
VS Code, ChatGPT, Codex, and related tools. Documentation, releases, support,
security policy, and community contributions are maintained in the public GitHub
repository and official distribution channels.

## Platforms

- Chromium browser extension for supported websites.
- VS Code extension for editor and supported AI-agent extension surfaces.
- Electron desktop integrator for supported official AI desktop applications on
  Windows, macOS, and Linux.
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
5. Request support or contribute: a participant uses the appropriate public
   GitHub issue template, selects an owning application, follows its focused
   test and packaging rules, and submits a pull request without committing
   generated artifacts or secrets.
6. Release: maintainers verify affected applications and attach immutable
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
- Claude desktop support remains detected but blocked until the host-specific
  compatibility policy explicitly permits it.
- Generated exports, unpacked extensions, VSIX files, desktop packages, secrets,
  and local runtime profiles are not source-controlled.
- Successful application versions remain independently versioned.
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
- Third-party names and logos can be confused with RastChin ownership. Notices
  and the trademark policy distinguish nominative references from owned marks.

## Data And Files

- There is no product database and no user-upload storage.
- Browser preferences are held by Chrome storage; VS Code settings and backups
  remain on the user's machine; desktop runtime state and sanitized diagnostics
  are local and ephemeral.
- Chrome ZIPs, VSIX files, and desktop installers are generated release
  artifacts. Routine package workflows retain CI artifacts
  for 14 days; the signed macOS workflow retains them for 30 days. Official
  public artifacts remain with their release.

## Scale And Freshness

- Medium product scope because three clients and release tracks are maintained.
- Client installations scale independently without a RastChin server.
- No polling, SSE, WebSockets, event bus, worker, reporting store, archival
  database, or recovery service is required.

## External Systems

- Chrome APIs and supported websites: provide browser integration; unknown or
  changed layouts degrade locally and must not trigger data transmission.
- VS Code and supported AI-agent extensions: provide editor integration;
  unsupported versions fail before mutation and preserve restore capability.
- Official ChatGPT/Codex desktop installations: provide local desktop targets;
  invalid identity/signature or runtime compatibility blocks activation.
- GitHub, Chrome Web Store, and Visual Studio Marketplace: distribute source and
  verified artifacts; publication remains an explicit maintainer action.

## Success

- One public repository contains all three source applications, an accurate
  product and architecture map, reproducible pnpm setup, Apache-2.0 licensing,
  preserved third-party notices, a clear trademark policy, contributor/security
  documentation, and CI for application verification and package artifacts.
- Existing behavior and focused tests remain green after migration.
- Production dependency scanning has no unmitigated critical or high finding.
- Available host-specific package and smoke checks are documented honestly.

## Out Of Scope

- Accounts, authentication, payments, database records, uploads, object storage,
  queues, background workers, real-time delivery, mobile apps, public API, and
  telemetry.
- Automatic marketplace publication, production deployment, creation of signing
  credentials, and modification of source-repository Git histories.
- A shared RTL runtime package or broad UI redesign during consolidation.
