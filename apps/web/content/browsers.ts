/**
 * Chromium-based browsers RastChin runs on. Icons are monochrome silhouettes at
 * /public/logos/browsers/<id>.svg, tinted via CSS mask so they read in both themes.
 * This is a recognizable, representative set — Chromium's long tail is far longer
 * (see the "more" caption in the section).
 */
export type BrowserItem = { id: string; name: string };

export const browsers: BrowserItem[] = [
  { id: "chrome", name: "Chrome" },
  { id: "edge", name: "Edge" },
  { id: "brave", name: "Brave" },
  { id: "opera", name: "Opera" },
  { id: "operagx", name: "Opera GX" },
  { id: "vivaldi", name: "Vivaldi" },
  { id: "arc", name: "Arc" },
  { id: "chromium", name: "Chromium" },
  { id: "duckduckgo", name: "DuckDuckGo" },
  { id: "comet", name: "Comet" },
];
