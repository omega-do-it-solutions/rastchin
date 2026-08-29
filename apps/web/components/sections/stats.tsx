import type { Dictionary } from "@/content/dictionaries/types";
import { SITE } from "@/lib/site";
import { toFaDigits } from "@/lib/format/digits";
import {
  GridIcon,
  BrowserIcon,
  CloudOffIcon,
  TypeIcon,
} from "@/components/ui/icons";

export function Stats({ dict }: { dict: Dictionary }) {
  const pct = "٪";

  return (
    <section className="border-y border-hairline bg-gradient-to-b from-surface/60 to-bg">
      <div className="mx-auto grid max-w-content grid-cols-2 gap-8 px-6 py-16 text-center md:grid-cols-4 md:px-10">
        {/* Supported platforms */}
        <Stat label={dict.stats.platforms} icon={<GridIcon className="size-5" />}>
          <span data-counter data-value={SITE.platformCount} className="nums">
            {toFaDigits(0)}
          </span>
        </Stat>

        {/* 100% in-browser */}
        <Stat label={dict.stats.latency} icon={<BrowserIcon className="size-5" />}>
          <span data-counter data-value={100} className="nums">
            {toFaDigits(0)}
          </span>
          <span className="text-crimson">{pct}</span>
        </Stat>

        {/* 0 bytes sent */}
        <Stat label={dict.stats.bytesSent} icon={<CloudOffIcon className="size-5" />}>
          <span className="nums">{toFaDigits(0)}</span>
        </Stat>

        {/* Readable Persian font — the value is a Persian word in Vazirmatn (self-demonstrating) */}
        <Stat label={dict.stats.glyphs} icon={<TypeIcon className="size-5" />}>
          <span className="font-vazir">خوانا</span>
        </Stat>
      </div>
    </section>
  );
}

function Stat({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-reveal="scale-up" className="flex flex-col items-center">
      <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-gold">
        {icon}
      </span>
      <div className="mt-4 font-display text-5xl font-bold text-text md:text-6xl">{children}</div>
      <div className="mt-2 text-sm text-muted">{label}</div>
    </div>
  );
}
