import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";

export function Problem({ dict }: { dict: Dictionary }) {
  const p = dict.problem;
  return (
    <Section id="problem">
      <div data-reveal-stagger="fade-up" className="max-w-2xl">
        <div data-reveal>
          <Eyebrow>{p.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {p.title}
        </h2>
        <ul data-reveal className="mt-7 space-y-3.5">
          {p.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-lg text-muted">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-crimson" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <blockquote data-reveal className="mt-14 border-s-2 border-crimson ps-6">
        <p className="max-w-3xl font-display text-2xl leading-relaxed text-balance md:text-3xl">
          {p.quote}
        </p>
      </blockquote>
    </Section>
  );
}
