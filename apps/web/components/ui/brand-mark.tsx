/** The RastChin "ascending steps" mark, in currentColor so it tints with text. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" aria-hidden>
      <rect x="135" y="345" width="115" height="60" />
      <rect x="250" y="285" width="50" height="60" />
      <rect x="300" y="120" width="60" height="172" />
    </svg>
  );
}
