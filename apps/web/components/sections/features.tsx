import { Section, Eyebrow } from "@/components/ui/section";
import { clsx } from "@/lib/clsx";
import type { Dictionary } from "@/content/dictionaries/types";
import { features } from "@/content/features";
import {
  ScanIcon,
  CodeIcon,
  TypeIcon,
  SlidersIcon,
  ShieldIcon,
} from "@/components/ui/icons";

const ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  detection: ScanIcon,
  codesafe: CodeIcon,
  vazirmatn: TypeIcon,
  control: SlidersIcon,
  privacy: ShieldIcon,
};

export function Features({ dict }: { dict: Dictionary }) {
  return (
    <Section id="features">
      <div data-reveal-stagger className="max-w-2xl">
        <div data-reveal>
          <Eyebrow>{dict.features.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {dict.features.title}
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted text-pretty">
          {dict.features.sub}
        </p>
      </div>

      {/* 6-col grid so each card spans 2 cols (3 per row); auto-rows-fr keeps every
          card the exact same height, and offsetting the 4th card centers the last row. */}
      <div className="mt-12 grid auto-rows-fr grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
        {features.map((f, i) => {
          const Icon = ICONS[f.id] ?? ScanIcon;
          return (
            <div
              key={f.id}
              data-reveal={f.reveal}
              className={clsx(
                "flex h-full flex-col rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-crimson/30 lg:col-span-2",
                i === 3 && "lg:col-start-2",
              )}
            >
              <span className="grid size-11 place-items-center rounded-lg bg-surface-2 text-text/80">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2.5 leading-relaxed text-muted">{f.body}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
