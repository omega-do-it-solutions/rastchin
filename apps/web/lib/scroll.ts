/**
 * Shared, side-effect-free helpers for the scroll system. All GSAP/Lenis wiring
 * lives in components/scroll/scroll-provider.tsx (client only).
 */

export type RevealType =
  | "fade-up"
  | "slide-start"
  | "slide-end"
  | "scale-up"
  | "clip-reveal"
  | "stagger-up";

export const REVEAL = { duration: 0.9, ease: "power3.out" } as const;

type Vars = Record<string, number | string>;

/** Direction-aware "from" state. slide-start enters from the inline-start edge. */
export function revealFrom(type: string, dir: "rtl" | "ltr"): Vars {
  const startX = dir === "rtl" ? 64 : -64;
  switch (type) {
    case "slide-start":
      return { opacity: 0, x: startX };
    case "slide-end":
      return { opacity: 0, x: -startX };
    case "scale-up":
      return { opacity: 0, scale: 0.92, y: 24 };
    case "clip-reveal":
      return { opacity: 0, clipPath: "inset(0 0 100% 0)", y: 12 };
    case "stagger-up":
      return { opacity: 0, y: 56 };
    case "fade-up":
    default:
      return { opacity: 0, y: 40 };
  }
}

export const revealTo: Vars = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  clipPath: "inset(0 0 0% 0)",
};

/** Lenis easing — gentle exponential ease-out. */
export const lenisEasing = (t: number): number =>
  Math.min(1, 1.001 - Math.pow(2, -10 * t));
