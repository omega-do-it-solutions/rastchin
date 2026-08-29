import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";

export function BeforeAfter({ dict }: { dict: Dictionary }) {
  const f = dict.fix;
  const sample = dict.problem.sampleFixed;

  return (
    <Section id="fix">
      <div data-reveal-stagger className="mx-auto max-w-2xl text-center">
        <div data-reveal className="flex justify-center">
          <Eyebrow>{f.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {f.title}
        </h2>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl items-stretch gap-5 md:grid-cols-2">
        {/* Before — broken (red) */}
        <div
          data-reveal="slide-start"
          className="flex flex-col rounded-xl border border-red/30 bg-red/[0.06] p-6"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red">
            <span className="size-1.5 rounded-full bg-red" aria-hidden />
            {f.beforeLabel}
          </span>
          <p
            className="mt-4 text-[15px] leading-loose text-text/70"
            style={{
              direction: "ltr",
              unicodeBidi: "bidi-override",
              textAlign: "left",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {sample}
          </p>
        </div>

        {/* After — corrected (green) */}
        <div
          data-reveal="slide-end"
          className="flex flex-col rounded-xl border border-green/30 bg-green/[0.06] p-6"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-green">
            <span className="size-1.5 rounded-full bg-green" aria-hidden />
            {f.afterLabel}
          </span>
          <p
            className="mt-4 font-vazir text-[15px] leading-loose text-text"
            dir="rtl"
            style={{ unicodeBidi: "plaintext" }}
          >
            {sample}
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-text/80">
              {f.chipRtl}
            </span>
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-text/80">
              {f.chipLtr}
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
