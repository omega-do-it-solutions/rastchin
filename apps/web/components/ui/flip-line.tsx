import { clsx } from "@/lib/clsx";

/**
 * The "Flip Line" signature motif — a crimson alignment axis with a gold
 * "corrected" pip at the inline-start. Used as a section divider and a spine.
 */
export function FlipLine({
  className,
  pip = true,
}: {
  className?: string;
  pip?: boolean;
}) {
  return (
    <div className={clsx("relative h-px w-full", className)} aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-crimson/55 to-transparent" />
      {pip && (
        <span
          className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-gold"
          style={{ insetInlineStart: 0, boxShadow: "0 0 12px rgb(var(--gold) / 0.6)" }}
        />
      )}
    </div>
  );
}
