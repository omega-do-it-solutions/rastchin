import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";
import { browsers } from "@/content/browsers";

/** One browser chip: a mask-tinted monochrome glyph + name. Color follows the theme. */
function BrowserChip({ id, name, dup }: { id: string; name: string; dup?: boolean }) {
  const url = `url(/logos/browsers/${id}.svg)`;
  return (
    <div
      {...(dup ? { "aria-hidden": true } : {})}
      className={`group flex shrink-0 items-center gap-2.5 rounded-full border border-hairline bg-surface px-4 py-2.5${dup ? " browser-dup" : ""}`}
    >
      <span
        aria-hidden
        className="size-5 bg-muted transition-colors duration-300 group-hover:bg-text"
        style={{
          maskImage: url,
          WebkitMaskImage: url,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
      <span className="whitespace-nowrap text-sm font-medium">{name}</span>
    </div>
  );
}

export function Browsers({ dict }: { dict: Dictionary }) {
  const b = dict.browsers;
  // Duplicated track so the CSS marquee loops seamlessly (-50% == one full set).
  return (
    <Section id="browsers">
      <div data-reveal-stagger className="mx-auto max-w-2xl text-center">
        <div data-reveal className="flex justify-center">
          <Eyebrow>{b.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {b.title}
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted text-pretty">
          {b.sub}
        </p>
      </div>

      {/* edge-faded, auto-scrolling marquee of browser chips. The list is repeated
          4× so the track is always wider than the viewport (no gap mid-scroll); the
          animation translates −50% (== two sets) for a seamless loop. */}
      <div
        dir="ltr"
        data-reveal
        className="browser-marquee relative mt-12 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
      >
        <div className="browser-track flex w-max gap-3 pr-3">
          {[0, 1, 2, 3].map((set) =>
            browsers.map((x) => (
              <BrowserChip key={`${set}-${x.id}`} id={x.id} name={x.name} dup={set > 0} />
            )),
          )}
        </div>
      </div>

      <p data-reveal className="mt-6 text-center text-sm text-muted">
        {b.more}
      </p>
    </Section>
  );
}
