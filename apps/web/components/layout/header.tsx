import Link from "next/link";
import type { Dictionary } from "@/content/dictionaries/types";
import { SITE } from "@/lib/site";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { MobileMenu } from "./mobile-menu";

export function Header({
  dict,
  showNav = true,
  navItems,
}: {
  dict: Dictionary;
  showNav?: boolean;
  navItems?: { href: string; label: string }[];
}) {
  const defaultNav = [
    { href: "/#products", label: dict.nav.tools },
    { href: "/#features", label: dict.nav.features },
    { href: "/#platforms", label: dict.nav.platforms },
    { href: "/#privacy", label: dict.nav.privacy },
    { href: "/#faq", label: dict.nav.faq },
    { href: "/feedback/", label: dict.nav.feedback },
  ];
  const nav = navItems ?? defaultNav;

  return (
    <header className="sticky top-0 z-50 border-b border-hairline/70 bg-bg/80 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-6 md:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label={SITE.name}>
          <span className="grid size-9 place-items-center rounded-lg bg-crimson text-crimson-content">
            <BrandMark className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">{SITE.nameFa}</span>
        </Link>

        {showNav && (
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rounded-lg px-3 py-2 text-sm text-text/70 transition hover:bg-surface-2 hover:text-text"
              >
                {it.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle labels={dict.theme} />
          {showNav && (
            <MobileMenu
              navItems={nav}
              openLabel={dict.actions.openMenu}
              closeLabel={dict.actions.closeMenu}
            />
          )}
        </div>
      </div>
    </header>
  );
}
