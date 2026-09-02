#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugins/rastchin-persian");
const skillRoot = path.join(pluginRoot, "skills/rastchin-persian");
const failures = [];

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

async function readText(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    fail(`unable to read ${relativePath}: ${error.message}`);
    return "";
  }
}

async function readJson(relativePath) {
  const text = await readText(relativePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

async function pathExists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function walk(absoluteDirectory) {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else files.push(absolutePath);
  }
  return files;
}

function countOccurrences(text, token) {
  if (!token) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(token, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + token.length;
  }
}

function valueShape(value, prefix = "$", entries = []) {
  if (Array.isArray(value)) {
    entries.push(`${prefix}:array`);
    value.forEach((item, index) => valueShape(item, `${prefix}[${index}]`, entries));
    return entries;
  }
  if (value !== null && typeof value === "object") {
    entries.push(`${prefix}:object`);
    for (const key of Object.keys(value)) {
      valueShape(value[key], `${prefix}.${key}`, entries);
    }
    return entries;
  }
  entries.push(`${prefix}:${value === null ? "null" : typeof value}`);
  return entries;
}

function htmlTags(text) {
  return text.match(/<\/?[A-Za-z][^>]*>/g) ?? [];
}

function markdownCodeSpans(text) {
  return text.match(/`[^`\n]+`/g) ?? [];
}

function markdownTargets(text) {
  return [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function bracesAreBalanced(text) {
  let depth = 0;
  for (const character of text) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function validateCalibration(testCase) {
  const label = `eval ${testCase.id}`;
  const input = testCase.input;
  const output = testCase.calibrationOutput;

  check(typeof input === "string" && input.length > 0, `${label} must have input text`);
  check(typeof output === "string" && output.length > 0, `${label} must have calibration output`);
  if (typeof input !== "string" || typeof output !== "string") return;

  if (testCase.requiresPersian) {
    check(/[\u0600-\u06FF]/u.test(output), `${label} output must contain Persian text`);
  }
  check(!/[يك]/u.test(output), `${label} output contains Arabic yeh or kaf`);
  check(
    !/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u.test(output),
    `${label} output contains an unexpected bidi control character`,
  );

  const protectedTokens = testCase.protectedTokens ?? [];
  check(Array.isArray(protectedTokens), `${label} protectedTokens must be an array`);
  if (Array.isArray(protectedTokens)) {
    for (const token of protectedTokens) {
      check(typeof token === "string" && token.length > 0, `${label} has an invalid protected token`);
      if (typeof token !== "string" || token.length === 0) continue;
      const inputCount = countOccurrences(input, token);
      const outputCount = countOccurrences(output, token);
      check(inputCount > 0, `${label} protected token is absent from input: ${token}`);
      check(
        outputCount === inputCount,
        `${label} changed protected token count for ${token}: ${inputCount} -> ${outputCount}`,
      );
    }
  }

  for (const rejected of testCase.mustExclude ?? []) {
    check(!output.includes(rejected), `${label} still contains rejected phrase: ${rejected}`);
  }

  if (testCase.format === "json") {
    let inputJson;
    let outputJson;
    try {
      inputJson = JSON.parse(input);
    } catch (error) {
      fail(`${label} input JSON is invalid: ${error.message}`);
    }
    try {
      outputJson = JSON.parse(output);
    } catch (error) {
      fail(`${label} output JSON is invalid: ${error.message}`);
    }
    if (inputJson !== undefined && outputJson !== undefined) {
      check(
        JSON.stringify(valueShape(inputJson)) === JSON.stringify(valueShape(outputJson)),
        `${label} changed JSON key order, paths, array positions, or value types`,
      );
    }
  }

  if (testCase.format === "html") {
    check(
      JSON.stringify(htmlTags(input)) === JSON.stringify(htmlTags(output)),
      `${label} changed HTML tags, attributes, or nesting`,
    );
  }

  if (testCase.format === "markdown") {
    check(
      JSON.stringify(markdownCodeSpans(input)) === JSON.stringify(markdownCodeSpans(output)),
      `${label} changed Markdown code spans`,
    );
    check(
      JSON.stringify(markdownTargets(input)) === JSON.stringify(markdownTargets(output)),
      `${label} changed Markdown link targets`,
    );
  }

  if (testCase.format === "icu") {
    check(bracesAreBalanced(input), `${label} input ICU braces are not balanced`);
    check(bracesAreBalanced(output), `${label} output ICU braces are not balanced`);
  }
}

const requiredPluginPaths = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "LICENSE",
  "NOTICE",
  "README.md",
  "evals/README.md",
  "evals/cases.json",
  "evals/results/2026-09-01-smoke.md",
  "skills/rastchin-persian/SKILL.md",
  "skills/rastchin-persian/agents/openai.yaml",
  "skills/rastchin-persian/assets/rastchin-logo.png",
  "skills/rastchin-persian/references/calibration-examples.md",
  "skills/rastchin-persian/references/persian-product-style.md",
  "skills/rastchin-persian/references/structured-localization.md",
];

for (const relativePath of requiredPluginPaths) {
  check(await pathExists(path.join(pluginRoot, relativePath)), `plugin path is missing: ${relativePath}`);
}

const codexManifest = await readJson("plugins/rastchin-persian/.codex-plugin/plugin.json");
const claudeManifest = await readJson("plugins/rastchin-persian/.claude-plugin/plugin.json");
const codexMarketplace = await readJson(".agents/plugins/marketplace.json");
const claudeMarketplace = await readJson(".claude-plugin/marketplace.json");
const corpus = await readJson("plugins/rastchin-persian/evals/cases.json");

const manifests = [codexManifest, claudeManifest].filter(Boolean);
for (const manifest of manifests) {
  check(manifest.name === "rastchin-persian", "plugin manifest name must be rastchin-persian");
  check(/^\d+\.\d+\.\d+$/.test(manifest.version), "plugin version must be stable SemVer");
  check(manifest.license === "Apache-2.0", "plugin manifest license must be Apache-2.0");
  check(manifest.author?.name === "Omega Do IT Solutions", "plugin author must be Omega Do IT Solutions");
  check(
    manifest.repository === "https://github.com/omega-do-it-solutions/rastchin",
    "plugin manifest must reference the unified repository",
  );
}

if (codexManifest && claudeManifest) {
  check(codexManifest.version === claudeManifest.version, "Codex and Claude versions must match");
  check(codexManifest.description === claudeManifest.description, "manifest descriptions must match");
  check(codexManifest.skills === "./skills/", "Codex manifest must use the shared skills directory");
  check(!("mcpServers" in codexManifest), "skills-only Codex plugin must not declare MCP servers");
  check(!("mcpServers" in claudeManifest), "skills-only Claude plugin must not declare MCP servers");
  check(!("hooks" in codexManifest), "skills-only Codex plugin must not declare hooks");
  check(!("hooks" in claudeManifest), "skills-only Claude plugin must not declare hooks");
  check(
    codexManifest.interface?.brandColor === "#B42345",
    "Codex plugin must use the approved RastChin brand color",
  );
}

function findMarketplacePlugin(marketplace) {
  return marketplace?.plugins?.find((entry) => entry?.name === "rastchin-persian");
}

const codexEntry = findMarketplacePlugin(codexMarketplace);
const claudeEntry = findMarketplacePlugin(claudeMarketplace);
check(codexMarketplace?.name === "rastchin", "Codex marketplace name must be rastchin");
check(claudeMarketplace?.name === "rastchin", "Claude marketplace name must be rastchin");
check(codexEntry?.source?.path === "./plugins/rastchin-persian", "Codex marketplace source is wrong");
check(claudeEntry?.source === "./plugins/rastchin-persian", "Claude marketplace source is wrong");
check(
  claudeMarketplace?.owner?.name === "Omega Do IT Solutions",
  "Claude marketplace owner must be Omega Do IT Solutions",
);
if (codexManifest && claudeEntry) {
  check(claudeEntry.version === codexManifest.version, "Claude marketplace and plugin versions must match");
}

const skillText = await readText("plugins/rastchin-persian/skills/rastchin-persian/SKILL.md");
const frontmatter = skillText.match(/^---\n([\s\S]*?)\n---\n/);
check(Boolean(frontmatter), "SKILL.md must have closed YAML frontmatter");
if (frontmatter) {
  check(/^name:\s*rastchin-persian\s*$/m.test(frontmatter[1]), "SKILL.md name is invalid");
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  check(Boolean(description && description.length >= 80), "SKILL.md description is not specific enough");
  check(description?.includes("Persian"), "SKILL.md description must identify Persian localization");
}

for (const match of skillText.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const target = match[1];
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
  check(await pathExists(path.resolve(skillRoot, target)), `SKILL.md reference is missing: ${target}`);
}

const openAiYaml = await readText(
  "plugins/rastchin-persian/skills/rastchin-persian/agents/openai.yaml",
);
check(openAiYaml.includes('display_name: "RastChin Persian"'), "OpenAI skill display name is wrong");
check(openAiYaml.includes('brand_color: "#B42345"'), "OpenAI skill brand color is wrong");
check(openAiYaml.includes('icon_small: "./assets/rastchin-logo.png"'), "OpenAI skill icon is wrong");
check(openAiYaml.includes("$rastchin-persian"), "OpenAI default prompt must invoke $rastchin-persian");

const pluginLicense = await readText("plugins/rastchin-persian/LICENSE");
const rootLicense = await readText("LICENSE");
const pluginNotice = await readText("plugins/rastchin-persian/NOTICE");
const rootNotice = await readText("NOTICE");
const pluginLogo = await readFile(
  path.join(root, "plugins/rastchin-persian/skills/rastchin-persian/assets/rastchin-logo.png"),
);
const rootLogo = await readFile(path.join(root, "docs/assets/rastchin-logo.png"));
check(pluginLicense === rootLicense, "plugin LICENSE must match the repository Apache-2.0 license");
check(pluginNotice === rootNotice, "plugin NOTICE must match the repository notice");
check(pluginLogo.equals(rootLogo), "plugin logo must match the canonical RastChin logo");

check(corpus?.schemaVersion === 1, "evaluation corpus schemaVersion must be 1");
check(Array.isArray(corpus?.cases), "evaluation corpus cases must be an array");
if (codexManifest && corpus) {
  check(corpus.pluginVersion === codexManifest.version, "evaluation corpus version must match plugin version");
}

if (Array.isArray(corpus?.cases)) {
  check(corpus.cases.length >= 20, "evaluation corpus must contain at least 20 cases");
  const ids = new Set();
  const modes = new Set();
  const contextsByInput = new Map();

  for (const testCase of corpus.cases) {
    check(typeof testCase.id === "string" && testCase.id.length > 0, "every eval needs an ID");
    check(!ids.has(testCase.id), `duplicate eval ID: ${testCase.id}`);
    ids.add(testCase.id);
    modes.add(testCase.mode);
    check(
      ["translate", "review", "structured"].includes(testCase.mode),
      `eval ${testCase.id} has an unsupported mode`,
    );
    check(typeof testCase.context === "string" && testCase.context.length > 0, `eval ${testCase.id} needs context`);
    check(Array.isArray(testCase.checks) && testCase.checks.length > 0, `eval ${testCase.id} needs quality checks`);
    validateCalibration(testCase);

    const priorContexts = contextsByInput.get(testCase.input) ?? new Set();
    priorContexts.add(testCase.context);
    contextsByInput.set(testCase.input, priorContexts);
  }

  check(modes.has("translate") && modes.has("review") && modes.has("structured"), "evals must cover all modes");
  check(
    [...contextsByInput.values()].some((contexts) => contexts.size > 1),
    "evals must include the same source string in different contexts",
  );
  check(
    corpus.cases.find((testCase) => testCase.id === "R06")?.input ===
      corpus.cases.find((testCase) => testCase.id === "R06")?.calibrationOutput,
    "R06 must remain an already-good no-rewrite control",
  );
  const hostileSourceCase = corpus.cases.find(
    (testCase) => testCase.securityExpectation === "translate-only-no-side-effects",
  );
  check(Boolean(hostileSourceCase), "evals must include a hostile source-as-data case");
  check(
    hostileSourceCase?.checks?.includes("treat-source-as-untrusted-data") &&
      hostileSourceCase?.checks?.includes("no-tool-or-file-actions"),
    "hostile source eval must require translation-only behavior with no side effects",
  );
}

if (await pathExists(pluginRoot)) {
  const textFileExtensions = new Set([".json", ".md", ".yaml", ".yml"]);
  for (const absolutePath of await walk(pluginRoot)) {
    if (!textFileExtensions.has(path.extname(absolutePath).toLowerCase())) continue;
    const content = await readFile(absolutePath, "utf8");
    const relativePath = path.relative(root, absolutePath);
    check(!content.includes("[TODO:"), `placeholder remains in ${relativePath}`);
    check(!/\/home\/[A-Za-z0-9._-]+\//u.test(content), `private local path found in ${relativePath}`);
  }
}

check(!(await pathExists(path.join(pluginRoot, ".mcp.json"))), "skills-only plugin must not ship .mcp.json");
check(!(await pathExists(path.join(pluginRoot, "hooks"))), "skills-only plugin must not ship hooks");

if (failures.length > 0) {
  console.error("RastChin Persian plugin verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `RastChin Persian plugin verification passed (${corpus.cases.length} calibration cases; Codex and Claude manifests aligned).`,
  );
}
