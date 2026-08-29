import localFont from "next/font/local";
import { IBM_Plex_Mono } from "next/font/google";

/**
 * Persian display + body. Self-hosted variable WOFF2 copied from the RastChin
 * extension. Vazirmatn IS the subject of the product and carries the whole site;
 * its Latin glyphs cover the inline English words (Chrome, API, GitHub…) too.
 */
export const vazirmatn = localFont({
  src: "../public/fonts/Vazirmatn-Variable.woff2",
  variable: "--font-vazir",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Code / utility — load-bearing: "we don't break code/URLs/emails" shown in real mono. */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

/** Font CSS variables, applied once on <html>. */
export const fontVariables = [vazirmatn.variable, plexMono.variable].join(" ");
