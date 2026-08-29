export type PlatformCategory = "ai" | "work" | "communication" | "media";
export type PlatformSupport = "full" | "font-only" | "scoped" | "captions";

export interface Platform {
  /** matches public/logos/<id>.svg */
  id: string;
  /** brand name */
  name: string;
  category: PlatformCategory;
  support: PlatformSupport;
  scopeNote: string;
}

export interface Feature {
  id: string;
  title: string;
  body: string;
  /** entrance animation type, varied so no two adjacent sections repeat */
  reveal: "slide-start" | "slide-end" | "clip-reveal" | "scale-up" | "fade-up";
}

export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

export interface InstallStep {
  step: number;
  title: string;
  body: string;
}

export type CreditRole = "developer" | "contributor";

export interface CreditPerson {
  id: string;
  name: string;
  role: CreditRole;
  linkedinUrl: string;
}

export interface CaptionColor {
  hex: string;
  label: string;
}

export interface ChangelogEntry {
  version: string;
  title: string;
  /** ISO date when known */
  date?: string;
  notes: string[];
}
