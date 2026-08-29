import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const extensionDir = process.env.RASTCHIN_EXTENSION_DIR
  ? resolve(process.env.RASTCHIN_EXTENSION_DIR)
  : resolve(appDir, "../browser-extension");

const files = {
  extensionRelease: resolve(appDir, "content/extension-release.ts"),
  changelog: resolve(appDir, "content/changelog.ts"),
  privacyPage: resolve(appDir, "app/privacy/page.tsx"),
  faDictionary: resolve(appDir, "content/dictionaries/fa.ts"),
  manifest: resolve(extensionDir, "manifest.json"),
  extensionPackage: resolve(extensionDir, "package.json"),
  extensionChangelog: resolve(extensionDir, "src/ui/shared/changelog-data.js"),
};

function read(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function fail(message) {
  console.error(`release sync check failed: ${message}`);
  process.exitCode = 1;
}

function browserChangelogVersion() {
  const context = { window: {} };
  runInNewContext(read(files.extensionChangelog), context, { timeout: 1000 });
  const entry = context.window.RASTCHIN_CHANGELOG?.[0];
  return entry?.version || (entry?.tag?.startsWith("v") ? entry.tag.slice(1) : "");
}

const extensionRelease = read(files.extensionRelease);
const changelog = read(files.changelog);
const privacyPage = read(files.privacyPage);
const faDictionary = read(files.faDictionary);
const manifest = readJson(files.manifest);
const extensionPackage = readJson(files.extensionPackage);

const version = extensionRelease.match(/version:\s*"([^"]+)"/)?.[1];

if (!version) {
  fail("content/extension-release.ts must declare extensionRelease.version");
}

if (manifest.version !== extensionPackage.version) {
  fail(`browser manifest/package mismatch: ${manifest.version} != ${extensionPackage.version}`);
}

if (version !== manifest.version) {
  fail(`website release ${version} does not match browser workspace ${manifest.version}`);
}

if (browserChangelogVersion() !== manifest.version) {
  fail(`browser changelog does not start with version ${manifest.version}`);
}

if (!/version:\s*extensionRelease\.version/.test(changelog)) {
  fail("content/changelog.ts newest entry must use extensionRelease.version");
}

if (!privacyPage.includes("extensionVersionLabel()")) {
  fail("app/privacy/page.tsx must render the update version from extensionVersionLabel()");
}

if (/privacyPage:\s*{[\s\S]*updated:\s*["'`]/.test(faDictionary)) {
  fail("content/dictionaries/fa.ts must not hard-code privacyPage.updated");
}

if (/آخرین به‌روزرسانی:\s*نسخهٔ?\s*[۰-۹0-9.]/.test(faDictionary)) {
  fail("content/dictionaries/fa.ts must not contain a hard-coded privacy version label");
}

if (!process.exitCode) {
  console.log(`release sync check passed: browser extension version ${version}`);
}
