# Releasing RastChin

RastChin has four independent release tracks: three applications and one agent plugin. A change to one track does not require unrelated version bumps or artifacts. Package creation, marketplace publication, Git tagging, and GitHub release creation are separate explicit actions.

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
- Never publish automatically as a side effect of `push`, `pull_request`, or a packaging command.
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

The `Browser extension packages` workflow builds and uploads both finite-retention ZIPs in one CI artifact; it does not sign or publish them.

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

The `VS Code extension package` workflow creates a finite-retention VSIX artifact; it does not publish it.

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
5. Treat ordinary macOS packages as internal ad-hoc artifacts only. Public macOS downloads must use the manually dispatched `Signed macOS desktop release` workflow with Developer ID signing, notarization, stapling, and post-package verification.
6. Confirm every installer contains the baked stable runtime policy, Apache/NOTICE/third-party files, and matching app/version/architecture metadata before attaching it to a GitHub release.

Windows and macOS packages must be built and verified on their native CI runners. Cross-building is not evidence of host compatibility.

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
7. Tag the reviewed commit as `agent-v<version>`. Repository marketplace
   availability follows the source/tag; submission to an official OpenAI/Codex
   or Anthropic directory is a separate manual action and must not be inferred
   from validation or tagging.

Claude plugin/skill support is separate from the desktop integrator's host
matrix. Releasing this plugin does not claim that the Electron integrator can
modify or manage Claude Desktop.

## Publish and verify

For each track:

1. Create the prefixed version tag on the reviewed commit.
2. Create release notes with user-visible changes, fixed security issues, permissions/privacy impact, known limitations, supported hosts, upgrade/restore guidance, and verification summary.
3. Attach only verified artifacts and checksums.
4. Publish through the official account or deployment process.
5. Install the public artifact from its real channel and run a short post-release smoke check.
6. Update public release notes only after the destination is live.

## Failure and rollback

- Stop publication when a required test, security gate, signature, notarization, package inspection, or host smoke check fails.
- Do not replace an artifact under an existing version. Fix the problem and issue a new version.
- For an extension or desktop regression, unlist or warn on the affected artifact where the channel permits, publish clear restore/disable guidance, and prepare a tested patch release.
- For a suspected compromise, stop the release, rotate affected credentials outside Git, preserve evidence, and follow [SECURITY.md](SECURITY.md).
