# Releasing RastChin

RastChin has four independent release tracks: three applications and one agent plugin. A change to one track does not require unrelated version bumps or artifacts. Marketplace publication remains separate from GitHub publication. The `GitHub release` workflow combines verified package creation, the immutable track tag, checksums, and one GitHub Release after a reviewed version change reaches `main`; a manual dispatch remains available for first releases and recovery.

This guide is for maintainers. Contributors should not bump versions unless a maintainer has assigned a release task.

## Version sources

| Track | Authoritative version | Suggested tag | Primary artifact |
| --- | --- | --- | --- |
| Browser extension | `apps/browser-extension/manifest.json` and matching `package.json` | `browser-v<version>` | Chrome Web Store and Firefox Add-ons ZIPs |
| VS Code extension | `apps/vscode-extension/package.json` | `vscode-v<version>` | `rastchin-vscode-<version>.vsix` |
| Desktop integrator | `apps/desktop-integrator/package.json` | `desktop-v<version>` | OS- and architecture-specific installers/packages |
| Persian agent plugin | matching Codex/Claude manifests in `plugins/rastchin-persian` | `agent-v<version>` | Repository marketplace entry and shared portable skill |

The root package version tracks the repository foundation only. App changelogs remain with their applications; [CHANGELOG.md](CHANGELOG.md) records repository-wide changes.

## Release rules

- Start from a clean, reviewed commit on `main` with the frozen lockfile install passing.
- Release only from CI artifacts or a documented, equivalent clean build on the required target OS.
- Never publish from a pull request, feature branch, ordinary source change, or packaging command. A push to `main` publishes only when exactly one track's authoritative version changes; otherwise the release workflow is a successful no-op. Manual publication is limited to an explicit workflow dispatch from `main`.
- Never put marketplace tokens, signing certificates, notarization credentials, host passwords, or deployment keys in Git or build logs.
- Preserve `LICENSE`, `NOTICE`, all third-party license text, and the exact package identity in every artifact.
- Describe permissions, privacy, compatibility limitations, breaking behavior, and manual migration or restore steps truthfully.
- Create an immutable tag from the exact reviewed release commit. Do not move a published tag.
- Record checksums for downloadable artifacts where the distribution channel does not already provide integrity metadata.

