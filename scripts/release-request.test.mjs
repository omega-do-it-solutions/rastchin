#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentReleaseMetadata, releaseTrackNames } from "./release-metadata.mjs";
import { selectAutomaticRelease } from "./release-request.mjs";

async function currentFixture() {
  const currentMetadata = {};
  const previousVersions = {};
  for (const track of releaseTrackNames) {
    currentMetadata[track] = await getCurrentReleaseMetadata({ track });
    previousVersions[track] = currentMetadata[track].version;
  }
  return { currentMetadata, previousVersions };
}

test("automatic release is a no-op when a manifest changes without a version bump", async () => {
  const fixture = await currentFixture();
  const request = selectAutomaticRelease({
    ...fixture,
    changedPaths: ["apps/vscode-extension/package.json"],
    commitSubject: "docs: revise extension metadata",
  });

  assert.equal(request.shouldRelease, false);
});

test("automatic release selects the one track whose version changed", async () => {
  const fixture = await currentFixture();
  fixture.previousVersions.vscode = "0.0.0";
  const request = selectAutomaticRelease({
    ...fixture,
    changedPaths: ["apps/vscode-extension/package.json"],
    commitSubject: "feat: improve Persian rendering",
  });

  assert.equal(request.shouldRelease, true);
  assert.equal(request.track, "vscode");
  assert.equal(request.prerelease, false);
  assert.equal(request.macosMode, "ad-hoc");
  assert.match(request.summary, /feat: improve Persian rendering/);
});

test("automatic release rejects multiple independent version bumps", async () => {
  const fixture = await currentFixture();
  fixture.previousVersions.browser = "0.0.0";
  fixture.previousVersions.desktop = "0.0.0";

  assert.throws(
    () =>
      selectAutomaticRelease({
        ...fixture,
        changedPaths: [
          "apps/browser-extension/manifest.json",
          "apps/desktop-integrator/package.json",
        ],
        commitSubject: "release: bump two products",
      }),
    /More than one release track changed/,
  );
});

test("automatic release validates the configured macOS mode", async () => {
  const fixture = await currentFixture();
  fixture.previousVersions.desktop = "0.0.0";

  assert.throws(
    () =>
      selectAutomaticRelease({
        ...fixture,
        changedPaths: ["apps/desktop-integrator/package.json"],
        commitSubject: "release: desktop",
        macosMode: "unknown",
      }),
    /ad-hoc or signed/,
  );
});
