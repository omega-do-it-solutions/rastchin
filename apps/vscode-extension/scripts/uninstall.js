const path = require('path');

const patcher = require('../src/patcher');

function main(options = {}) {
  // The hook runs from the installed RastChin package. Its parent directory is
  // the VS Code extensions root, which also contains Claude Code and Codex.
  const extensionRoot = path.resolve(__dirname, '..');
  const extensionsRoot = options.extensionsRoot || path.dirname(extensionRoot);
  const result = patcher.restoreAll({ extensionsRoot, includeClaude: true, includeCodex: true });
  if (!options.quiet) {
    for (const message of result.messages || []) process.stdout.write(`${message}\n`);
  }
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`RastChin uninstall restore failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main };
