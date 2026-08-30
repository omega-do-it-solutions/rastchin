# RastChin coordinated release checklist

This checklist coordinates website changes with the independently versioned
RastChin applications. Product planning belongs in the root documentation; this
file covers only release facts that can affect the public website.

## 1. Confirm source readiness

- The browser manifest, package version, and first changelog entry match.
- The VS Code package version and Marketplace metadata match.
- Desktop compatibility claims match the tested operating systems and supported
  target versions.
- User-facing support, privacy, install, and recovery statements remain true.
- No generated package, credential, local host detail, or nested `.git` directory
  is present in the source tree.

## 2. Verify the monorepo

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm audit --prod
pnpm verify:public
```

Critical or high production dependency findings block a release. A failed
application test or package verification also blocks its release artifact.

## 3. Synchronize the website

After a browser release change:

```bash
pnpm --filter @rastchin/web sync:release
pnpm --filter @rastchin/web sync:release:check
```

Review the generated source diff and the `apps/web/out/` preview. Check Persian
RTL layout, LTR isolation for technical strings, light/dark themes, keyboard
focus, mobile layout, store links, version text, changelog, privacy, and feedback
failure states.

Changes to VS Code or desktop support must update the corresponding website copy
before publishing or deploying a contradictory claim.

## 4. Package applications

- Browser: build the unpacked directory, run the browser tests and package
  verifiers, then produce the Chrome Web Store ZIP.
- VS Code: run tests and package verification, then produce a VSIX.
- Desktop: run shared tests plus the operating-system smoke guide before creating
  unsigned community artifacts. Signing and notarization use explicitly
  authorized secrets and workflows.
- Store generated archives in CI or GitHub Releases, not in the source tree.

## 5. Publish deliberately

Packaging, publication, and deployment are separate actions. None is implied by
a source merge.

- Chrome Web Store submission requires owner review of permissions, listing
  copy, privacy disclosures, screenshots, and the final ZIP.
- Visual Studio Marketplace publication requires owner review of the final VSIX
  and release notes.
- GitHub Release creation requires checksums and accurate compatibility notes.
- Website production deployment requires an approved dry run and the process in
  [hetzner-deploy.md](hetzner-deploy.md).

## 6. Post-release checks

- Install each published artifact from its real distribution channel.
- Confirm website routes and download links.
- Submit one authorized feedback smoke message and verify no provider detail is
  exposed to the browser.
- Record regressions in the unified issue tracker with the affected application
  label and exact version.
