# Release tooling security patches

Reviewed on 2026-10-08 for browser 1.1.78 and VS Code 0.3.15.

The release gate audits the complete workspace, including build and test tools.
No additional dependencies are bundled into the browser ZIPs or VSIX.

## VSIX packaging

`@vscode/vsce` is pinned to stable 4.0.0. Its Node.js 22 baseline is compatible
with this workspace's Node.js 24 runtime. The upstream release replaces the old
glob/secretlint dependency chain, eliminating the affected `braces` package
without overriding it to an unpublished version or suppressing its advisory.
The existing `vsce package --no-dependencies` command remains the packaging
contract. See the [upstream release](https://github.com/microsoft/vscode-vsce/releases/tag/v4.0.0).

## Transitive pins

Ordinary semver-compatible updates refreshed Undici 7/8, brace-expansion 5 and
source-map-js. Some parent tools request exact affected versions, so narrow
selectors in `pnpm-workspace.yaml` supply compatible fixes:

| Affected pin | Replacement | Advisory |
| --- | --- | --- |
| fast-uri 3.1.6 | 3.1.7 | [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) |
| undici 6.28.0 | 6.28.1 | [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) |
| brace-expansion 1.1.18 | 1.1.20 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| brace-expansion 2.1.4 | 2.1.6 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| http-cache-semantics 4.2.0 | 4.3.0 | [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) |

Registry 4.3.0 is the first published fixed http-cache-semantics release on the
existing major line. The advisory's suggested 4.2.1 is not published.
Remove each selector when parent tools stop requesting its affected version;
these selectors do not pin future parent upgrades to today's replacement.

## Verification

Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm audit:prod`,
`pnpm audit --audit-level high`, `pnpm package:browser` and `pnpm package:vscode`.
The production audit is clean. Remaining moderate findings belong to build/test
tooling; they are not packaged into these two extensions. The existing audit
threshold is retained, with no ignored advisory or weakened release gate.
