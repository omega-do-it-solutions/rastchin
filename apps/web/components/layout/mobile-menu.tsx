"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon, CloseIcon } from "@/components/ui/icons";

type NavItem = { href: string; label: string };

export function MobileMenu({
  navItems,
  openLabel,
  closeLabel,
}: {
  navItems: NavItem[];
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? closeLabel : openLabel}
        aria-expanded={open}
        className="grid size-10 place-items-center rounded-lg border border-hairline text-text/75 transition hover:bg-surface-2"
      >
        {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full border-b border-hairline bg-bg/95 px-6 py-3 backdrop-blur-md">
          <nav className="flex flex-col">
            {navItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-base text-text/80 transition hover:bg-surface-2 hover:text-text"
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
