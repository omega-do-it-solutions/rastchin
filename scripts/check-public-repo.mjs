#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "ready-to-upload",
  "release-artifacts",
  "unpacked",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".php",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const requiredPaths = [
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "RELEASING.md",
  "SECURITY.md",
  "SUPPORT.md",
  "TRADEMARK.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/product.md",
  "docs/ai/architecture.md",
  "docs/assets/rastchin-logo.png",
  "apps/web/package.json",
  "apps/web/LICENSE",
  "apps/web/NOTICE",
  "apps/web/THIRD_PARTY_NOTICES.md",
  "apps/web/scripts/copy-legal-files.mjs",
  "apps/browser-extension/manifest.json",
  "apps/browser-extension/package.json",
  "apps/browser-extension/LICENSE",
  "apps/browser-extension/NOTICE",
  "apps/browser-extension/THIRD_PARTY_NOTICES.md",
  "apps/vscode-extension/package.json",
  "apps/vscode-extension/LICENSE",
  "apps/vscode-extension/NOTICE",
  "apps/vscode-extension/THIRD_PARTY_NOTICES.md",
  "apps/desktop-integrator/package.json",
  "apps/desktop-integrator/LICENSE",
  "apps/desktop-integrator/NOTICE",
  "apps/desktop-integrator/THIRD_PARTY_NOTICES.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/documentation.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/support_request.yml",
  ".github/pull_request_template.md",
  ".github/workflows/ci.yml",
  ".github/workflows/package-browser.yml",
  ".github/workflows/package-desktop.yml",
  ".github/workflows/package-vscode.yml",
  ".github/workflows/release-desktop-macos.yml",
];

const forbiddenPaths = [
  ".env.example",
  ".github/CODEOWNERS",
  "apps/.gitkeep",
  "compose.yaml",
  "docker",
  "scripts/.gitkeep",
];

const forbiddenFileNames = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
]);

function fail(message) {
  failures.push(message);
}

async function exists(relativePath) {
  try {
    await lstat(path.join(root, relativePath));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

async function walk(relativeDirectory = "") {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (relativePath === ".git") continue;
      if (entry.name === ".git") {
        fail(`nested Git metadata found at ${relativePath}`);
        continue;
      }
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...(await walk(relativePath)));
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

for (const requiredPath of requiredPaths) {
  if (!(await exists(requiredPath))) fail(`required path is missing: ${requiredPath}`);
}

for (const forbiddenPath of forbiddenPaths) {
  if (await exists(forbiddenPath)) fail(`obsolete template path must be absent: ${forbiddenPath}`);
}

const rootPackage = await readJson("package.json");
if (rootPackage) {
  if (rootPackage.name !== "rastchin") fail("root package name must be rastchin");
  if (rootPackage.private !== true) fail("root package must remain private");
  if (rootPackage.license !== "Apache-2.0") fail("root package license must be Apache-2.0");
  if (rootPackage.packageManager !== "pnpm@11.14.0") {
    fail("root packageManager must be pnpm@11.14.0");
  }
}

const appPackages = [
  ["apps/web/package.json", "apps/web"],
  ["apps/browser-extension/package.json", "apps/browser-extension"],
  ["apps/vscode-extension/package.json", "apps/vscode-extension"],
  ["apps/desktop-integrator/package.json", "apps/desktop-integrator"],
];

for (const [manifestPath, expectedDirectory] of appPackages) {
  const manifest = await readJson(manifestPath);
  if (!manifest) continue;
  if (manifest.license !== "Apache-2.0") {
    fail(`${manifestPath} license must be Apache-2.0`);
  }
  const repository = manifest.repository;
  const repositoryUrl = typeof repository === "string" ? repository : repository?.url;
  if (!repositoryUrl?.includes("omega-do-it-solutions/rastchin")) {
    fail(`${manifestPath} must reference the unified repository`);
  }
  if (typeof repository === "object" && repository.directory !== expectedDirectory) {
    fail(`${manifestPath} repository.directory must be ${expectedDirectory}`);
  }
  if (manifest.engines?.node !== rootPackage?.engines?.node) {
    fail(`${manifestPath} must use the root Node.js engine ${rootPackage?.engines?.node}`);
  }
}

const browserPackage = await readJson("apps/browser-extension/package.json");
const browserManifest = await readJson("apps/browser-extension/manifest.json");
if (browserPackage && browserManifest && browserPackage.version !== browserManifest.version) {
  fail("browser package and manifest versions are not synchronized");
}

try {
  const skillsTarget = await realpath(path.join(root, ".claude/skills"));
  const expectedTarget = await realpath(path.join(root, ".agents/skills"));
  if (skillsTarget !== expectedTarget) fail(".claude/skills does not resolve to .agents/skills");
} catch (error) {
  fail(`skill forwarding is invalid: ${error.message}`);
}

const files = await walk();
for (const relativePath of files) {
  if (forbiddenFileNames.has(path.basename(relativePath))) {
    fail(`competing lockfile found: ${relativePath}`);
  }
}

const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}\b/],
  ["SendGrid API key", /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
];
const forbiddenResidue = [
  ["private local macOS path", /\/Users\/(?:momikaeli|hesam)\//],
  ["private local Linux path", /\/home\/hesam\//],
  ["hardcoded legacy deployment host", /dedi3057\.your-server\.de/],
  ["hardcoded legacy deployment path", /\/usr\/home\/rastcs\/public_html/],
];

for (const relativePath of files) {
  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
  const content = await readFile(path.join(root, relativePath), "utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) fail(`${label} pattern found in ${relativePath}`);
  }
  for (const [label, pattern] of forbiddenResidue) {
    if (pattern.test(content)) fail(`${label} found in ${relativePath}`);
  }

  if (path.extname(relativePath).toLowerCase() !== ".md") continue;
  const markdownLinks = content.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g);
  for (const match of markdownLinks) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = target.split("#", 1)[0].split("?", 1)[0];
    if (!target) continue;

    let decodedTarget;
    try {
      decodedTarget = decodeURIComponent(target);
    } catch {
      fail(`invalid encoded Markdown link in ${relativePath}: ${target}`);
      continue;
    }

    const resolvedTarget = path.resolve(root, path.dirname(relativePath), decodedTarget);
    if (resolvedTarget !== root && !resolvedTarget.startsWith(`${root}${path.sep}`)) {
      fail(`Markdown link escapes the repository in ${relativePath}: ${target}`);
      continue;
    }

    try {
      await lstat(resolvedTarget);
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail(`broken Markdown link in ${relativePath}: ${target}`);
        continue;
      }
      throw error;
    }
  }
}

if (failures.length > 0) {
  console.error("Public repository verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Public repository verification passed (${files.length} source files inspected).`);
}
