#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const IMAGE_DIR = path.join(REPO_ROOT, 'store', 'chrome', 'images');

function fail(message) {
    console.error(`✗ verify-store-assets FAILED — ${message}`);
    process.exit(1);
}

function pngSize(filePath) {
    const buffer = fs.readFileSync(filePath);
    const signature = buffer.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') {
        fail(`${path.relative(REPO_ROOT, filePath)} is not a PNG file`);
    }
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
    };
}

function expectSize(fileName, width, height) {
    const filePath = path.join(IMAGE_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        fail(`missing required asset: store/chrome/images/${fileName}`);
    }
    const size = pngSize(filePath);
    if (size.width !== width || size.height !== height) {
        fail(`${fileName} must be ${width}x${height}, got ${size.width}x${size.height}`);
    }
}

if (!fs.existsSync(IMAGE_DIR)) {
    fail('store/chrome/images/ does not exist');
}

const entries = fs.readdirSync(IMAGE_DIR);
const nonPng = entries.filter((entry) => !entry.endsWith('.png'));
if (nonPng.length > 0) {
    fail(`non-PNG file(s) found in store/chrome/images:\n  ${nonPng.join('\n  ')}`);
}

expectSize('promo-small-440x280.png', 440, 280);

const screenshots = entries
    .filter((entry) => /^screenshot-\d+-.*\.png$/.test(entry))
    .sort();

if (screenshots.length < 1 || screenshots.length > 5) {
    fail(`Chrome Web Store requires 1 to 5 screenshots, found ${screenshots.length}`);
}

for (const screenshot of screenshots) {
    const size = pngSize(path.join(IMAGE_DIR, screenshot));
    const validLarge = size.width === 1280 && size.height === 800;
    const validSmall = size.width === 640 && size.height === 400;
    if (!validLarge && !validSmall) {
        fail(`${screenshot} must be 1280x800 or 640x400, got ${size.width}x${size.height}`);
    }
}

const marquee = path.join(IMAGE_DIR, 'promo-marquee-1400x560.png');
if (fs.existsSync(marquee)) {
    const size = pngSize(marquee);
    if (size.width !== 1400 || size.height !== 560) {
        fail(`promo-marquee-1400x560.png must be 1400x560, got ${size.width}x${size.height}`);
    }
}

console.log(`✓ verify-store-assets passed — ${screenshots.length} screenshot(s), promo-small ready`);
