"use client";

import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";
import { clsx } from "@/lib/clsx";
import { BrandMark } from "@/components/ui/brand-mark";

type Labels = {
  addTo: string;
  browserGeneric: string;
  comingSoon: string;
  comingSoonLong: string;
};

/**
 * Best-effort Chromium-browser detection. RastChin installs on any Chromium
 * browser, so the CTA reads "Add to <their browser>" instead of always "Chrome".
 * Returns null when unknown (→ the generic "your browser" label). Brave hides
 * itself behind the Chrome UA, so it's resolved separately (async) by the caller.
 */
function detectBrowser(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua) || /\bOPR\b/.test(ua)) return "Opera";
  if (/Vivaldi/.test(ua)) return "Vivaldi";
  if (/YaBrowser/.test(ua)) return "Yandex";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/\bComet\//i.test(ua)) return "Comet";
  if (/Chrome\//.test(ua)) return "Chrome";
  return null;
}

export function AddToChromeButton({
  labels,
  size = "md",
  className,
}: {
  labels: Labels;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  // null until mounted → SSR + first client render both show the generic label
  // (no hydration mismatch), then we refine to the detected browser.
  const [browser, setBrowser] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      brave?: { isBrave?: () => Promise<boolean> };
    };
    if (nav.brave?.isBrave) {
      nav.brave
        .isBrave()
        .then((isBrave) => {
          if (!cancelled) setBrowser(isBrave ? "Brave" : detectBrowser());
        })
        .catch(() => {
          if (!cancelled) setBrowser(detectBrowser());
        });
    } else {
      setBrowser(detectBrowser());
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const label = `${labels.addTo} ${browser ?? labels.browserGeneric}`;

  const sizing =
    size === "lg"
      ? "gap-2.5 px-7 py-4 text-lg"
      : size === "sm"
        ? "gap-2 px-3.5 py-2 text-sm"
        : "gap-2.5 px-5 py-3 text-base";

  const base = clsx(
    "group/cta relative inline-flex items-center justify-center rounded-lg",
    "bg-crimson font-medium text-crimson-content transition-colors hover:text-crimson-pressed-content",
    "hover:bg-crimson-pressed focus-visible:outline-2 focus-visible:outline-offset-2",
    sizing,
    className,
  );

  const inner = (
    <>
      <BrandMark className={size === "lg" ? "size-5" : "size-[1.1em]"} />
      <span>{label}</span>
    </>
  );

  if (SITE.storeUrl) {
    return (
      <a href={SITE.storeUrl} target="_blank" rel="noopener noreferrer" className={base}>
        {inner}
      </a>
    );
  }

  return (
    <span className={clsx(base, "cursor-default")} role="button" aria-disabled title={labels.comingSoonLong}>
      {inner}
      <span
        className={clsx(
          "ms-0.5 rounded-full bg-white/20 font-semibold",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        )}
      >
        {labels.comingSoon}
      </span>
    </span>
  );
}
