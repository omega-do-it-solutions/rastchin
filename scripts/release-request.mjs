#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCurrentReleaseMetadata,
  getReleaseMetadata,
  releaseTrackNames,
  validateReleaseSummary,
} from "./release-metadata.mjs";

const commitPattern = /^[0-9a-f]{40}$/i;
const macosReleaseModes = new Set(["ad-hoc", "signed"]);

function validateMacosReleaseMode(mode) {
  if (!macosReleaseModes.has(mode)) {
    throw new Error(`macOS release mode must be ad-hoc or signed; received ${JSON.stringify(mode)}.`);
  }
  return mode;
}

function normalizeCommitSubject(subject) {
  return subject.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
}

export function selectAutomaticRelease({
  changedPaths,
  currentMetadata,
  previousVersions,
  commitSubject,
  macosMode = "ad-hoc",
}) {
  const changedPathSet = new Set(changedPaths);
  const candidates = releaseTrackNames.filter((track) => {
    const metadata = currentMetadata[track];
    const ownsChangedVersionSource = metadata.sourceVersions.some((source) =>
      changedPathSet.has(source.relativePath),
    );
    return ownsChangedVersionSource && previousVersions[track] !== metadata.version;
  });

  if (candidates.length === 0) {
    return {
      shouldRelease: false,
      reason: "No product version changed; GitHub Release publication is skipped.",
    };
  }

  if (candidates.length > 1) {
    throw new Error(
      `More than one release track changed (${candidates.join(", ")}). Split independent version bumps into separate merges or dispatch each track manually.`,
    );
  }

  const metadata = currentMetadata[candidates[0]];
  const subject = normalizeCommitSubject(commitSubject) || "به‌روزرسانی نسخه در شاخهٔ main";
  return {
    shouldRelease: true,
    ...metadata,
    summary: validateReleaseSummary(`انتشار خودکار نسخهٔ ${metadata.version}: ${subject}`),
    prerelease: false,
    macosMode: validateMacosReleaseMode(macosMode),
  };
}

function git(repositoryRoot, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readPreviousVersion(repositoryRoot, revision, metadata) {
  const source = metadata.sourceVersions[0];
  let manifestSource;
  try {
    manifestSource = git(repositoryRoot, ["show", `${revision}:${source.relativePath}`]);
  } catch (error) {
    if (error?.status === 128) return undefined;
    throw error;
  }

  const manifest = JSON.parse(manifestSource);
  return source.fieldPath
    .split(".")
    .reduce((current, key) => current?.[key], manifest);
}

function releaseCommitSubject(repositoryRoot, revision) {
  const commitAndParents = git(repositoryRoot, ["rev-list", "--parents", "-n", "1", revision]).split(
    /\s+/,
  );
  const subjectRevision = commitAndParents.length > 2 ? commitAndParents[2] : revision;
  return git(repositoryRoot, ["log", "-1", "--format=%s", subjectRevision]);
}

async function resolveAutomaticRequest(environment, repositoryRoot) {
  const before = environment.BEFORE_SHA;
  const after = environment.AFTER_SHA;
  if (!commitPattern.test(before ?? "") || /^0+$/.test(before)) {
    throw new Error(`Automatic release requires a valid previous main commit; received ${before}.`);
  }
  if (!commitPattern.test(after ?? "") || /^0+$/.test(after)) {
    throw new Error(`Automatic release requires a valid current main commit; received ${after}.`);
  }

  const changedPaths = git(repositoryRoot, [
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    before,
    after,
  ])
    .split("\n")
    .filter(Boolean);
  const currentMetadata = {};
  const previousVersions = {};

  for (const track of releaseTrackNames) {
    const metadata = await getCurrentReleaseMetadata({ repositoryRoot, track });
    currentMetadata[track] = metadata;
    previousVersions[track] = readPreviousVersion(repositoryRoot, before, metadata);
  }

  return selectAutomaticRelease({
    changedPaths,
    currentMetadata,
    previousVersions,
    commitSubject: releaseCommitSubject(repositoryRoot, after),
    macosMode: environment.AUTO_MACOS_RELEASE_MODE || "ad-hoc",
  });
}

async function resolveManualRequest(environment, repositoryRoot) {
  const metadata = await getReleaseMetadata({
    repositoryRoot,
    track: environment.MANUAL_TRACK,
    version: environment.MANUAL_VERSION,
  });
  return {
    shouldRelease: true,
    ...metadata,
    summary: validateReleaseSummary(environment.MANUAL_SUMMARY),
    prerelease: environment.MANUAL_PRERELEASE === "true",
    macosMode: validateMacosReleaseMode(environment.MANUAL_MACOS_RELEASE_MODE || "ad-hoc"),
  };
}

export async function resolveReleaseRequest(
  environment = process.env,
  repositoryRoot = process.cwd(),
) {
  if (environment.GITHUB_EVENT_NAME === "workflow_dispatch") {
    return resolveManualRequest(environment, repositoryRoot);
  }
  if (environment.GITHUB_EVENT_NAME === "push") {
    return resolveAutomaticRequest(environment, repositoryRoot);
  }
  throw new Error(`Unsupported release event ${JSON.stringify(environment.GITHUB_EVENT_NAME)}.`);
}

async function writeGitHubOutputs(outputPath, request) {
  const output = request.shouldRelease
    ? [
        "should_release=true",
        `track=${request.track}`,
        `version=${request.version}`,
        `tag=${request.tag}`,
        `title=${request.title}`,
        `summary=${request.summary}`,
        `prerelease=${request.prerelease}`,
        `macos_mode=${request.macosMode}`,
      ]
    : ["should_release=false", `reason=${request.reason}`];
  await appendFile(outputPath, `${output.join("\n")}\n`, "utf8");
}

async function runCli() {
  const request = await resolveReleaseRequest();
  if (!process.env.GITHUB_OUTPUT) {
    throw new Error("GITHUB_OUTPUT is required when resolving a release request.");
  }
  await writeGitHubOutputs(process.env.GITHUB_OUTPUT, request);
  console.log(request.shouldRelease ? `Release requested: ${request.tag}` : request.reason);
}

const invokedAsScript = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedAsScript) {
  runCli().catch((error) => {
    console.error(`Release request failed: ${error.message}`);
    process.exitCode = 1;
  });
}
