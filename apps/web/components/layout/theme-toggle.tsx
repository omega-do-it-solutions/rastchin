"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "@/components/ui/icons";

export function ThemeToggle({
  labels,
}: {
  labels: { light: string; dark: string; toggle: string };
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = !mounted || resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={labels.toggle}
      title={mounted ? (isDark ? labels.light : labels.dark) : labels.toggle}
      className="grid size-10 place-items-center rounded-lg border border-hairline text-text/75 transition hover:bg-surface-2 hover:text-text"
    >
      {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </button>
  );
}
