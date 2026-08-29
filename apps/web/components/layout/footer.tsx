import Link from "next/link";
import type { Dictionary } from "@/content/dictionaries/types";
import { extensionReleaseStatusFa, extensionVersionLabel } from "@/content/extension-release";
import { SITE } from "@/lib/site";
import { BrandMark } from "@/components/ui/brand-mark";
import { CurrentYear } from "@/components/ui/current-year";
import { FlipLine } from "@/components/ui/flip-line";

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm text-muted">{children}</ul>
    </div>
  );
}

const linkClass = "transition hover:text-text";

export function Footer({ dict }: { dict: Dictionary }) {
  const year = new Date().getFullYear(); // Latin digits

  return (
    <footer className="border-t border-hairline bg-surface-2">
      <div className="mx-auto max-w-content px-6 py-16 md:px-10">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-crimson text-crimson-content">
                <BrandMark className="size-5" />
              </span>
              <span className="font-display text-lg font-semibold">{SITE.nameFa}</span>
            </div>
            <p className="mt-4 max-w-xs text-muted">{dict.footer.tagline}</p>
          </div>

          <FooterCol title={dict.footer.columns.product}>
            <li><Link href="/#features" className={linkClass}>{dict.nav.features}</Link></li>
            <li><Link href="/#platforms" className={linkClass}>{dict.nav.platforms}</Link></li>
            <li><Link href="/#youtube" className={linkClass}>{dict.nav.youtube}</Link></li>
            <li><Link href="/#credits" className={linkClass}>{dict.nav.credits}</Link></li>
          </FooterCol>

          <FooterCol title={dict.footer.columns.resources}>
            <li><Link href="/privacy/" className={linkClass}>{dict.nav.privacy}</Link></li>
            <li><Link href="/changelog/" className={linkClass}>{dict.nav.changelog}</Link></li>
            <li><Link href="/feedback/" className={linkClass}>{dict.nav.feedback}</Link></li>
            <li>
              <a
                href="https://github.com/omega-do-it-solutions/rastchin"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                کد منبع
              </a>
            </li>
          </FooterCol>
        </div>

        <FlipLine className="my-8" pip={false} />

        {/* Centered closing block: ownership, license/trademark policy, and version. */}
        <div className="flex flex-col items-center gap-3 text-center text-sm text-muted">
          <span dir="ltr" className="ltr-token">
            © <CurrentYear fallback={year} /> {SITE.vendor}
          </span>

          <span className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs">
            <a
              href="https://github.com/omega-do-it-solutions/rastchin/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Apache-2.0
            </a>
            <span aria-hidden>·</span>
            <a
              href="https://github.com/omega-do-it-solutions/rastchin/blob/main/TRADEMARK.md"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              نام و نشان RastChin محفوظ است
            </a>
          </span>

          <span className="text-xs text-muted/80">
            <span className="nums ltr-token">{extensionVersionLabel()}</span>
            <span className="mx-1.5">·</span>
            {extensionReleaseStatusFa()}
          </span>
        </div>
      </div>
    </footer>
  );
}
