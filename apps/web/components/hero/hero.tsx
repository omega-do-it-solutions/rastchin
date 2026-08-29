"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AddToChromeButton } from "@/components/layout/add-to-chrome-button";
import { ArrowIcon, ChevronIcon, CodeIcon, GlobeIcon } from "@/components/ui/icons";

export type HeroCopy = {
  eyebrow: string;
  title: string;
  sub: string;
  trust: string;
  actions: { addTo: string; browserGeneric: string; comingSoon: string; comingSoonLong: string };
  secondaryAction?: { href: string; label: string };
  chatUser: string;
  chatReply: string;
};

export function Hero({
  dir,
  copy,
}: {
  dir: "rtl" | "ltr";
  copy: HeroCopy;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const chatWrapRef = useRef<HTMLDivElement>(null);
  const fixedRef = useRef<HTMLParagraphElement>(null);
  const brokenRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const items = copyRef.current?.querySelectorAll(".hero-copy");
      if (items?.length) {
        gsap.fromTo(
          items,
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power3.out", delay: 0.1 },
        );
      }
      gsap.fromTo(
        chatWrapRef.current,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: "power3.out", delay: 0.45 },
      );

      const broken = brokenRef.current;
      const fixed = fixedRef.current;
      const bar = barRef.current;
      const section = sectionRef.current;
      if (broken && fixed && bar && section) {
        // Two layers clipped complementarily, split at the crimson Flip Line, so
        // they never overlap: ahead of the sweep is broken, behind it is fixed.
        const apply = (sweep: number) => {
          const s = sweep * 100;
          const inv = (1 - sweep) * 100;
          if (dir === "rtl") {
            bar.style.left = `${inv}%`;
            broken.style.clipPath = `inset(-40% ${s}% -40% 0)`;
            fixed.style.clipPath = `inset(-40% 0 -40% ${inv}%)`;
          } else {
            bar.style.left = `${s}%`;
            broken.style.clipPath = `inset(-40% 0 -40% ${s}%)`;
            fixed.style.clipPath = `inset(-40% ${inv}% -40% 0)`;
          }
          bar.style.opacity = sweep > 0.01 && sweep < 0.99 ? "1" : "0";
        };
        apply(0); // broken at the top of the page
        ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: 0.4,
          // Finish the correction early in the scroll, so the corrected window
          // still sits well below the header (a comfortable gap) when it lands.
          onUpdate: (self) => apply(Math.min(self.progress / 0.3, 1)),
        });
      }
    });

    return () => ctx.revert();
  }, [dir]);

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-28 md:pt-32"
    >
      {/* Copy */}
      <div ref={copyRef} className="mx-auto max-w-3xl text-center">
        <span className="hero-copy inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/60 px-3.5 py-1.5 text-sm text-muted">
          <span className="size-1.5 rounded-full bg-crimson" aria-hidden />
          {copy.eyebrow}
        </span>
        <h1 className="hero-copy mx-auto mt-6 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
          {copy.title}
        </h1>
        <p className="hero-copy mx-auto mt-5 max-w-xl text-lg text-muted text-pretty">
          {copy.sub}
        </p>
        <div className="hero-copy mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <AddToChromeButton labels={copy.actions} size="lg" />
          {copy.secondaryAction ? (
            <Link
              href={copy.secondaryAction.href}
              className="group inline-flex min-h-12 items-center gap-2 rounded-xl border border-hairline bg-surface/70 px-4 py-3 text-sm font-semibold transition hover:border-crimson/35 hover:bg-surface-2 hover:text-crimson"
            >
              <CodeIcon className="size-5" />
              {copy.secondaryAction.label}
              <ArrowIcon className="size-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          ) : null}
        </div>
        <p className="hero-copy mt-6 text-sm text-muted">{copy.trust}</p>
      </div>

      {/* Chat demo (before → after) — the centerpiece */}
      <div ref={chatWrapRef} className="mx-auto mt-14 w-full max-w-3xl">
        <ChatWindow
          dir={dir}
          user={copy.chatUser}
          reply={copy.chatReply}
          fixedRef={fixedRef}
          brokenRef={brokenRef}
          barRef={barRef}
        />
      </div>
    </section>
  );
}

function ChatWindow({
  dir,
  user,
  reply,
  fixedRef,
  brokenRef,
  barRef,
}: {
  dir: "rtl" | "ltr";
  user: string;
  reply: string;
  fixedRef: React.Ref<HTMLParagraphElement>;
  brokenRef: React.Ref<HTMLParagraphElement>;
  barRef: React.Ref<HTMLSpanElement>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl shadow-black/30">
      {/* window chrome — a browser frame (traffic lights + address bar) so the demo
          reads as a web page, not a messaging app. No title text. */}
      <div
        dir="ltr"
        className="flex items-center gap-3 border-b border-hairline bg-surface-2 px-4 py-3"
      >
        <div className="flex shrink-0 gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface px-3 text-muted">
          <GlobeIcon className="size-3.5 shrink-0" />
          <span className="h-1.5 w-full max-w-[160px] rounded-full bg-hairline" />
        </div>
      </div>

      {/* messages */}
      <div className="space-y-5 p-6 md:p-8" dir="rtl">
        <div className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-3 font-vazir text-[15px] text-text/90">
          {user}
        </div>

        <div className="relative w-full max-w-[92%] rounded-2xl rounded-tl-sm bg-surface-2/60">
          {/* fixed (correct) — the base; sizes the bubble. Carries the padding itself
              so it shares the EXACT same box as the absolute broken overlay; otherwise
              the two clip boundaries only align at 50% and overlap elsewhere. */}
          <p
            ref={fixedRef}
            className="px-5 py-4 font-vazir text-base leading-loose text-text md:text-lg"
            dir="rtl"
            style={{ unicodeBidi: "plaintext" }}
          >
            {reply}
          </p>
          {/* broken overlay — swept away on scroll */}
          <p
            ref={brokenRef}
            aria-hidden
            className="hero-broken absolute inset-0 px-5 py-4 text-base leading-loose text-muted md:text-lg"
            style={{
              direction: "ltr",
              textAlign: "left",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {reply}
          </p>
          {/* crimson Flip Line — the single accent in this window */}
          <span
            ref={barRef}
            aria-hidden
            className="absolute -top-3 -bottom-3 w-0.5 bg-crimson"
            style={{
              left: dir === "rtl" ? "100%" : "0%",
              opacity: 0,
              boxShadow: "0 0 18px rgb(var(--crimson))",
            }}
          />
        </div>
      </div>

      {/* input row */}
      <div className="flex items-center gap-3 border-t border-hairline px-5 py-4" dir="rtl">
        <div className="h-10 flex-1 rounded-full border border-hairline bg-surface-2" />
        <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted">
          <ChevronIcon className="size-4 rotate-90 rtl:-rotate-90" />
        </span>
      </div>
    </div>
  );
}
