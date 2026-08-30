"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import type { Dictionary } from "@/content/dictionaries/types";
import { Eyebrow } from "@/components/ui/section";
import {
  CheckIcon,
  CloseIcon,
  LockIcon,
  ServerIcon,
} from "@/components/ui/icons";

type PrivacyMode = "content" | "settings" | "permissions";

type ModeCopy = {
  id: PrivacyMode;
  label: string;
  title: string;
  browserNote: string;
  serverNote: string;
  detail: string;
  guarantee: string;
  blockedStatus: string;
  evidence: string[];
};

const modes: ModeCopy[] = [
  {
    id: "content",
    label: "متن و پیام",
    title: "متن و prompt",
    browserNote: "فقط داخل مرورگر پردازش می‌شود",
    serverNote: "به سرورهای ما نمی‌رسد",
    detail: "روی دستگاه می‌ماند و به سرورهای ما نمی‌رسد.",
    guarantee: "پیام، prompt و متن به سرورهای ما نمی‌رسد.",
    blockedStatus: "ارسال بسته است",
    evidence: ["روی دستگاه", "بدون ارسال", "بدون ذخیره سروری"],
  },
  {
    id: "settings",
    label: "تنظیمات",
    title: "ترجیحات افزونه",
    browserNote: "در مرورگر ذخیره می‌شود",
    serverNote: "در پایگاه داده ما ذخیره نمی‌شود",
    detail: "فقط در storage مرورگر ذخیره می‌شود.",
    guarantee: "تنظیمات فقط روی مرورگر شما ذخیره می‌شود.",
    blockedStatus: "سرور ندارد",
    evidence: ["storage مرورگر", "بدون حساب کاربری", "بدون دیتابیس"],
  },
  {
    id: "permissions",
    label: "دسترسی‌ها",
    title: "activeTab و storage",
    browserNote: "فقط برای عملکرد افزونه استفاده می‌شود",
    serverNote: "دسترسی آزاد به سایت‌ها نداریم",
    detail: "فقط تب فعلی و storage؛ محتوای سایت‌ها به سرورهای ما نمی‌رسد.",
    guarantee: "دسترسی‌ها فقط activeTab و storage است.",
    blockedStatus: "دسترسی آزاد نیست",
    evidence: ["activeTab", "storage", "بدون دسترسی آزاد"],
  },
];

