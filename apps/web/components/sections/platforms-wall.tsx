import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";
import { platformsByCategory } from "@/content/platforms";
import { PlatformLogo } from "@/components/ui/platform-logo";

export function PlatformsWall({
  dict,
  singleLineTitle = false,
}: {
  dict: Dictionary;
  singleLineTitle?: boolean;
}) {
  const subLines = dict.platforms.sub.split("\n");
  const groups = [
    { key: "ai", label: dict.platforms.groups.ai, items: platformsByCategory.ai },
    { key: "work", label: dict.platforms.groups.work, items: platformsByCategory.work },
    {
      key: "communication",
      label: dict.platforms.groups.communication,
      items: platformsByCategory.communication,
    },
    { key: "media", label: dict.platforms.groups.media, items: platformsByCategory.media },
  ] as const;

  return (
    <Section id="platforms">
      <div
        data-reveal-stagger
        className={`mx-auto text-center ${singleLineTitle ? "max-w-5xl" : "max-w-2xl"}`}
      >
        <div data-reveal className="flex justify-center">
          <Eyebrow>{dict.platforms.eyebrow}</Eyebrow>
        </div>
        <h2
          data-reveal
          className={`mt-4 font-display text-3xl font-bold md:text-4xl ${
            singleLineTitle ? "md:whitespace-nowrap" : ""
          }`}
        >
          {dict.platforms.title}
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted text-pretty">
          {subLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>

      <div className="mt-12 space-y-12">
        {groups.map((g) => (
          <div key={g.key}>
            <h3
              data-reveal
              className="text-center text-sm font-semibold uppercase tracking-wide text-muted"
            >
              {g.label}
            </h3>
            <div
              data-reveal-stagger="stagger-up"
              className="mt-5 flex flex-wrap justify-center gap-3"
            >
              {g.items.map((p) => (
                <div
                  key={p.id}
                  data-reveal
                  className="group flex w-[44%] flex-col items-center gap-2.5 rounded-xl border border-hairline bg-surface p-5 text-center transition-colors hover:border-crimson/30 sm:w-40 lg:w-44"
                >
                  <PlatformLogo id={p.id} name={p.name} />
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.category !== "ai" && (
                    <span className="text-xs leading-snug text-muted">
                      {p.scopeNote}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
