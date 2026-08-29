const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (manifest.version !== pkg.version) {
    console.error(`Version mismatch: manifest.json=${manifest.version}, package.json=${pkg.version}`);
    process.exit(1);
}

console.log(`✓ version synchronized: ${manifest.version}`);
