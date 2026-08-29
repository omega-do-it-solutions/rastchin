"use client";

import { useState } from "react";
import { ChevronIcon } from "@/components/ui/icons";

type Item = { id: string; q: string; a: string };

export function Accordion({ items }: { items: Item[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
      {items.map((it) => {
        const isOpen = openId === it.id;
        return (
          <div key={it.id} data-reveal="clip-reveal">
            <h3>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : it.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start"
              >
                <span className="font-medium">{it.q}</span>
                <ChevronIcon
                  className={`size-5 shrink-0 text-muted transition-transform duration-300 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </h3>
            <div
              className={`grid transition-all duration-300 ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 leading-relaxed text-muted">{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
