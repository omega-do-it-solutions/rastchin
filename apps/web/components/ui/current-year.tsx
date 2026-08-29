"use client";

import { useEffect, useState } from "react";

/**
 * Renders the current calendar year, always Latin digits. Server/build renders
 * `fallback` (the build-time year) so static HTML is correct; on the client it
 * refreshes to the real current year, so a long-lived static deploy never shows
 * a stale copyright year without needing a code change or rebuild.
 */
export function CurrentYear({ fallback }: { fallback: number }) {
  const [year, setYear] = useState(fallback);
  useEffect(() => {
    const now = new Date().getFullYear();
    if (now !== fallback) setYear(now);
  }, [fallback]);
  return <>{year}</>;
}
