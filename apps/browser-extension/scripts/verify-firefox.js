#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    FIREFOX_EXTENSION_ID,
    FIREFOX_MIN_VERSION,
    createFirefoxManifest
} = require('./create-firefox-manifest.js');

const APP_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(APP_ROOT, 'unpacked-firefox');
const SOURCE_MANIFEST_PATH = path.join(APP_ROOT, 'manifest.json');
const BUILT_MANIFEST_PATH = path.join(OUT, 'manifest.json');
const failures = [];

function fail(message) {
    failures.push(message);
}

function walkFiles(rootDir) {
    const files = [];
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        if (entry.name === '.DS_Store') continue;
        const absolutePath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(absolutePath));
        else if (entry.isFile()) files.push(absolutePath);
    }
    return files;
}

function expectFile(relativePath, label = relativePath) {
    if (!relativePath || !fs.existsSync(path.join(OUT, relativePath))) {
        fail(`missing ${label}`);
    }
}

if (!fs.existsSync(BUILT_MANIFEST_PATH)) {
    console.error('✗ Firefox build is missing — run pnpm run build:firefox first');
    process.exit(1);
}

const sourceManifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(BUILT_MANIFEST_PATH, 'utf8'));
const expectedManifest = createFirefoxManifest(sourceManifest);

if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    fail('manifest.json does not match the deterministic Firefox transform');
}

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== sourceManifest.version) fail('Firefox and Chrome versions must match');
if (manifest.background?.scripts?.length !== 1) fail('background.scripts must contain one entry');
if (manifest.background?.service_worker) fail('background.service_worker is unsupported in Firefox');
if (manifest.side_panel) fail('Chrome side_panel key must not ship in Firefox');
if ((manifest.permissions || []).includes('sidePanel')) fail('Chrome sidePanel permission must not ship in Firefox');
if (manifest.action?.default_popup) fail('Firefox action popup must be removed so toolbar clicks open the sidebar');
if (manifest.sidebar_action?.open_at_install !== false) fail('Firefox sidebar must not auto-open on install');
if (manifest.browser_specific_settings?.gecko?.id !== FIREFOX_EXTENSION_ID) fail('Firefox extension ID is missing or changed');
if (manifest.browser_specific_settings?.gecko?.strict_min_version !== FIREFOX_MIN_VERSION) fail('Firefox minimum version is missing or changed');
if (JSON.stringify(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required) !== JSON.stringify(['none'])) {
    fail('Firefox no-data-collection declaration is missing');
}

for (const relativePath of Object.values(manifest.icons || {})) expectFile(relativePath);
for (const relativePath of Object.values(manifest.action?.default_icon || {})) expectFile(relativePath);
for (const relativePath of Object.values(manifest.sidebar_action?.default_icon || {})) expectFile(relativePath);
expectFile(manifest.sidebar_action?.default_panel, 'sidebar_action.default_panel');
for (const relativePath of manifest.background?.scripts || []) expectFile(relativePath);
for (const entry of manifest.content_scripts || []) {
    for (const relativePath of entry.js || []) expectFile(relativePath);
}

for (const sourceFile of walkFiles(path.join(APP_ROOT, 'src'))) {
    const relativePath = path.relative(APP_ROOT, sourceFile);
    const builtFile = path.join(OUT, relativePath);
    if (!fs.existsSync(builtFile)) {
        fail(`source file missing from Firefox build: ${relativePath}`);
    } else if (Buffer.compare(fs.readFileSync(sourceFile), fs.readFileSync(builtFile)) !== 0) {
        fail(`stale Firefox build file: ${relativePath}`);
    }
}

for (const legalFile of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    const sourceFile = path.join(APP_ROOT, legalFile);
    const builtFile = path.join(OUT, legalFile);
    if (!fs.existsSync(builtFile)) fail(`legal file missing from Firefox build: ${legalFile}`);
    else if (Buffer.compare(fs.readFileSync(sourceFile), fs.readFileSync(builtFile)) !== 0) {
        fail(`stale Firefox legal file: ${legalFile}`);
    }
}

if (failures.length > 0) {
    console.error(`\n✗ verify-firefox FAILED — ${failures.length} problem(s):\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
}

console.log(`✓ verify-firefox passed — Firefox ${FIREFOX_MIN_VERSION}+ manifest and source parity verified`);
