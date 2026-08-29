'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const popupSource = fs.readFileSync(path.join(__dirname, '..', 'src/ui/popup/popup.js'), 'utf8');
const elements = new Map();
const listeners = {};
const storageChanges = [];
const writes = [];
const createdTabs = [];
const stored = { extensionEnabled: true, chatgptEnabled: false, youtubeEnabled: false };

function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      checked: true,
      dataset: {},
      textContent: '',
      addEventListener(type, listener) {
        listeners[`${id}:${type}`] = listener;
      }
    });
  }
  return elements.get(id);
}

const platforms = {
  classList: { add() {}, remove() {} },
  querySelectorAll() { return []; },
  querySelector() { return null; }
};

const context = {
  URL,
  console,
  document: {
    addEventListener(type, listener) {
      listeners[`document:${type}`] = listener;
    },
    getElementById: element,
    querySelector(selector) {
      return selector === '.platforms' ? platforms : null;
    }
  },
  chrome: {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: 'test' }),
      getURL: value => value
    },
    tabs: {
      query(_query, callback) {
        callback([{ url: 'https://chatgpt.com/c/test' }]);
      },
      create(tab) {
        createdTabs.push(tab);
      }
    },
    storage: {
      sync: {
        get(_keys, callback) {
          callback({ ...stored });
        },
        set(value) {
          writes.push(value);
          Object.assign(stored, value);
        }
      },
      onChanged: {
        addListener(listener) {
          storageChanges.push(listener);
        }
      }
    }
  }
};

vm.runInNewContext(popupSource, context, { filename: 'popup.js' });
listeners['document:DOMContentLoaded']();

function check(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

check('disabled current platform is reflected in popup toggle', element('extensionToggle').checked, false);
check('disabled current platform is reflected in popup mode', element('extensionMode').textContent, 'غیرفعال');
check('total platform count is dynamic', element('totalPlatformCount').textContent, '20');
check('active platform count reflects settings', element('activePlatformCount').textContent, '18');

element('extensionToggle').checked = true;
listeners['extensionToggle:change']({ target: element('extensionToggle') });
check('popup writes the current platform key', JSON.stringify(writes.at(-1)), JSON.stringify({ chatgptEnabled: true }));
check('active count updates after popup toggle', element('activePlatformCount').textContent, '19');

storageChanges[0]({ claudeEnabled: { newValue: false } }, 'sync');
check('active count updates after external settings change', element('activePlatformCount').textContent, '18');

storageChanges[0]({ extensionEnabled: { newValue: false } }, 'sync');
check('legacy global disable is reflected in current-site state', element('extensionToggle').checked, false);
check('legacy global disable makes effective active count zero', element('activePlatformCount').textContent, '0');

element('extensionToggle').checked = true;
listeners['extensionToggle:change']({ target: element('extensionToggle') });
check(
  'enabling current site reopens the legacy global gate',
  JSON.stringify(writes.at(-1)),
  JSON.stringify({ chatgptEnabled: true, extensionEnabled: true })
);
check('active count returns after reopening global gate', element('activePlatformCount').textContent, '18');

listeners['managePlatforms:click']();
check('settings button opens the side-panel page', createdTabs.at(-1).url, 'src/ui/side-panel/side-panel.html');

console.log('ALL PASS (popup state sync)');
