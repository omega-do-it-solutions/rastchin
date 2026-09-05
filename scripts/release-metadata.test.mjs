#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  getCurrentReleaseMetadata,
  getReleaseMetadata,
  releaseTrackNames,
  renderReleaseNotes,
  validateReleaseSummary,
} from "./release-metadata.mjs";

test("all current release tracks resolve to their independent tags", async () => {
  assert.deepEqual(releaseTrackNames, ["browser", "vscode", "desktop", "agent"]);

  const expectedLabels = {
    browser: "Browser extension",
    vscode: "VS Code extension",
    desktop: "Desktop Integrator",
    agent: "Persian agent plugin",
  };

  for (const track of releaseTrackNames) {
    const metadata = await getCurrentReleaseMetadata({ track });
    assert.equal(metadata.tag, `${track}-v${metadata.version}`);
    assert.equal(metadata.title, `${expectedLabels[track]} v${metadata.version}`);
    assert.doesNotMatch(metadata.title, /^RastChin\b/);
  }
});

test("release metadata rejects an unsynchronized requested version", async () => {
  const current = await getCurrentReleaseMetadata({ track: "browser" });
  const mismatchedVersion = current.version === "9.9.9" ? "9.9.8" : "9.9.9";
  await assert.rejects(
    getReleaseMetadata({ track: "browser", version: mismatchedVersion }),
    /does not match release metadata/,
  );
});

test("release metadata rejects unsupported tracks and loose versions", async () => {
  await assert.rejects(
    getReleaseMetadata({ track: "unknown", version: "1.0.0" }),
    /Unknown release track/,
  );
  await assert.rejects(
    getReleaseMetadata({ track: "browser", version: "v1.1.71" }),
    /numeric x\.y\.z form/,
  );
});

test("release notes require a user-visible summary and document manual desktop installs", async () => {
  assert.throws(() => validateReleaseSummary("  "), /summary is required/);

  const metadata = await getCurrentReleaseMetadata({ track: "desktop" });
  const notes = renderReleaseNotes(metadata, "بهبود نمایش متن فارسی در نسخهٔ دسکتاپ.");

  assert.match(notes, /به‌صورت دستی نصب کنید/);
  assert.match(notes, /SHA256SUMS/);
  assert.match(notes, /tag جابه‌جا نخواهد شد/);
});

test("ad-hoc macOS release notes disclose Gatekeeper and missing notarization", async () => {
  const metadata = await getCurrentReleaseMetadata({ track: "desktop" });
  const notes = renderReleaseNotes(metadata, "انتشار آزمایشی دسکتاپ.", {
    macosMode: "ad-hoc",
  });

  assert.match(notes, /Gatekeeper/);
  assert.match(notes, /Open Anyway/);
  assert.match(notes, /notarization اپل ندارد/);
});
