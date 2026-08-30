import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";
import { installSteps } from "@/content/install";
import { toFaDigits } from "@/lib/format/digits";

export function Install({ dict }: { dict: Dictionary }) {
  return (
    <Section id="install">
      <div data-reveal-stagger className="max-w-2xl">
        <div data-reveal>
          <Eyebrow>{dict.install.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {dict.install.title}
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted">
          {dict.install.sub}
        </p>
      </div>

      <ol className="relative mt-12 max-w-2xl space-y-6">
        {/* spine */}
        <span
          className="absolute bottom-6 top-6 w-px bg-gradient-to-b from-crimson/50 via-crimson/30 to-transparent"
          style={{ insetInlineStart: "1.25rem" }}
          aria-hidden
        />
        {installSteps.map((s) => (
          <li
            key={s.step}
            data-reveal="slide-start"
            className="relative flex gap-5 ps-0"
          >
            <span className="z-10 grid size-10 shrink-0 place-items-center rounded-full border border-crimson/40 bg-bg font-display text-sm font-bold text-crimson nums">
              {toFaDigits(s.step)}
            </span>
            <div className="pt-1">
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
