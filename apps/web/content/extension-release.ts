export const extensionRelease = {
  version: "1.1.64",
  published: true,
  status: "published",
  sourceRepo: "omega-do-it-solutions/rastchin",
  sourcePath: "apps/browser-extension",
  syncedAt: "2026-08-29",
  chromeWebStoreUrl:
    "https://chromewebstore.google.com/detail/rastchin-%D8%B1%D8%A7%D8%B3%D8%AA%E2%80%8C%DA%86%DB%8C%D9%86-persian/aginnihonhjafmecnbnkjokkaglknagd" as string | null,
} as const;

export function extensionVersionLabel() {
  return `v${extensionRelease.version}`;
}

export function extensionReleaseStatusFa() {
  return extensionRelease.published
    ? "آخرین نسخه منتشرشده"
    : "نسخه آماده انتشار";
}
