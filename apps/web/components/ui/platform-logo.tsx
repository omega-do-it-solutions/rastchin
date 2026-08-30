import { clsx } from "@/lib/clsx";

/**
 * Renders a platform mark on a white chip so every brand logo — including the
 * dark ones (DeepSeek, Notion, Trello…) — stays clearly visible in BOTH themes.
 * Full color (brand logos are designed for a light background).
 */
export function PlatformLogo({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "grid size-12 shrink-0 place-items-center rounded-xl bg-white p-2 ring-1 ring-black/5 transition duration-300 group-hover:scale-105",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/logos/${id}.svg`}
        alt={name}
        width={32}
        height={32}
        loading="lazy"
        className="size-8 object-contain"
      />
    </span>
  );
}