## Repository-wide preflight

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm verify:public
pnpm audit:prod
pnpm audit --audit-level high
git status --short
```

Review dependency audit output even when it is below the blocking threshold. Confirm generated outputs are ignored and the source tree contains no `.env`, signing, package, or local-profile files.

## Automatic GitHub Releases

For a normal release:

1. Change exactly one product's authoritative version and all matching version sources listed above.
2. Update the affected changelog and release-facing compatibility, privacy, permission, migration, and limitation notes.
3. Open a pull request and complete review and CI.
4. Merge into `main`. The `GitHub release` workflow compares the previous and current `main` commits. If the selected product's version changed, it verifies the repository, creates the track tag, packages the product, generates checksums, and publishes the Release automatically.
5. Do not bump two independent product versions in one merge. The automatic workflow rejects that case so each Release retains a clear commit and artifact set; merge them separately or use manual dispatches.

Changing a manifest without changing its version does not publish anything. This prevents documentation, metadata, workflow, and ordinary bug-fix merges from recreating an existing Release.

## Manual first release or recovery

Use the manual path when the current version existed before automatic detection was added, or when a verified automatic run must be retried:

1. Open **Actions → GitHub release → Run workflow**.
2. Select the `main` branch, the release track, and the exact numeric version from that track's authoritative manifest.
3. Enter a concise user-visible summary, select prerelease only when the artifact is not stable, and choose the macOS mode for a desktop release.
4. Run the workflow once. It reruns the repository checks and dependency audits, rejects an existing tag, builds only the selected track, verifies the package, creates SHA-256 checksum files, and publishes the tag and Release from the exact `main` commit.
5. Open the public [GitHub Releases page](https://github.com/omega-do-it-solutions/rastchin/releases), download an artifact, verify its checksum, and complete the track's post-release smoke check.

The GitHub publication step uses the workflow's short-lived `GITHUB_TOKEN` with job-scoped `contents: write`; no personal GitHub token is required. The workflow does not publish to Chrome Web Store, Firefox Add-ons, Visual Studio Marketplace, an OS store, or an agent directory.

RastChin does not use GitHub Packages. Its public outputs are installable ZIP, VSIX, EXE, DMG, AppImage, DEB, RPM, and plugin archive files rather than reusable packages for a registry. The source repository and durable GitHub Release assets are the appropriate distribution surfaces; an empty Packages section is expected.

## Browser extension

1. Update both `manifest.json` and `package.json` to the same version, the app changelog, and the Chrome and Firefox store notes and privacy/permission disclosures.
2. Run:

   ```bash
   pnpm --filter rastchin-browser-extension test
   pnpm --filter rastchin-browser-extension verify
   pnpm --filter rastchin-browser-extension package:all
   ```

3. Follow the host-specific QA plus the [Chrome submission checklist](apps/browser-extension/store/chrome/submission-checklist.md) and [Firefox submission checklist](apps/browser-extension/store/firefox/submission-checklist.md), using test accounts and synthetic content.
4. Confirm both ZIPs contain only their verified unpacked trees, all referenced manifest assets, Apache/NOTICE/third-party files, and Vazirmatn's OFL text. Confirm the Firefox ZIP contains its stable Gecko ID and no-data-collection declaration.
5. Upload the Chrome ZIP manually through the official Chrome Web Store account. Upload the Firefox ZIP manually through Firefox Add-ons and use the Mozilla-signed result for distribution. Recheck each store's privacy and permission disclosures before submission.

The `Browser extension packages` workflow builds and uploads both finite-retention ZIPs in one CI artifact; it does not sign or publish them. The `GitHub release` workflow may attach those same verified submission ZIPs to a durable Release, but marketplace submission and browser-vendor signing remain separate.

## VS Code extension

1. Update `apps/vscode-extension/package.json` and its changelog. Preserve the marketplace identity `OmegaDoITSolutions.rastchin-vscode`.
2. Run:

   ```bash
   pnpm --filter rastchin-vscode test
   pnpm --filter rastchin-vscode package
   ```

3. Inspect the VSIX file list and confirm Apache, NOTICE, complete MIT attribution, Vazirmatn OFL text, runtime source, and manifest metadata are present.
4. For integration changes, complete the isolated Extension Development Host smoke matrix against every claimed target version. Verify consent, plan output, idempotent apply, update drift, disable, hash-aware restore, and uninstall recovery.
5. Publish the reviewed VSIX manually through the official Visual Studio Marketplace publisher account.

The `VS Code extension package` workflow creates a finite-retention VSIX artifact; it does not publish it. The `GitHub release` workflow publishes the verified VSIX as a manual-download asset but does not update Visual Studio Marketplace.

## Desktop integrator

1. Update `apps/desktop-integrator/package.json`, its changelog/release notes, support wording, supported-host matrix, and platform smoke documents.
2. Run on every target OS:

   ```bash
   pnpm --filter rastchin-desktop-integrator test
   pnpm --filter rastchin-desktop-integrator verify
   ```

3. Build native packages with the relevant package workflow or command:

   ```bash
   pnpm --filter rastchin-desktop-integrator package:win
   pnpm --filter rastchin-desktop-integrator package:mac
   pnpm --filter rastchin-desktop-integrator package:linux
   ```

4. Complete the matching Windows, macOS, and Linux smoke checklists. Verify official-target trust, process discovery, supported/unsupported states, enable/disable, cleanup, emergency disable, sanitized diagnostics, and vendor-file integrity.
5. The default `ad-hoc` GitHub release mode requires no Apple account or secret and attaches verified DMG/ZIP files, but the Release must disclose that downloaded builds may trigger Gatekeeper's unidentified-developer warning. The `signed` mode uses Developer ID signing, notarization, stapling, and post-package verification before attachment. The standalone `Signed macOS desktop package` workflow remains available for inspecting signed CI artifacts.
6. Confirm every installer contains the baked stable runtime policy, Apache/NOTICE/third-party files, and matching app/version/architecture metadata before attaching it to a GitHub release.

Windows and macOS packages must be built and verified on their native CI runners. Cross-building is not evidence of host compatibility. GitHub Release files are downloaded and installed manually; RastChin does not currently provide an automatic desktop updater.

The current Windows artifacts are not code-signed and may show a Microsoft SmartScreen warning. Add an organization-owned Windows signing service or certificate before claiming a trusted Windows publisher; never weaken or suppress the operating-system warning in product guidance.

Local testing and public download testing are different: files built on the same Mac usually lack the quarantine metadata added to an internet download. Gatekeeper evaluates downloaded applications and trusts normal distribution outside the Mac App Store when the application is signed with Developer ID and notarized by Apple. Until that is configured, users may need the official **Open Anyway** control in **System Settings → Privacy & Security** for an ad-hoc build.

Automatic desktop releases use `ad-hoc` mode by default. To switch them to trusted distribution, create the repository Actions variable `MACOS_RELEASE_MODE` with the value `signed` and add these GitHub Actions repository secrets:

- `MACOS_CSC_LINK`
- `MACOS_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## Persian agent plugin

