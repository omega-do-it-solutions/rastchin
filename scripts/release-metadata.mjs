#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const releaseTracks = {
  browser: {
    label: "Browser extension",
    titleLabel: "🌐 Browser",
    tagPrefix: "browser-v",
    versionSources: [
      ["apps/browser-extension/package.json", "version"],
      ["apps/browser-extension/manifest.json", "version"],
    ],
    download: "دو فایل ZIP جداگانه برای Chrome Web Store و Firefox Add-ons پیوست شده‌اند.",
    installation:
      "این ZIPها خروجی بررسی‌شدهٔ ارسال به فروشگاه هستند. نصب عمومی Firefox باید از نسخهٔ امضاشدهٔ Mozilla و نصب Chrome باید از Chrome Web Store انجام شود.",
    limitations:
      "انتشار این Release فایل‌ها را به فروشگاه‌های Chrome یا Firefox ارسال نمی‌کند.",
    verification:
      "آزمون‌های افزونه، بررسی manifestها، ساخت هر دو درخت unpacked و بررسی محتوای هر دو ZIP اجرا شده‌اند.",
  },
  vscode: {
    label: "VS Code extension",
    titleLabel: "🧩 VS Code",
    tagPrefix: "vscode-v",
    versionSources: [["apps/vscode-extension/package.json", "version"]],
    download: "فایل VSIX بررسی‌شده به این Release پیوست شده است.",
    installation:
      "نصب دستی: فایل VSIX را دانلود کنید و در VS Code از Extensions: Install from VSIX استفاده کنید؛ یا دستور code --install-extension <file.vsix> را اجرا کنید.",
    limitations:
      "انتشار این Release افزونه را به Visual Studio Marketplace ارسال نمی‌کند.",
    verification:
      "آزمون‌های افزونه اجرا و فهرست محتوای بستهٔ VSIX در زمان ساخت بررسی شده است.",
  },
  desktop: {
    label: "Desktop Integrator",
    titleLabel: "🖥 Desktop",
    tagPrefix: "desktop-v",
    versionSources: [["apps/desktop-integrator/package.json", "version"]],
    download:
      "نصب‌کننده‌ها و بسته‌های Windows، macOS و Linux متناسب با سیستم‌عامل و معماری به این Release پیوست شده‌اند.",
    installation:
      "به‌روزرسانی خودکار فعال نیست؛ فایل مناسب را دانلود و به‌صورت دستی نصب کنید. بسته‌های عمومی macOS با Developer ID امضا، notarize و stapled شده‌اند.",
    limitations:
      "این مسیر هیچ فروشگاه سیستم‌عامل یا سرویس auto-update را منتشر یا فعال نمی‌کند. فایل‌های Windows فعلاً بدون امضای کد منتشر می‌شوند و ممکن است هشدار SmartScreen نشان دهند.",
    verification:
      "آزمون و سیاست ایمنی روی runnerهای بومی اجرا شده، نوع و تعداد خروجی‌ها بررسی شده و بسته‌های macOS امضا و notarize شده‌اند.",
  },
  agent: {
    label: "Persian agent plugin",
    titleLabel: "🤖 Persian Agent",
    tagPrefix: "agent-v",
    versionSources: [
      ["plugins/rastchin-persian/.codex-plugin/plugin.json", "version"],
      ["plugins/rastchin-persian/.claude-plugin/plugin.json", "version"],
      ["plugins/rastchin-persian/evals/cases.json", "pluginVersion"],
      [".claude-plugin/marketplace.json", "plugins.0.version"],
    ],
    download: "آرشیو قابل‌حمل افزونهٔ فارسی Codex/Claude به این Release پیوست شده است.",
    installation:
      "روش پیشنهادی نصب، marketplace همین مخزن است؛ آرشیو پیوست‌شده برای بررسی یا نصب دستی نگه‌داری می‌شود.",
    limitations:
      "این Release ثبت یا ارسال خودکار به فهرست‌های رسمی OpenAI یا Anthropic انجام نمی‌دهد.",
    verification:
      "هم‌خوانی manifestها، marketplaceها، مهارت مشترک، منابع و مجموعهٔ ارزیابی قطعی بررسی شده است.",
  },
};

const strictVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readJson(repositoryRoot, relativePath) {
  const source = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  return JSON.parse(source);
}

function readField(value, fieldPath) {
  return fieldPath.split(".").reduce((current, key) => current?.[key], value);
}

export const releaseTrackNames = Object.freeze(Object.keys(releaseTracks));

export async function getReleaseMetadata({
  repositoryRoot = defaultRepositoryRoot,
  track,
  version,
}) {
  const definition = releaseTracks[track];
  if (!definition) {
    throw new Error(
      `Unknown release track ${JSON.stringify(track)}. Expected one of: ${releaseTrackNames.join(", ")}.`,
    );
  }

  if (!strictVersionPattern.test(version ?? "")) {
    throw new Error(`Release version must use the numeric x.y.z form; received ${JSON.stringify(version)}.`);
  }

  const sourceVersions = [];
  for (const [relativePath, fieldPath] of definition.versionSources) {
    const manifest = await readJson(repositoryRoot, relativePath);
    const sourceVersion = readField(manifest, fieldPath);
    sourceVersions.push({ relativePath, fieldPath, version: sourceVersion });
  }

  const mismatches = sourceVersions.filter((source) => source.version !== version);
  if (mismatches.length > 0) {
    const details = sourceVersions
      .map((source) => `${source.relativePath}#${source.fieldPath}=${JSON.stringify(source.version)}`)
      .join(", ");
    throw new Error(`Requested ${track} version ${version} does not match release metadata: ${details}.`);
  }

  return {
    track,
    version,
    tag: `${definition.tagPrefix}${version}`,
    title: `${definition.titleLabel} · v${version}`,
    ...definition,
    sourceVersions,
  };
}

