import type { Dictionary } from "@/content/dictionaries/types";
import { extensionReleaseStatusFa, extensionVersionLabel } from "@/content/extension-release";
import { AddToChromeButton } from "@/components/layout/add-to-chrome-button";
import { FlipLine } from "@/components/ui/flip-line";
import { RotatingWord } from "@/components/ui/rotating-word";

export function FinalCta({
  dict,
  rotatingWords,
  compact = false,
}: {
  dict: Dictionary;
  rotatingWords?: readonly string[];
  compact?: boolean;
}) {
  const [titleStart, titleEnd] = dict.finalCta.title.split("{tool}");
  const titleEndLines = titleEnd?.split("\n") ?? [];
  const rotatingTitleWords = rotatingWords?.length && titleEnd !== undefined ? rotatingWords : undefined;

  return (
    <section
      id="cta"
      className="relative isolate overflow-hidden border-t border-hairline bg-surface"
    >
      {/* Distinct closing zone: elevated surface + a soft secondary-color glow rising from the base */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(75%_75%_at_50%_115%,rgb(var(--gold)/0.18),rgb(var(--teal)/0.07)_48%,transparent_72%)]"
      />
      <div className={`mx-auto max-w-content px-6 text-center md:px-10 ${compact ? "py-16 md:py-20" : "py-28"}`}>
        <div data-reveal-stagger="scale-up">
          <h2
            data-reveal
            className={`mx-auto max-w-3xl pb-1 font-display font-bold text-balance ${
              compact ? "text-3xl leading-[1.45] md:text-5xl md:leading-[1.28]" : "text-4xl leading-[1.35] md:text-6xl md:leading-[1.2]"
            }`}
          >
            {rotatingTitleWords ? (
              <>
                <span className="inline">
                  {titleStart}
                  <RotatingWord words={rotatingTitleWords} />
                  {titleEndLines[0]}
                </span>
                {titleEndLines.slice(1).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </>
            ) : (
              dict.finalCta.title
            )}
          </h2>
          <div data-reveal className="mt-9 flex justify-center">
            <AddToChromeButton labels={dict.actions} size="lg" />
          </div>
          <p data-reveal className="mt-5 flex flex-col items-center gap-2 text-muted">
            <span>{dict.finalCta.sub}</span>
            <span className="rounded-full border border-hairline bg-white/[0.04] px-3 py-1 text-xs">
              <span className="nums ltr-token">{extensionVersionLabel()}</span>
              <span className="mx-1.5">·</span>
              {extensionReleaseStatusFa()}
            </span>
          </p>
        </div>
      </div>
      <FlipLine className="absolute inset-x-0 bottom-0" pip={false} />
    </section>
  );
}
