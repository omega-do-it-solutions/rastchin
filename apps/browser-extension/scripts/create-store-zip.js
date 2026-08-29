#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');

const sourceDir = path.resolve(process.argv[2] || 'unpacked');
const outputPath = path.resolve(process.argv[3] || 'dist/rastchin-chrome-web-store.zip');
const fixedTimestamp = new Date('1980-01-01T00:00:00.000Z');
const entries = {};

function fail(message) {
    console.error(`✗ create-store-zip FAILED — ${message}`);
    process.exit(1);
}

function collectFiles(directory, relativeDirectory = '') {
    const directoryEntries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of directoryEntries) {
        if (entry.name === '.DS_Store' || entry.name === '__MACOSX') continue;

        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.posix.join(relativeDirectory, entry.name);

        if (entry.isSymbolicLink()) {
            fail(`symbolic links are not allowed in store packages: ${relativePath}`);
        }
        if (entry.isDirectory()) {
            collectFiles(absolutePath, relativePath);
            continue;
        }
        if (!entry.isFile()) {
            fail(`unsupported filesystem entry: ${relativePath}`);
        }

        entries[relativePath] = [
            new Uint8Array(fs.readFileSync(absolutePath)),
            { mtime: fixedTimestamp },
        ];
    }
}

if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    fail(`source directory not found: ${sourceDir}`);
}

collectFiles(sourceDir);
if (Object.keys(entries).length === 0) fail('source directory is empty');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(zipSync(entries, { level: 9 })));

console.log(`✓ Created store ZIP with ${Object.keys(entries).length} file(s): ${outputPath}`);
