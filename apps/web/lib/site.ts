import { extensionRelease } from "@/content/extension-release";
import { platforms } from "@/content/platforms";

/**
 * Single source of truth for site-wide constants.
 * `storeUrl` drives every Chrome Web Store CTA and the JSON-LD downloadUrl.
 */
export const SITE = {
  name: "RastChin",
  nameFa: "راست‌چین",
  fullName: "RastChin Tools for Persian RTL",
  url: "https://rastchin.tools",
  storeUrl: extensionRelease.chromeWebStoreUrl,
  version: extensionRelease.version,
  vendor: "Omega Do. IT Solutions",
  platformCount: platforms.length,
} as const;