1. Update the matching versions in both plugin manifests, the Claude marketplace
   entry, `evals/cases.json`, this release guide, and the relevant changelog. The
   Codex and Claude wrappers must continue to point to one shared skill tree.
2. Confirm the plugin remains skills-only unless a separately reviewed product
   decision explicitly adds executable behavior, authentication, an MCP server,
   or network access.
3. Run the repository gate and both platform-native validators:

   ```bash
   pnpm verify:agent-plugin
   python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/rastchin-persian
   claude plugin validate plugins/rastchin-persian --strict
   claude plugin validate .
   ```

4. Add the reviewed repository as a temporary local marketplace in each host,
   install `rastchin-persian@rastchin`, and start a new session. Test explicit
   invocation and automatic selection for translation, Persian review, JSON,
   ICU, HTML, and Markdown cases. Remove the temporary marketplace afterward.
5. Run the complete corpus and blind quality review in
   `plugins/rastchin-persian/evals/README.md`. All protected-token invariants must
   pass, the average score must be at least 17/20, and no case may score below
   15/20. Record host/model versions and any untested environment honestly.
6. Verify the installed copy contains both manifests, the shared skill and all
   referenced files, `LICENSE`, and `NOTICE`, with no hook, executable, MCP
   configuration, secret, or private path.
7. Merge the synchronized agent version change so the workflow creates
   `agent-v<version>` from the reviewed commit and publishes the portable archive
   and checksum. Use manual dispatch only for a first release or recovery.
   Repository marketplace availability follows the source/tag; submission to an
   official OpenAI/Codex or Anthropic directory is a separate manual action and
   must not be inferred from validation or tagging.

Claude plugin/skill support is separate from the desktop integrator's host
matrix. Releasing this plugin does not claim that the Electron integrator can
modify or manage Claude Desktop.

## Publish and verify

For each track, the workflow creates the prefixed version tag, standard release-note structure, verified artifacts, and checksums. A manual run uses the maintainer-provided summary; an automatic run includes the merged change's commit subject. Changelogs and the commit subject must describe user-visible changes and call out any security fix, permission/privacy change, migration, or additional limitation that the standard text cannot infer.

After publication:

1. Confirm the tag points to the intended reviewed commit on `main`.
2. Confirm every expected artifact and `SHA256SUMS-*.txt` file is visible on the Release.
3. Download one public artifact and verify its SHA-256 checksum.
4. Install it manually and run the affected track's short smoke check.
5. Publish to the relevant marketplace separately, when authorized, then test the marketplace-delivered copy.
6. Update the public notes if an externally imposed limitation was discovered during post-release testing.

## Failure and rollback

- Stop publication when a required test, security gate, signature, notarization, package inspection, or host smoke check fails.
- Do not replace an artifact under an existing version. Fix the problem and issue a new version.
- For an extension or desktop regression, unlist or warn on the affected artifact where the channel permits, publish clear restore/disable guidance, and prepare a tested patch release.
- For a suspected compromise, stop the release, rotate affected credentials outside Git, preserve evidence, and follow [SECURITY.md](SECURITY.md).
