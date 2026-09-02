const PATCH_HEALTH_SNOOZE_KEY = 'rastchin.patchHealthSnooze';
const PATCH_HEALTH_SNOOZE_MS = 24 * 60 * 60 * 1000;

function targetIdentity(target) {
  const actions = Array.isArray(target.actions) ? [...target.actions].sort() : [];
  const issues = Array.isArray(target.issues) ? [...target.issues].sort() : [];
  return [
    target.key || target.label || 'agent',
    target.version || 'unknown',
    target.adapter || 'unknown',
    target.compatible === false ? 'unsupported' : 'compatible',
    actions.join(','),
    issues.join(','),
  ].join(':');
}

function targetLabel(target) {
  const label = target.label || (target.key === 'codex' ? 'Codex / ChatGPT' : 'Claude Code');
  return target.version ? `${label} v${target.version}` : label;
}

function joinLabels(targets) {
  const labels = targets.map(targetLabel);
  if (labels.length < 2) return labels[0] || 'an agent extension';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

// Converts the read-only patch plan into one stable, user-facing health issue.
// Actionable targets take priority because the existing re-apply command can
// repair them. Unsupported targets remain visible in the signature and detail
// suffix, but are never offered as if a write could fix them.
function patchHealthIssue(plan) {
  const targets = Array.isArray(plan && plan.targets) ? plan.targets : [];
  const actionable = targets.filter((target) => (
    target.compatible !== false
    && Array.isArray(target.actions)
    && target.actions.length > 0
  ));
  const unsupported = targets.filter((target) => target.compatible === false);

  if (!actionable.length && !unsupported.length) return null;

  const affected = [...actionable, ...unsupported];
  const signature = affected.map(targetIdentity).sort().join('|');
  if (actionable.length) {
    const subject = joinLabels(actionable);
    const state = actionable.length === 1
      ? 'may have changed or lost its RTL integration and needs its patches re-applied'
      : 'may have changed or lost their RTL integrations and need their patches re-applied';
    const unsupportedSuffix = unsupported.length
      ? ` ${unsupported.length === 1 ? 'Another detected layout is' : 'Other detected layouts are'} unsupported; open Details before continuing.`
      : '';
    return {
      kind: 'repair',
      signature: `repair|${signature}`,
      message: `RastChin: ${subject} ${state}.${unsupportedSuffix}`,
    };
  }

  const subject = joinLabels(unsupported);
  const verb = unsupported.length === 1 ? 'has' : 'have';
  return {
    kind: 'unsupported',
    signature: `unsupported|${signature}`,
    message: `RastChin: ${subject} ${verb} an unsupported layout. No files were changed; update RastChin or open Details for diagnostics.`,
  };
}

function patchHealthIsSnoozed(state, issue, now = Date.now()) {
  if (!state || !issue || typeof state.get !== 'function') return false;
  const snooze = state.get(PATCH_HEALTH_SNOOZE_KEY);
  return !!(
    snooze
    && snooze.signature === issue.signature
    && Number.isFinite(snooze.until)
    && snooze.until > now
  );
}

async function snoozePatchHealth(state, issue, now = Date.now()) {
  if (!state || !issue || typeof state.update !== 'function') return;
  await state.update(PATCH_HEALTH_SNOOZE_KEY, {
    signature: issue.signature,
    until: now + PATCH_HEALTH_SNOOZE_MS,
  });
}

async function clearPatchHealthSnooze(state) {
  if (!state || typeof state.get !== 'function' || typeof state.update !== 'function') return;
  if (state.get(PATCH_HEALTH_SNOOZE_KEY) !== undefined) {
    await state.update(PATCH_HEALTH_SNOOZE_KEY, undefined);
  }
}

module.exports = {
  PATCH_HEALTH_SNOOZE_KEY,
  PATCH_HEALTH_SNOOZE_MS,
  clearPatchHealthSnooze,
  patchHealthIsSnoozed,
  patchHealthIssue,
  snoozePatchHealth,
};
