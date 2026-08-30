const fs = require('fs');
const path = require('path');

function uniquePaths(filePaths) {
  return [...new Set(filePaths.filter(Boolean).map((filePath) => path.resolve(filePath)))];
}

function capture(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { exists: true, file: false };
    return { exists: true, file: true, content: fs.readFileSync(filePath), mode: stat.mode };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, file: false };
    throw error;
  }
}

function atomicWriteFile(filePath, content, encoding) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temporary = path.join(parent, `.${path.basename(filePath)}.rastchin-${token}.tmp`);
  let mode;
  try {
    try { mode = fs.statSync(filePath).mode; } catch { /* a new file uses Node's default mode */ }
    fs.writeFileSync(temporary, content, encoding);
    if (mode !== undefined) fs.chmodSync(temporary, mode);
    try {
      fs.renameSync(temporary, filePath);
    } catch (error) {
      // POSIX rename replaces atomically. Some Windows filesystems refuse to
      // replace an existing destination, so fall back to a copy; the surrounding
      // transaction still restores the snapshot if a later operation fails.
      if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code)) throw error;
      fs.copyFileSync(temporary, filePath);
      fs.unlinkSync(temporary);
    }
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw error;
  }
}

function restoreSnapshot(filePath, state) {
  if (!state.exists) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    return;
  }
  if (!state.file) return;
  atomicWriteFile(filePath, state.content);
  try { fs.chmodSync(filePath, state.mode); } catch { /* content restoration is primary */ }
}

// Executes one target patch as a transaction. Callers list every file they may
// touch (target files, backups, metadata and injected assets). If any write
// fails, all of those files are restored to their byte-for-byte pre-run state.
function runFileTransaction(filePaths, action) {
  const paths = uniquePaths(filePaths);
  const snapshots = new Map(paths.map((filePath) => [filePath, capture(filePath)]));
  try {
    return action();
  } catch (cause) {
    const rollbackErrors = [];
    for (const filePath of paths.slice().reverse()) {
      try {
        restoreSnapshot(filePath, snapshots.get(filePath));
      } catch (error) {
        rollbackErrors.push(`${filePath}: ${error.message}`);
      }
    }
    const error = new Error(
      rollbackErrors.length
        ? `${cause.message}; rollback also failed for ${rollbackErrors.join(', ')}`
        : `${cause.message}; all target changes were rolled back`,
    );
    error.cause = cause;
    error.rolledBack = rollbackErrors.length === 0;
    throw error;
  }
}

module.exports = {
  atomicWriteFile,
  runFileTransaction,
};
