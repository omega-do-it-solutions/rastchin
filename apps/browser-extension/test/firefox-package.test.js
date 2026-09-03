'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    FIREFOX_EXTENSION_ID,
    FIREFOX_MIN_VERSION,
    createFirefoxManifest
} = require('../scripts/create-firefox-manifest.js');

const appRoot = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(appRoot, 'manifest.json'), 'utf8'));
const original = structuredClone(source);
const firefox = createFirefoxManifest(source);

let failures = 0;
let total = 0;

function check(label, actual, expected) {
    total += 1;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures += 1;
        console.error(`FAIL  ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
    }
}

check('source manifest is not mutated', source, original);
check('Firefox remains Manifest V3', firefox.manifest_version, 3);
check('Firefox version matches Chrome', firefox.version, source.version);
check('Firefox background uses scripts', firefox.background, { scripts: [source.background.service_worker] });
check('Firefox removes minimum_chrome_version', 'minimum_chrome_version' in firefox, false);
check('Firefox removes side_panel', 'side_panel' in firefox, false);
check('Firefox removes sidePanel permission', firefox.permissions.includes('sidePanel'), false);
check('Firefox keeps tabs permission', firefox.permissions.includes('tabs'), true);
check('Firefox sidebar reuses the side-panel UI', firefox.sidebar_action.default_panel, source.side_panel.default_path);
check('Firefox sidebar does not auto-open on install', firefox.sidebar_action.open_at_install, false);
check('Firefox action popup is removed for sidebar toolbar behavior', 'default_popup' in firefox.action, false);
check('Firefox extension ID is stable', firefox.browser_specific_settings.gecko.id, FIREFOX_EXTENSION_ID);
check('Firefox minimum version is stable', firefox.browser_specific_settings.gecko.strict_min_version, FIREFOX_MIN_VERSION);
check('Firefox declares no data collection', firefox.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
check('content-script wiring is unchanged', firefox.content_scripts, source.content_scripts);
check('web-accessible resources are unchanged', firefox.web_accessible_resources, source.web_accessible_resources);

if (failures > 0) {
    console.error(`${failures} FAILURE(S) of ${total} assertions`);
    process.exit(1);
}

console.log(`ALL PASS (${total} assertions)`);