export async function getCurrentReleaseMetadata({
  repositoryRoot = defaultRepositoryRoot,
  track,
}) {
  const definition = releaseTracks[track];
  if (!definition) {
    throw new Error(
      `Unknown release track ${JSON.stringify(track)}. Expected one of: ${releaseTrackNames.join(", ")}.`,
    );
  }
  const firstManifest = await readJson(repositoryRoot, definition.versionSources[0][0]);
  const version = readField(firstManifest, definition.versionSources[0][1]);
  return getReleaseMetadata({ repositoryRoot, track, version });
}

export function validateReleaseSummary(summary) {
  const normalized = summary?.trim();
  if (!normalized) throw new Error("A user-visible release summary is required.");
  if (normalized.length > 2_000) {
    throw new Error("The user-visible release summary must be 2,000 characters or fewer.");
  }
  return normalized;
}

function desktopReleaseCopy(metadata, macosMode) {
  if (metadata.track !== "desktop") return metadata;
  if (macosMode === "signed") return metadata;
  if (macosMode !== "ad-hoc") {
    throw new Error(`macOS release mode must be ad-hoc or signed; received ${JSON.stringify(macosMode)}.`);
  }

  return {
    ...metadata,
    installation:
      "به‌روزرسانی خودکار فعال نیست؛ فایل مناسب را دانلود و به‌صورت دستی نصب کنید. بستهٔ macOS فعلاً ad-hoc است؛ در اولین اجرا ممکن است Gatekeeper هشدار توسعه‌دهندهٔ ناشناس نشان دهد و کاربر باید از روش رسمی Open Anyway در تنظیمات Privacy & Security استفاده کند.",
    limitations:
      "این مسیر هیچ فروشگاه سیستم‌عامل یا سرویس auto-update را منتشر یا فعال نمی‌کند. فایل‌های Windows فعلاً بدون امضای کد هستند و بستهٔ macOS نیز Developer ID و notarization اپل ندارد؛ بنابراین Windows SmartScreen و macOS Gatekeeper ممکن است هشدار نشان دهند.",
    verification:
      "آزمون و سیاست ایمنی روی runnerهای بومی اجرا شده، نوع و تعداد خروجی‌ها بررسی شده و امضای ad-hoc بسته‌های macOS پیش از انتشار تأیید شده است.",
  };
}

export function renderReleaseNotes(metadata, summary, { macosMode = "signed" } = {}) {
  const normalizedSummary = validateReleaseSummary(summary);
  const releaseCopy = desktopReleaseCopy(metadata, macosMode);
  return `## تغییرات این نسخه

${normalizedSummary}

## دریافت و نصب

${releaseCopy.download}

${releaseCopy.installation}

## محدودیت انتشار

${releaseCopy.limitations}

## حریم خصوصی و مجوزها

این Release سرویس، حساب، تله‌متری یا ارسال محتوای جدیدی به RastChin اضافه نمی‌کند. هر تغییر مجوز یا حریم خصوصی باید جداگانه در یادداشت‌های همان برنامه اعلام شود.

## راستی‌آزمایی

پیش از انتشار، \`pnpm check\`، بررسی مخزن عمومی و audit وابستگی‌ها اجرا شده‌اند. ${releaseCopy.verification}

فایل‌های \`SHA256SUMS-*.txt\` برای بررسی یکپارچگی همهٔ فایل‌های دانلودی کنار artifactها قرار دارند.

## بازگشت

artifact منتشرشده جایگزین نمی‌شود و tag جابه‌جا نخواهد شد. در صورت اشکال، این نسخه را غیرفعال یا حذف کنید، به نسخهٔ سالم قبلی برگردید و منتظر نسخهٔ اصلاحی جدید بمانید.
`;
}

async function verifyAllMetadata() {
  for (const track of releaseTrackNames) {
    const metadata = await getCurrentReleaseMetadata({ track });
    console.log(`${metadata.track}: ${metadata.tag}`);
  }
}

async function runCli() {
  const [track, version, ...extraArguments] = process.argv.slice(2);
  if (track === "--verify-all" && !version && extraArguments.length === 0) {
    await verifyAllMetadata();
    return;
  }

  if (!track || !version || extraArguments.length > 0) {
    throw new Error("Usage: node scripts/release-metadata.mjs <track> <version> | --verify-all");
  }

  const metadata = await getReleaseMetadata({ track, version });
  const summary = validateReleaseSummary(process.env.RELEASE_SUMMARY);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `track=${metadata.track}\nversion=${metadata.version}\ntag=${metadata.tag}\ntitle=${metadata.title}\n`,
      "utf8",
    );
  }

  if (process.env.RELEASE_NOTES_PATH) {
    await writeFile(
      process.env.RELEASE_NOTES_PATH,
      renderReleaseNotes(metadata, summary, {
        macosMode: process.env.MACOS_RELEASE_MODE || "signed",
      }),
      "utf8",
    );
  }

  console.log(`Release metadata verified: ${metadata.tag}`);
}

const invokedAsScript = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedAsScript) {
  runCli().catch((error) => {
    console.error(`Release metadata verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
