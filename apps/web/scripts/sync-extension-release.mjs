import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const files = {
  extensionRelease: resolve(appDir, "content/extension-release.ts"),
  changelog: resolve(appDir, "content/changelog.ts"),
};
const displayPaths = {
  extensionRelease: "content/extension-release.ts",
  changelog: "content/changelog.ts",
};
const defaultExtensionDir = resolve(appDir, "../browser-extension");

function parseArgs(argv) {
  const options = {
    extensionDir: process.env.RASTCHIN_EXTENSION_DIR || defaultExtensionDir,
    check: false,
    build: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--extension-dir") {
      options.extensionDir = resolve(argv[++i] || "");
    } else if (arg === "--check" || arg === "--dry-run") {
      options.check = true;
      options.build = false;
    } else if (arg === "--no-build") {
      options.build = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-extension-release.mjs [options]

Reads the browser extension directly from its sibling monorepo workspace.

Options:
  --extension-dir <path>  Browser extension workspace (default: ../browser-extension)
  --check, --dry-run      Report whether website release files are synchronized
  --no-build              Update release files without building the website
  --help, -h              Show this help
`);
}

function fail(message) {
  console.error(`release sync failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed`);
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`could not read JSON from ${path}: ${error.message}`);
  }
}

function readExtensionChangelog(extensionDir) {
  const path = resolve(extensionDir, "src/ui/shared/changelog-data.js");
  const source = readFileSync(path, "utf8");
  const context = { window: {} };

  try {
    runInNewContext(source, context, { timeout: 1000 });
  } catch (error) {
    fail(`could not evaluate ${path}: ${error.message}`);
  }

  const changelog = context.window.RASTCHIN_CHANGELOG;
  if (!Array.isArray(changelog) || changelog.length === 0) {
    fail("browser changelog-data.js must expose a non-empty window.RASTCHIN_CHANGELOG array");
  }

  return changelog;
}

function q(value) {
  return JSON.stringify(value);
}

function versionOf(entry) {
  if (typeof entry.version === "string" && entry.version !== "") {
    return entry.version;
  }

  if (typeof entry.tag === "string" && entry.tag.startsWith("v")) {
    return entry.tag.slice(1);
  }

  fail(`changelog entry "${entry.title || "untitled"}" has no version or v-prefixed tag`);
}

function entryToTs(entry, index) {
  if (typeof entry.title !== "string" || entry.title === "") {
    fail(`changelog entry ${index + 1} must have a title`);
  }

  if (!Array.isArray(entry.notes) || entry.notes.some((note) => typeof note !== "string")) {
    fail(`changelog entry ${entry.version || entry.tag || index + 1} must have string notes`);
  }

  const versionLine =
    index === 0
      ? "    version: extensionRelease.version,"
      : `    version: ${q(versionOf(entry))},`;
  const dateLine = index === 0 ? "\n    date: extensionRelease.syncedAt," : "";
  const notes = entry.notes.map((note) => `      ${q(note)},`).join("\n");

  return `  {
${versionLine}${dateLine}
    title: ${q(entry.title)},
    notes: [
${notes}
    ],
  }`;
}

function buildChangelogTs(changelog) {
  return `import { extensionRelease } from "./extension-release";
import type { ChangelogEntry } from "./types";

/**
 * User-facing release notes generated from the sibling browser-extension
 * workspace. Run \`pnpm sync:release\` after a browser extension release.
 */
export const changelog: ChangelogEntry[] = [
${changelog.map(entryToTs).join(",\n")}
];
`;
}

function updateExtensionReleaseTs(current, { version, syncedAt }) {
  let next = current;
  next = next.replace(/version:\s*"[^"]+"/, `version: "${version}"`);
  next = next.replace(/syncedAt:\s*"[^"]+"/, `syncedAt: "${syncedAt}"`);
  return next;
}

function fieldValue(source, field) {
  return source.match(new RegExp(`${field}:\\s*"([^"]+)"`))?.[1] || "";
}

function reportChange(path, current, next) {
  if (current === next) {
    console.log(`ok: ${path} is already synchronized`);
    return false;
  }

  console.log(`needs update: ${path}`);
  return true;
}

const options = parseArgs(process.argv.slice(2));

for (const requiredPath of [
  options.extensionDir,
  resolve(options.extensionDir, "manifest.json"),
  resolve(options.extensionDir, "package.json"),
  resolve(options.extensionDir, "src/ui/shared/changelog-data.js"),
]) {
  if (!existsSync(requiredPath)) {
    fail(`required browser extension path not found: ${requiredPath}`);
  }
}

const manifest = readJson(resolve(options.extensionDir, "manifest.json"));
const packageJson = readJson(resolve(options.extensionDir, "package.json"));
const version = manifest.version;

if (!version || version !== packageJson.version) {
  fail(`manifest/package version mismatch: manifest=${manifest.version}, package=${packageJson.version}`);
}

const changelog = readExtensionChangelog(options.extensionDir);
if (versionOf(changelog[0]) !== version) {
  fail(`newest browser changelog entry must match version ${version}, got ${versionOf(changelog[0])}`);
}

const currentRelease = readFileSync(files.extensionRelease, "utf8");
const currentChangelog = readFileSync(files.changelog, "utf8");
const currentVersion = fieldValue(currentRelease, "version");
const currentSyncedAt = fieldValue(currentRelease, "syncedAt");
const syncedAt = currentVersion === version && currentSyncedAt
  ? currentSyncedAt
  : new Date().toISOString().slice(0, 10);
const nextRelease = updateExtensionReleaseTs(currentRelease, { version, syncedAt });
const nextChangelog = buildChangelogTs(changelog);
const releaseChanged = reportChange(
  displayPaths.extensionRelease,
  currentRelease,
  nextRelease,
);
const changelogChanged = reportChange(displayPaths.changelog, currentChangelog, nextChangelog);

console.log(`browser workspace: v${version}`);

if (options.check) {
  process.exit(releaseChanged || changelogChanged ? 1 : 0);
}

if (releaseChanged) {
  writeFileSync(files.extensionRelease, nextRelease);
}

if (changelogChanged) {
  writeFileSync(files.changelog, nextChangelog);
}

if (options.build) {
  run("pnpm", ["build"]);
}
