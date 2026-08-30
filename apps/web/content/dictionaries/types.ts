/**
 * UI narrative strings (headings, sublines, labels, buttons) for the Persian-only
 * site. Structured data (platforms, features, faq, install, captions, changelog)
 * lives in content/*.ts and is imported directly by sections. `fa.ts` is typed
 * `: Dictionary`, so TypeScript enforces that every key is present.
 */
export interface Dictionary {
  nav: {
    tools: string;
    browserExtension: string;
    vscodeRtl: string;
    features: string;
    platforms: string;
    youtube: string;
    privacy: string;
    install: string;
    faq: string;
    credits: string;
    changelog: string;
    feedback: string;
  };
  actions: {
    addTo: string; // CTA verb, composed as `${addTo} ${browser}` (e.g. "افزودن به Brave")
    browserGeneric: string; // fallback when the browser can't be detected ("your browser")
    comingSoon: string;
    comingSoonLong: string;
    readFullPrivacy: string;
    backToHome: string;
    openMenu: string;
    closeMenu: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    sub: string;
    trust: string;
    chatUser: string;
    chatReply: string;
  };
  problem: {
    eyebrow: string;
    title: string;
    bullets: string[];
    quote: string;
    sampleBroken: string;
    sampleFixed: string;
  };
  fix: {
    eyebrow: string;
    title: string;
    beforeLabel: string;
    afterLabel: string;
    chipRtl: string;
    chipLtr: string;
  };
  features: { eyebrow: string; title: string; sub: string };
  platforms: {
    eyebrow: string;
    title: string;
    sub: string;
    groups: { ai: string; work: string; communication: string; media: string };
  };
  browsers: {
    eyebrow: string;
    title: string;
    sub: string;
    more: string;
  };
  stats: {
    platforms: string;
    bytesSent: string;
    latency: string;
    glyphs: string;
  };
  youtube: {
    eyebrow: string;
    title: string;
    body: string;
    sizeLabel: string;
    smallLabel: string;
    mediumLabel: string;
    colorLabel: string;
    yellowLabel: string;
    whiteLabel: string;
    toggleLabel: string;
    previewText: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    bullets: string[];
  };
  credits: {
    eyebrow: string;
    title: string;
    sub: string;
    developerRole: string;
    contributorRole: string;
    linkedinLabel: string;
  };
  install: { eyebrow: string; title: string; sub: string };
  faq: { eyebrow: string; title: string };
  finalCta: { title: string; sub: string };
  footer: {
    tagline: string;
    columns: { product: string; resources: string };
    support: string;
  };
  theme: { light: string; dark: string; toggle: string };
  marquee: string;
  privacyPage: {
    title: string;
    intro: string;
    sections: { heading: string; body: string[] }[];
  };
  changelogPage: {
    title: string;
    intro: string;
  };
  feedbackPage: {
    title: string;
    intro: string;
    types: {
      suggestion: string;
      bug: string;
      support: string;
      other: string;
    };
    typeHints: {
      suggestion: string;
      bug: string;
      support: string;
      other: string;
    };
    fields: {
      name: string;
      email: string;
      message: string;
    };
    actions: {
      submit: string;
    };
    status: {
      sending: string;
      sent: string;
      failed: string;
      invalidEmail: string;
      rateLimited: string;
      serverIssue: string;
    };
  };
}
