"use client";

import { useEffect, useState } from "react";

export function RotatingWord({
  words,
  intervalMs = 1800,
}: {
  words: readonly string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length < 2) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % words.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, words.length]);

  return (
    <span
      dir="ltr"
      className="ltr-token mx-2 inline-flex w-[17ch] justify-center whitespace-nowrap rounded-xl bg-crimson/10 px-2.5 py-0.5 text-crimson"
    >
      {words[index]}
    </span>
  );
}