function getBrowserVisual(mode: PrivacyMode) {
  if (mode === "settings") {
    return (
      <div className="w-full max-w-[11rem] space-y-2.5" aria-hidden>
        {["رنگ", "اندازه"].map((item, index) => (
          <div
            key={item}
            className="flex h-9 items-center justify-between rounded-lg border border-hairline bg-bg/80 px-2"
          >
            <span className="text-[10px] font-medium text-muted">{item}</span>
            <span
              className={clsx(
                "relative h-3.5 w-8 rounded-full",
                index === 1 ? "bg-crimson" : "bg-surface-2",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 size-2.5 rounded-full bg-white shadow-sm",
                  index === 1 ? "end-0.5 privacy-local-pulse" : "start-0.5",
                )}
              />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (mode === "permissions") {
    return (
      <div className="grid w-full max-w-[11rem] grid-cols-2 gap-2" aria-hidden>
        {["activeTab", "storage"].map((item) => (
          <span
            key={item}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-green/25 bg-green/[0.08] px-2 text-[10px] font-semibold text-green"
          >
            <CheckIcon className="size-3.5" />
            {item}
          </span>
        ))}
        <span className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-red/25 bg-red/[0.06] px-2 text-[10px] font-semibold text-red">
          <CloseIcon className="size-3.5" />
          دسترسی آزاد به سایت‌ها
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[11rem] space-y-2" aria-hidden>
      <span className="block h-9 rounded-xl border border-hairline bg-bg/80 px-3 py-2 privacy-local-pulse">
        <span className="block h-1.5 w-28 rounded-full bg-muted/35" />
        <span className="mt-2 block h-1.5 w-16 rounded-full bg-muted/20" />
      </span>
      <span className="block h-9 rounded-xl border border-hairline bg-bg/80 px-3 py-2">
        <span className="block h-1.5 w-20 rounded-full bg-muted/25" />
        <span className="mt-2 block h-1.5 w-24 rounded-full bg-muted/20" />
      </span>
    </div>
  );
}

export function PrivacyDemo({
  privacy,
}: {
  privacy: Dictionary["privacy"];
}) {
  const [selectedMode, setSelectedMode] = useState<PrivacyMode>("content");
  const activeMode = modes.find((mode) => mode.id === selectedMode) ?? modes[0];

  return (
    <div className="grid min-w-0 items-center gap-12 lg:grid-cols-2">
      <div data-reveal-stagger className="min-w-0 max-w-xl">
        <div data-reveal>
          <Eyebrow>{privacy.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {privacy.title}
        </h2>

        <div
          data-reveal
          className="mt-6 grid max-w-full grid-cols-3 border-b border-hairline sm:inline-grid sm:min-w-[24rem]"
          role="tablist"
          aria-label="نمایش حریم خصوصی"
        >
          {modes.map((mode) => {
            const active = activeMode.id === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedMode(mode.id)}
                className={clsx(
                  "relative min-h-11 px-2 pb-3 pt-2 text-sm font-medium transition after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-crimson after:transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crimson/20 sm:px-4",
                  active
                    ? "text-text after:scale-x-100"
                    : "text-muted hover:text-text",
                )}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        <ul data-reveal className="mt-6 space-y-1.5">
          {modes.map((mode) => {
            const active = mode.id === activeMode.id;

            return (
              <li
                key={mode.id}
                className="min-w-0"
              >
                <button
                  type="button"
                  onClick={() => setSelectedMode(mode.id)}
                  className={clsx(
                    "flex w-full min-w-0 gap-2.5 rounded-lg border px-3 py-1.5 text-start text-sm leading-6 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crimson/20",
                    active
                      ? "border-green/30 bg-green/[0.07] text-text"
                      : "border-transparent text-muted hover:bg-surface-2/60",
                  )}
                >
                  <CheckIcon
                    className={clsx(
                      "mt-0.5 size-5 shrink-0",
                      active ? "text-green" : "text-green/75",
                    )}
                  />
                  <span className={clsx(active ? "font-medium" : "text-muted")}>
                    {mode.guarantee}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        data-reveal="scale-up"
        className="grid h-[40rem] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-clip rounded-2xl border border-hairline bg-surface p-4 shadow-xl shadow-black/5 sm:h-[25rem] sm:p-6 lg:h-[25.5rem] lg:p-8"
      >
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-bg px-3 py-1.5 text-sm font-medium">
            <LockIcon className="size-4 text-green" />
            <span>{activeMode.label}</span>
          </div>
          <span className="rounded-full bg-green/[0.1] px-3 py-1.5 text-xs font-semibold text-green">
            چیزی به راست‌چین ارسال نمی‌شود
          </span>
        </div>

        <div className="grid min-h-0 items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)]">
          <div className="relative flex min-h-44 min-w-0 overflow-hidden flex-col items-center justify-center gap-2.5 rounded-2xl border border-gold/30 bg-gold/[0.07] p-4 text-center shadow-inner shadow-gold/5 sm:min-h-0 sm:p-5">
            <span className="text-sm font-semibold">{activeMode.title}</span>
            {getBrowserVisual(activeMode.id)}
            <span className="min-h-10 text-xs leading-relaxed text-muted">{activeMode.browserNote}</span>
          </div>

          <div className="grid min-h-16 min-w-0 place-items-center sm:min-h-0">
            <span className="privacy-blocker" aria-hidden>
              <span className="grid size-9 place-items-center rounded-full border border-red/35 bg-bg text-red shadow-sm">
                <CloseIcon className="size-4" />
              </span>
            </span>
            <span className="mt-2 text-center text-[11px] font-semibold leading-4 text-red sm:mt-3">
              {activeMode.blockedStatus}
            </span>
          </div>

          <div
            className="flex min-h-[8.5rem] min-w-0 flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-hairline bg-bg/35 p-4 text-center opacity-65 sm:min-h-0 sm:p-5"
          >
            <ServerIcon className="size-7 text-muted" />
            <span className="text-sm font-medium text-muted">سرورهای راست‌چین</span>
            <span className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
              ۰ دریافت
            </span>
            <span className="min-h-10 text-xs leading-relaxed text-muted">{activeMode.serverNote}</span>
          </div>
        </div>

        <div className="min-h-[84px] rounded-2xl border border-hairline bg-bg/70 p-3.5">
          <div className="grid h-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <LockIcon className="size-5 shrink-0 text-green" />
              <p className="text-sm leading-6 text-muted">{activeMode.detail}</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:w-[15rem]">
              {activeMode.evidence.map((item) => (
                <span
                  key={item}
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-hairline bg-surface px-2 text-center text-[10px] font-semibold leading-4 text-muted"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
