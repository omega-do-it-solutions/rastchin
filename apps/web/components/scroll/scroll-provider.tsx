"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { revealFrom, revealTo, REVEAL, lenisEasing } from "@/lib/scroll";
import { toFaDigits } from "@/lib/format/digits";

/**
 * Single Lenis + GSAP ScrollTrigger instance for the whole page. Wires every
 * [data-reveal] element, staggered groups, marquees and counters from the DOM,
 * so section markup stays server-rendered. Skipped entirely under reduced motion
 * (the CSS reduced-motion rule already reveals everything).
 */
export function ScrollProvider({
  dir,
  children,
}: {
  dir: "rtl" | "ltr";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ duration: 1.1, easing: lenisEasing, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add("lenis", "lenis-smooth");

    const ctx = gsap.context(() => {
      // 1) Staggered groups: animate direct [data-reveal] children together.
      gsap.utils.toArray<HTMLElement>("[data-reveal-stagger]").forEach((group) => {
        const items = gsap.utils.toArray<HTMLElement>(":scope > [data-reveal]", group);
        if (!items.length) return;
        items.forEach((el) => el.setAttribute("data-st-done", ""));
        const type = group.getAttribute("data-reveal-stagger") || "fade-up";
        gsap.fromTo(items, revealFrom(type, dir), {
          ...revealTo,
          ...REVEAL,
          stagger: 0.1,
          scrollTrigger: { trigger: group, start: "top 82%", once: true },
        });
      });

      // 2) Standalone reveals.
      gsap
        .utils.toArray<HTMLElement>("[data-reveal]:not([data-st-done])")
        .forEach((el) => {
          const type = el.getAttribute("data-reveal") || "fade-up";
          gsap.fromTo(el, revealFrom(type, dir), {
            ...revealTo,
            ...REVEAL,
            scrollTrigger: { trigger: el, start: "top 86%", once: true },
          });
        });

      // 3) Marquees — track slides on scroll; direction reads as the reading order.
      gsap.utils.toArray<HTMLElement>("[data-marquee]").forEach((m) => {
        const track = m.querySelector<HTMLElement>("[data-marquee-track]");
        if (!track) return;
        const d = dir === "rtl" ? 16 : -16;
        gsap.fromTo(
          track,
          { xPercent: -d },
          {
            xPercent: d,
            ease: "none",
            scrollTrigger: { trigger: m, start: "top bottom", end: "bottom top", scrub: 0.5 },
          },
        );
      });

      // 4) Counters — count up from 0, digits localized to the active locale.
      gsap.utils.toArray<HTMLElement>("[data-counter]").forEach((el) => {
        const end = parseFloat(el.getAttribute("data-value") || "0");
        const obj = { v: 0 };
        gsap.to(obj, {
          v: end,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
          onUpdate: () => {
            el.textContent = toFaDigits(Math.round(obj.v));
          },
        });
      });
    });

    // Smooth-scroll in-page anchor links (the header / footer nav) via Lenis.
    const onAnchorClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as
        | HTMLAnchorElement
        | null;
      const hash = link?.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -72 });
      history.replaceState(null, "", hash);
    };
    document.addEventListener("click", onAnchorClick);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    const settle = window.setTimeout(refresh, 350);
    const lateSettle = window.setTimeout(refresh, 1000);
    const hashSettle = window.setTimeout(() => {
      if (!window.location.hash) return;
      const target = document.querySelector(window.location.hash);
      if (!target) return;
      lenis.scrollTo(target as HTMLElement, { immediate: true, offset: -72 });
      ScrollTrigger.refresh();
    }, 100);

    return () => {
      document.removeEventListener("click", onAnchorClick);
      window.removeEventListener("load", refresh);
      window.clearTimeout(settle);
      window.clearTimeout(lateSettle);
      window.clearTimeout(hashSettle);
      gsap.ticker.remove(tick);
      ctx.revert();
      lenis.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, [dir]);

  return <>{children}</>;
}
