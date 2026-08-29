import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "@/styles/fonts";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SITE } from "@/lib/site";

/**
 * Sets `data-anim="on"` before paint when JS is present AND reduced motion is not
 * requested. CSS keys all scroll-reveal initial (hidden) states off this attribute,
 * so without JS / with reduced motion the content renders fully visible.
 */
const animFlag = `(function(){try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.setAttribute('data-anim','on')}}catch(e){}})()`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} · ${SITE.nameFa}`,
    template: `%s · ${SITE.name}`,
  },
  applicationName: SITE.name,
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/icons/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14121A" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8f5" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa-IR" dir="rtl" suppressHydrationWarning className={fontVariables}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: animFlag }} />
        <ThemeProvider>
          <div className="locale-fa manuscript min-h-dvh">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
