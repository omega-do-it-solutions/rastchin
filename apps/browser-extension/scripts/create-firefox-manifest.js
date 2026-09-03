#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIREFOX_EXTENSION_ID = 'rastchin@rastchin.tools';
const FIREFOX_MIN_VERSION = '142.0';

function fail(message) {
    throw new Error(`create-firefox-manifest: ${message}`);
}

function createFirefoxManifest(chromeManifest) {
    const manifest = structuredClone(chromeManifest);
    const backgroundScript = manifest.background?.service_worker;
    const sidebarPath = manifest.side_panel?.default_path;

    if (!backgroundScript) fail('Chrome manifest must declare background.service_worker');
    if (!sidebarPath) fail('Chrome manifest must declare side_panel.default_path');

    manifest.background = {
        scripts: [backgroundScript]
    };

    delete manifest.minimum_chrome_version;
    delete manifest.side_panel;

    manifest.permissions = (manifest.permissions || []).filter(
        (permission) => permission !== 'sidePanel'
    );

    manifest.sidebar_action = {
        default_icon: structuredClone(manifest.action?.default_icon || manifest.icons || {}),
        default_panel: sidebarPath,
        default_title: manifest.short_name || manifest.name,
        open_at_install: false
    };

    if (manifest.action) delete manifest.action.default_popup;

    manifest.browser_specific_settings = {
        gecko: {
            id: FIREFOX_EXTENSION_ID,
            strict_min_version: FIREFOX_MIN_VERSION,
            data_collection_permissions: {
                required: ['none']
            }
        }
    };

    return manifest;
}

function writeFirefoxManifest(sourcePath, outputPath) {
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const manifest = createFirefoxManifest(source);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (require.main === module) {
    const appRoot = path.resolve(__dirname, '..');
    const sourcePath = path.resolve(process.argv[2] || path.join(appRoot, 'manifest.json'));
    const outputPath = path.resolve(process.argv[3] || path.join(appRoot, 'unpacked-firefox', 'manifest.json'));

    try {
        writeFirefoxManifest(sourcePath, outputPath);
        console.log(`✓ Firefox manifest ready: ${outputPath}`);
    } catch (error) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    FIREFOX_EXTENSION_ID,
    FIREFOX_MIN_VERSION,
    createFirefoxManifest,
    writeFirefoxManifest
};
