const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { atomicWriteFile, runFileTransaction } = require('../src/fileTransaction');

test('runFileTransaction restores existing files and removes new files after failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rastchin-transaction-'));
  const existing = path.join(dir, 'existing.txt');
  const created = path.join(dir, 'created.txt');
  fs.writeFileSync(existing, 'before', 'utf8');

  assert.throws(() => {
    runFileTransaction([existing, created], () => {
      atomicWriteFile(existing, 'after', 'utf8');
      atomicWriteFile(created, 'new', 'utf8');
      throw new Error('simulated final write failure');
    });
  }, /all target changes were rolled back/);

  assert.equal(fs.readFileSync(existing, 'utf8'), 'before');
  assert.equal(fs.existsSync(created), false);
});

test('runFileTransaction commits all writes on success', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rastchin-transaction-ok-'));
  const first = path.join(dir, 'first.txt');
  const second = path.join(dir, 'second.txt');
  fs.writeFileSync(first, 'one', 'utf8');

  const value = runFileTransaction([first, second], () => {
    atomicWriteFile(first, 'updated', 'utf8');
    atomicWriteFile(second, 'created', 'utf8');
    return 42;
  });

  assert.equal(value, 42);
  assert.equal(fs.readFileSync(first, 'utf8'), 'updated');
  assert.equal(fs.readFileSync(second, 'utf8'), 'created');
});
