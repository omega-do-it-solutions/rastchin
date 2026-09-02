const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PATCH_HEALTH_SNOOZE_KEY,
  PATCH_HEALTH_SNOOZE_MS,
  clearPatchHealthSnooze,
  patchHealthIsSnoozed,
  patchHealthIssue,
  snoozePatchHealth,
} = require('../src/patchHealth');

function target(overrides = {}) {
  return {
    key: 'codex',
    label: 'Codex / ChatGPT',
    version: '27.1.0',
    adapter: 'codex-webview-v1',
    compatible: true,
    actions: ['install webview loader', 'refresh Vazirmatn fonts'],
    issues: [],
    ...overrides,
  };
}

function stateStore(initial = new Map()) {
  return {
    values: initial,
    get(key) { return this.values.get(key); },
    update(key, value) {
      if (value === undefined) this.values.delete(key);
      else this.values.set(key, value);
      return Promise.resolve();
    },
  };
}

test('current targets produce no patch-health issue', () => {
  const issue = patchHealthIssue({
    targets: [target({ actions: [] })],
  });
  assert.equal(issue, null);
});

test('missing or stale compatible patches produce a repair issue', () => {
  const issue = patchHealthIssue({ targets: [target()] });

  assert.equal(issue.kind, 'repair');
  assert.match(issue.message, /Codex \/ ChatGPT v27\.1\.0/);
  assert.match(issue.message, /patches re-applied/);
  assert.match(issue.signature, /^repair\|/);
});

test('unsupported layouts produce diagnostics without a repair action', () => {
  const issue = patchHealthIssue({
    targets: [target({ compatible: false, actions: [], issues: ['head anchor missing'] })],
  });

  assert.equal(issue.kind, 'unsupported');
  assert.match(issue.message, /unsupported layout/);
  assert.match(issue.message, /No files were changed/);
});

test('Later snoozes only the exact target problem for 24 hours', async () => {
  const state = stateStore();
  const now = 1_000_000;
  const issue = patchHealthIssue({ targets: [target()] });
  await snoozePatchHealth(state, issue, now);

  assert.equal(patchHealthIsSnoozed(state, issue, now + PATCH_HEALTH_SNOOZE_MS - 1), true);
  assert.equal(patchHealthIsSnoozed(state, issue, now + PATCH_HEALTH_SNOOZE_MS), false);

  const updatedVersion = patchHealthIssue({
    targets: [target({ version: '27.2.0' })],
  });
  assert.equal(
    patchHealthIsSnoozed(state, updatedVersion, now + 1),
    false,
    'a new agent version bypasses the old snooze',
  );
});

test('a healthy verification clears the stored snooze', async () => {
  const state = stateStore(new Map([[PATCH_HEALTH_SNOOZE_KEY, { signature: 'old', until: Date.now() + 1000 }]]));
  await clearPatchHealthSnooze(state);
  assert.equal(state.get(PATCH_HEALTH_SNOOZE_KEY), undefined);
});
