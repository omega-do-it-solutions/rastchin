# Browser extension versioning

`manifest.json.version` is the canonical browser-extension release version.
`package.json.version` is the workspace and artifact version. They must always
match, and both Chrome and Firefox packaging verifiers reject a mismatch. The
generated Firefox manifest keeps this exact version.

## Prepare a release

From the monorepo root:

```bash
pnpm --filter rastchin-browser-extension run verify:version
pnpm --filter rastchin-browser-extension test
pnpm --filter rastchin-browser-extension run verify
pnpm --filter rastchin-browser-extension run package:all
```

The resulting Chrome Web Store and Firefox Add-ons ZIPs are local release output
under `apps/browser-extension/dist/`; they are never committed. Follow the
repository release guide, the [Chrome checklist](../store/chrome/submission-checklist.md),
and the [Firefox checklist](../store/firefox/submission-checklist.md) for owner
review and publication. Packaging or tagging alone does not sign or publish a
store version.

## Coordinate public release metadata

Store notes and GitHub release metadata must be derived from the checked-in
browser `manifest.json` and package metadata, not typed independently.

Do not present a version as available from Chrome Web Store or Firefox Add-ons
until that version is actually live in that channel. Availability can differ
between the two stores. A source change may describe an upcoming version, while
the public download state must continue to identify the last confirmed release
for each store.
