// src/ui/whats-new/whats-new.js
// Renders the static, local-only changelog from the shared data module
// (src/ui/shared/changelog-data.js, loaded as a sibling <script> global and
// also consumed by the side panel). Nothing here is fetched from the network;
// the page reads only the extension's own manifest version.

const CHANGELOG = (typeof window !== 'undefined' && Array.isArray(window.RASTCHIN_CHANGELOG))
  ? window.RASTCHIN_CHANGELOG
  : [];

function getCurrentVersion() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch (_) {
    // fall through to null when the manifest is unavailable
  }
  return null;
}

function setVersionBadge(version) {
  const badge = document.getElementById('whatsNewVersion');
  if (badge) badge.textContent = version ? `v${version}` : '';
}

function buildReleaseCard(entry, currentVersion) {
  const card = document.createElement('li');
  card.className = 'release';
  const isCurrent = !!currentVersion && entry.version === currentVersion;
  if (isCurrent) card.classList.add('is-current');

  const head = document.createElement('div');
  head.className = 'release-head';

  const version = document.createElement('span');
  version.className = 'release-version rc-ltr';
  version.textContent = entry.tag;
  head.appendChild(version);

  const title = document.createElement('span');
  title.className = 'release-title';
  title.textContent = entry.title;
  head.appendChild(title);

  if (isCurrent) {
    const pill = document.createElement('span');
    pill.className = 'current-pill';
    pill.textContent = 'نسخهٔ فعلی';
    head.appendChild(pill);
  }

  card.appendChild(head);

  const list = document.createElement('ul');
  list.className = 'release-list';
  entry.notes.forEach(note => {
    const item = document.createElement('li');
    item.textContent = note;
    list.appendChild(item);
  });
  card.appendChild(list);

  return card;
}

function renderTimeline() {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;
  const currentVersion = getCurrentVersion();
  setVersionBadge(currentVersion);

  const fragment = document.createDocumentFragment();
  CHANGELOG.forEach(entry => fragment.appendChild(buildReleaseCard(entry, currentVersion)));
  timeline.replaceChildren(fragment);
}

function wireFeedbackLink() {
  const link = document.getElementById('feedbackLink');
  if (!link) return;
  link.addEventListener('click', event => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    event.preventDefault();
    chrome.tabs.create({ url: 'https://rastchin.tools/feedback/?source=extension&type=suggestion' });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderTimeline();
  wireFeedbackLink();
});
