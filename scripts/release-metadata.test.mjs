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

  for (const track of releaseTrackNames) {
    const metadata = await getCurrentReleaseMetadata({ track });
    assert.equal(metadata.tag, `${track}-v${metadata.version}`);
    assert.match(metadata.title, new RegExp(`v${metadata.version.replaceAll(".", "\\.")}$`));
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
