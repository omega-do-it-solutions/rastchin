/** Oversized faint Vazirmatn line that slides on scroll — direction reads as reading order. */
export function Marquee({ text }: { text: string }) {
  // Repeated with a padded dot so junctions never collide into a darker overlap;
  // generous line-height + vertical padding so tall/low Persian strokes never clip.
  const phrase = `${text} · `;
  return (
    <div data-marquee className="select-none overflow-hidden py-14 md:py-20" aria-hidden>
      <div
        data-marquee-track
        className="w-max whitespace-nowrap font-vazir text-[clamp(2.25rem,7.5vw,5.5rem)] font-extralight leading-[1.35] text-text/[0.06]"
      >
        {phrase.repeat(4)}
      </div>
    </div>
  );
}
