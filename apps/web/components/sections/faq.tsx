import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";
import { faq } from "@/content/faq";
import { Accordion } from "@/components/ui/accordion";

export function Faq({ dict }: { dict: Dictionary }) {
  const items = faq.map((f) => ({ id: f.id, q: f.q, a: f.a }));

  return (
    <Section id="faq">
      <div className="mx-auto max-w-2xl">
        <div data-reveal-stagger className="text-center">
          <div data-reveal className="flex justify-center">
            <Eyebrow>{dict.faq.eyebrow}</Eyebrow>
          </div>
          <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
            {dict.faq.title}
          </h2>
        </div>
        <div className="mt-10">
          <Accordion items={items} />
        </div>
      </div>
    </Section>
  );
}
