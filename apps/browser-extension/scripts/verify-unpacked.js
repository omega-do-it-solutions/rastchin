#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(APP_ROOT, 'unpacked');
const MANIFEST_PATH = path.join(OUT, 'manifest.json');

function check(filePath, label) {
    if (!fs.existsSync(filePath)) {
        console.error(`  MISSING  ${label || filePath}`);
        return false;
    }
    return true;
}

function outPath(relativePath) {
    return path.join(OUT, relativePath);
}

function repoPath(relativePath) {
    return path.join(APP_ROOT, relativePath);
}

function walkFiles(rootDir) {
    const files = [];
    function visit(dir) {
        for (const name of fs.readdirSync(dir)) {
            if (name === '.DS_Store') continue;
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) visit(full);
            else if (stat.isFile()) files.push(full);
        }
    }
    visit(rootDir);
    return files;
}

function sameBytes(left, right) {
    return Buffer.compare(fs.readFileSync(left), fs.readFileSync(right)) === 0;
}

let allOk = true;

// --- manifest itself ---
if (!check(MANIFEST_PATH, 'manifest.json')) {
    console.error('unpacked/manifest.json not found — run pnpm run build:unpacked first');
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const missing = [];
const stale = [];

function expectFile(rel) {
    const full = outPath(rel);
    if (!fs.existsSync(full)) {
        missing.push(rel);
    }
}

// icons
for (const rel of Object.values(manifest.icons || {})) expectFile(rel);

// action default_icon
for (const rel of Object.values(manifest.action?.default_icon || {})) expectFile(rel);

// action default_popup
if (manifest.action?.default_popup) expectFile(manifest.action.default_popup);

// background service_worker
if (manifest.background?.service_worker) expectFile(manifest.background.service_worker);

// side_panel default_path
if (manifest.side_panel?.default_path) expectFile(manifest.side_panel.default_path);

// content_scripts js files
for (const entry of manifest.content_scripts || []) {
    for (const rel of entry.js || []) expectFile(rel);
}

// web_accessible_resources — for globs, verify parent dir is non-empty
for (const entry of manifest.web_accessible_resources || []) {
    for (const rel of entry.resources || []) {
        if (rel.includes('*')) {
            const dir = outPath(rel.replace(/\/\*.*$/, ''));
            if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
                missing.push(rel + ' (parent dir missing or empty)');
            }
        } else {
            expectFile(rel);
        }
    }
}

// key assets referenced by popup/side-panel HTML (not in manifest directly)
expectFile('src/assets/icons/rastchin-logo.png');
expectFile('src/assets/fonts/Vazirmatn[wght].ttf');
expectFile('src/assets/fonts/OFL.txt');
for (const rel of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) expectFile(rel);
const iconsDir = path.join(OUT, 'src', 'assets', 'icons');
if (!fs.existsSync(iconsDir) || fs.readdirSync(iconsDir).length === 0) {
    missing.push('src/assets/icons/ (directory missing or empty)');
}

// Release parity: build-unpacked copies manifest.json and src/ verbatim. Since
// unpacked/ is ignored, a stale artifact can otherwise pass path-only checks.
if (fs.existsSync(repoPath('manifest.json')) && !sameBytes(repoPath('manifest.json'), MANIFEST_PATH)) {
    stale.push('manifest.json');
}

const sourceRoot = repoPath('src');
if (fs.existsSync(sourceRoot)) {
    for (const sourceFile of walkFiles(sourceRoot)) {
        const rel = path.relative(APP_ROOT, sourceFile);
        const builtFile = outPath(rel);
        if (!fs.existsSync(builtFile)) {
            missing.push(rel);
        } else if (!sameBytes(sourceFile, builtFile)) {
            stale.push(rel);
        }
    }
}

for (const rel of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    const sourceFile = repoPath(rel);
    const builtFile = outPath(rel);
    if (fs.existsSync(sourceFile) && fs.existsSync(builtFile) && !sameBytes(sourceFile, builtFile)) {
        stale.push(rel);
    }
}

if (missing.length > 0) {
    console.error(`\n✗ verify-unpacked FAILED — ${missing.length} path(s) missing:\n`);
    for (const m of missing) console.error('  ' + m);
    allOk = false;
}

if (stale.length > 0) {
    console.error(`\n✗ verify-unpacked FAILED — ${stale.length} stale file(s); run pnpm run build:unpacked:\n`);
    for (const s of stale) console.error('  ' + s);
    allOk = false;
}

if (!allOk) process.exit(1);

console.log('✓ verify-unpacked passed — manifest paths present and unpacked/ matches source');
