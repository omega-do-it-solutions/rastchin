#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { strFromU8, unzipSync } = require('fflate');

const APP_ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));
const defaultZip = path.join(APP_ROOT, 'dist', `rastchin-v${pkg.version}-chrome-web-store.zip`);
const zipArgument = process.argv.slice(2).find((argument) => argument !== '--');
const zipPath = path.resolve(zipArgument || defaultZip);

function fail(message) {
    console.error(`✗ verify-store-zip FAILED — ${message}`);
    process.exit(1);
}

if (!fs.existsSync(zipPath)) {
    fail(`ZIP not found: ${zipPath}`);
}

let archive;
try {
    archive = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
} catch (error) {
    fail(`ZIP could not be read: ${error.message}`);
}

const files = Object.keys(archive).filter((entry) => !entry.endsWith('/'));

if (files.length === 0) fail('ZIP is empty');

const fileSet = new Set(files);
const requiredFiles = [
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.md',
    'manifest.json',
    'src/background/service-worker.js',
    'src/ui/popup/popup.html',
    'src/ui/popup/popup.js',
    'src/ui/side-panel/side-panel.html',
    'src/ui/side-panel/side-panel.js',
    'src/assets/icons/rastchin-logo.png',
    'src/assets/icons/thumbnails/icon16.png',
    'src/assets/icons/thumbnails/icon32.png',
    'src/assets/icons/thumbnails/icon48.png',
    'src/assets/icons/thumbnails/icon128.png',
    'src/assets/fonts/Vazirmatn[wght].ttf',
    'src/assets/fonts/OFL.txt',
];

const missing = requiredFiles.filter((entry) => !fileSet.has(entry));
if (missing.length > 0) {
    fail(`required file(s) missing:\n  ${missing.join('\n  ')}`);
}

const forbiddenPatterns = [
    /^src\/ui\/feedback\//,
    /^__MACOSX\//,
    /(^|\/)\.DS_Store$/,
    /^\.git\//,
    /^node_modules\//,
    /^dist\//,
    /^unpacked\//,
    /^\.claude\//,
    /^CLAUDE\.local\.md$/,
    /^\.env(?:\.|$)/,
    /\.zip$/i,
    /\.crx$/i,
    /\.pem$/i,
];

const forbidden = files.filter((entry) => forbiddenPatterns.some((pattern) => pattern.test(entry)));
if (forbidden.length > 0) {
    fail(`forbidden file(s) found:\n  ${forbidden.join('\n  ')}`);
}

const manifestText = strFromU8(archive['manifest.json']);
let manifest;
try {
    manifest = JSON.parse(manifestText);
} catch (error) {
    fail(`manifest.json is not valid JSON: ${error.message}`);
}

if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
}

if (manifest.version !== pkg.version) {
    fail(`version mismatch: ZIP manifest=${manifest.version}, package.json=${pkg.version}`);
}

if (manifest.key || manifest.update_url) {
    fail('manifest.json must not include key or update_url for Chrome Web Store upload');
}

if (manifest.options_page) {
    fail('manifest.json must not include a standalone options_page; settings live in the side panel');
}

const referencedFiles = new Set();

for (const rel of Object.values(manifest.icons || {})) referencedFiles.add(rel);
for (const rel of Object.values(manifest.action?.default_icon || {})) referencedFiles.add(rel);
if (manifest.action?.default_popup) referencedFiles.add(manifest.action.default_popup);
if (manifest.background?.service_worker) referencedFiles.add(manifest.background.service_worker);
if (manifest.side_panel?.default_path) referencedFiles.add(manifest.side_panel.default_path);
for (const entry of manifest.content_scripts || []) {
    for (const rel of entry.js || []) referencedFiles.add(rel);
}

const missingManifestRefs = [...referencedFiles].filter((rel) => !fileSet.has(rel));
if (missingManifestRefs.length > 0) {
    fail(`manifest referenced file(s) missing from ZIP:\n  ${missingManifestRefs.join('\n  ')}`);
}

const fontFiles = files.filter((entry) => /^src\/assets\/fonts\/.*\.(?:ttf|woff2?)$/i.test(entry));
if (fontFiles.length === 0) {
    fail('font assets are missing from ZIP');
}

const apacheLicense = strFromU8(archive.LICENSE);
if (!apacheLicense.includes('Apache License') || !apacheLicense.includes('Version 2.0')) {
    fail('LICENSE does not contain the Apache License 2.0 text');
}

const fontLicense = strFromU8(archive['src/assets/fonts/OFL.txt']);
if (!fontLicense.includes('SIL OPEN FONT LICENSE Version 1.1')) {
    fail('Vazirmatn OFL text is missing or incomplete');
}

console.log(`✓ verify-store-zip passed — ${files.length} file(s), version ${manifest.version}`);
