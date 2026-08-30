# Browser extension versioning

`manifest.json.version` is the Chrome Web Store release version.
`package.json.version` is the workspace and artifact version. They must always
match, and the packaging verifier rejects a mismatch.

## Prepare a release

From the monorepo root:

```bash
pnpm --filter rastchin-browser-extension run verify:version
pnpm --filter rastchin-browser-extension test
pnpm --filter rastchin-browser-extension run build:unpacked
pnpm --filter rastchin-browser-extension run verify:unpacked
pnpm --filter rastchin-browser-extension run package:store
```

The resulting ZIP is local release output under
`apps/browser-extension/dist/`; it is never committed. Follow the repository
release guide and the Chrome Store
[submission checklist](../store/chrome/submission-checklist.md) for owner review
and publication. Packaging or tagging alone does not publish a store version.

## Coordinate the website

The website and extension now live in the same monorepo. Website release data
must be derived from the checked-in browser `manifest.json` and package metadata,
not typed independently or fetched from a sibling repository.

Do not present a version as available from Chrome Web Store until that version
is actually live. A source change may describe an upcoming version, while the
public download state must continue to identify the last confirmed store
release.
