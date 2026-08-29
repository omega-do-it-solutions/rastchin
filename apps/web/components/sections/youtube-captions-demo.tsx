"use client";

import { useState } from "react";
import { captionConfig } from "@/content/captions";
import type { Dictionary } from "@/content/dictionaries/types";
import { Eyebrow } from "@/components/ui/section";

type CaptionSize = (typeof captionConfig.sizes)[number];
type CaptionColor = (typeof captionConfig.colors)[number]["hex"];

const captionSizePercent: Record<CaptionSize, number> = {
  small: 100,
  medium: 120,
};

const previewBasePx = 15;
const beforeText = "نمونه زیرنویس فارسی برای YouTube است?";
const youtubeActionClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#26262f] px-2.5 font-sans text-[11px] font-bold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
const youtubeIconClass = "size-4 shrink-0 stroke-[2.2]";

function ThumbsUpIcon() {
  return (
    <svg className={youtubeIconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.25 10.2v9.15M7.25 10.2l4.55-6.3c.44-.62 1.42-.3 1.42.47v3.82h4.36c1.45 0 2.53 1.33 2.24 2.75l-1.05 5.18a3.03 3.03 0 0 1-2.97 2.43H7.25M7.25 10.2H4.8c-.86 0-1.55.69-1.55 1.55v6.05c0 .86.69 1.55 1.55 1.55h2.45"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg className={youtubeIconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.75 13.8V4.65M16.75 13.8l-4.55 6.3c-.44.62-1.42.3-1.42-.47v-3.82H6.42c-1.45 0-2.53-1.33-2.24-2.75l1.05-5.18A3.03 3.03 0 0 1 8.2 5.45h8.55M16.75 13.8h2.45c.86 0 1.55-.69 1.55-1.55V6.2c0-.86-.69-1.55-1.55-1.55h-2.45"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className={youtubeIconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.05 7.2V4.3c0-.73.87-1.1 1.39-.6l8.34 7.93c.35.33.35.89 0 1.22l-8.34 7.93c-.52.5-1.39.13-1.39-.6v-3.2c-2.2.08-4.05.76-5.55 2.03-.6.51-1.48-.07-1.23-.82 1.2-3.7 3.45-8.55 6.78-10.99Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className={youtubeIconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.3 4.25h11.4c.75 0 1.35.6 1.35 1.35v14.35c0 .67-.75 1.06-1.29.67L12 16.45l-5.76 4.17c-.54.39-1.29 0-1.29-.67V5.6c0-.75.6-1.35 1.35-1.35Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThanksIcon() {
  return (
    <svg className={youtubeIconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20.15S4.2 15.7 4.2 9.6c0-2.42 1.92-4.35 4.24-4.35 1.42 0 2.72.72 3.56 1.84.84-1.12 2.14-1.84 3.56-1.84 2.32 0 4.24 1.93 4.24 4.35 0 6.1-7.8 10.55-7.8 10.55Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.15v5.2M10.25 10.2c.35-.58.9-.88 1.75-.88.95 0 1.75.5 1.75 1.33 0 1.75-3.5 1.1-3.5 2.92 0 .78.72 1.26 1.75 1.26.78 0 1.4-.28 1.82-.82"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

export function YouTubeCaptionsDemo({ labels }: { labels: Dictionary["youtube"] }) {
  const [enabled, setEnabled] = useState(true);
  const [selectedSize, setSelectedSize] = useState<CaptionSize>(captionConfig.sizeDefault);
  const [selectedColor, setSelectedColor] = useState<CaptionColor>(captionConfig.defaultColor);

  const sizeLabels: Record<CaptionSize, string> = {
    small: labels.smallLabel,
    medium: labels.mediumLabel,
  };

  const previewFontSize = `${(captionSizePercent[selectedSize] / 100) * previewBasePx}px`;
  const stateLabel = enabled ? "با راست‌چین" : "بدون راست‌چین";

  return (
    <div className="grid min-w-0 items-center gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <div data-reveal-stagger className="min-w-0 max-w-full lg:order-2 lg:max-w-xl">
        <div data-reveal>
          <Eyebrow>{labels.eyebrow}</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          {labels.title}
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted text-pretty">
          {labels.body}
        </p>
        <button
          data-reveal
          type="button"
          aria-pressed={enabled}
          aria-label={`${enabled ? "خاموش کردن" : "روشن کردن"} ${labels.toggleLabel}`}
          onClick={() => setEnabled((value) => !value)}
          className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crimson/20"
        >
          <span
            className={[
              "relative inline-flex h-5 w-9 shrink-0 items-center overflow-hidden rounded-full transition-colors",
              enabled ? "bg-[#b42345]" : "bg-[#c8cbc3]",
            ].join(" ")}
            aria-hidden
          >
            <span
              className={[
                "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
                enabled ? "translate-x-4" : "translate-x-0",
              ].join(" ")}
            />
          </span>
          <span>{labels.toggleLabel}</span>
          <span className="text-muted">· {stateLabel}</span>
        </button>
      </div>

      <div data-reveal="slide-end" className="mx-auto min-w-0 max-w-full lg:order-1 lg:w-full lg:max-w-[620px]">
        <div className="overflow-hidden rounded-2xl border border-[#2a2a32] bg-[#0f0f13] p-2 shadow-2xl shadow-black/20">
          <div
            className="flex min-h-10 items-center gap-3 px-2 pb-2 text-white/90"
            dir="ltr"
            aria-hidden
          >
            <span className="grid size-7 place-items-center rounded-md text-white/80">
              <span className="h-0.5 w-4 rounded bg-current shadow-[0_5px_0_current,0_-5px_0_current]" />
            </span>
            <span className="inline-flex items-center gap-1.5 font-sans text-sm font-bold">
              <span className="grid h-4 w-6 place-items-center rounded bg-[#ff0033]">
                <span className="ml-0.5 h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-white" />
              </span>
              YouTube
            </span>
            <div className="mx-auto hidden h-8 w-[42%] max-w-56 items-center rounded-full border border-white/10 bg-black/50 px-3 text-xs text-white/35 sm:flex">
              Search
            </div>
            <span className="grid size-8 place-items-center rounded-full bg-white/[.08] text-sm">⌕</span>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-xl bg-[#121216]">
            <div
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_16%_36%,rgba(255,255,255,0.18),transparent_30%),radial-gradient(ellipse_at_70%_24%,rgba(40,130,118,0.34),transparent_34%),radial-gradient(ellipse_at_83%_73%,rgba(180,35,69,0.24),transparent_30%),linear-gradient(110deg,#1c2028_0%,#2a2630_34%,#172e32_62%,#16151b_100%)]"
              aria-hidden
            />
            <div
              className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent_26%,transparent_70%,rgba(255,255,255,0.06)),linear-gradient(180deg,rgba(0,0,0,0.08),transparent_48%,rgba(0,0,0,0.45))]"
              aria-hidden
            />
            <div
              className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:34px_34px]"
              aria-hidden
            />
            <span
              className={[
                "absolute right-3 top-3 rounded-full px-2.5 py-1 font-vazir text-xs font-semibold shadow-lg shadow-black/20",
                enabled ? "bg-[#b42345] text-white" : "bg-white/[.12] text-white/75",
              ].join(" ")}
            >
              {stateLabel}
            </span>
            <div
              className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/50 via-black/18 to-transparent"
              aria-hidden
            />
            <div
              className="absolute bottom-[10%] left-[8%] h-1.5 w-[84%] overflow-visible rounded-full bg-white/[.24]"
              dir="ltr"
              aria-hidden
            >
              <div className="relative h-full w-[62%] rounded-full bg-[#ff0033]">
                <span className="absolute right-0 top-1/2 size-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#ff0033] shadow-[0_0_0_2px_rgba(255,255,255,0.16)]" />
              </div>
            </div>
            <div
              className="absolute bottom-[3.5%] right-[8%] flex items-center gap-2 text-[10px] font-semibold text-white/70"
              dir="ltr"
              aria-hidden
            >
              <span className="grid size-4 place-items-center rounded border border-white/25">□</span>
              <span className="grid size-4 place-items-center rounded border border-white/25">⚙</span>
              <span className="rounded border border-white/30 px-1 leading-4">CC</span>
              <span>0:42</span>
            </div>

            <div className="absolute inset-x-4 bottom-[20%] flex justify-center">
              {enabled ? (
                <span
                  className="max-w-full rounded-md bg-[rgba(8,8,8,0.78)] px-2.5 py-px text-center font-vazir font-semibold leading-[1.6] [overflow-wrap:anywhere]"
                  dir="rtl"
                  style={{ color: selectedColor, fontSize: previewFontSize }}
                >
                  {labels.previewText}
                </span>
              ) : (
                <span
                  className="max-w-[78%] rounded-sm bg-black/55 px-2 py-0.5 text-left text-[13px] leading-snug text-white/85 [overflow-wrap:anywhere]"
                  dir="ltr"
                  style={{
                    fontFamily:
                      'system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif',
                  }}
                >
                  {beforeText}
                </span>
              )}
            </div>
          </div>

          <div className="px-2 pb-2 pt-2.5 text-white" dir="ltr" aria-hidden>
            <div className="flex min-w-0 items-center gap-1.5 max-sm:flex-wrap sm:flex-nowrap">
              <div className="size-7 shrink-0 rounded-full bg-[linear-gradient(135deg,#087568,#2dd4bf)]" />
              <div className="min-w-0 shrink-0 whitespace-nowrap font-sans text-[11px] font-semibold leading-none text-white/90">
                <span>RastChin</span>
                <span className="ml-1.5 font-normal text-white/55">24.5K subscribers</span>
              </div>
              <span className="grid h-7 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xs text-white/85">
                ◔
              </span>
              <div className="ml-auto flex max-w-full shrink-0 flex-nowrap justify-end gap-1.5 max-sm:order-4 max-sm:ml-0 max-sm:mt-1.5 max-sm:w-full max-sm:flex-wrap max-sm:justify-start max-sm:pb-0.5">
                <span className="inline-flex h-8 shrink-0 overflow-hidden rounded-full bg-[#26262f] font-sans text-[11px] font-bold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <span className="inline-flex items-center gap-1.5 px-2.5">
                    <ThumbsUpIcon />
                    <span className="tabular-nums">102</span>
                  </span>
                  <span className="my-2 w-px bg-white/15" />
                  <span className="inline-flex w-9 items-center justify-center">
                    <ThumbsDownIcon />
                  </span>
                </span>
                <span className={youtubeActionClass}>
                  <ShareIcon />
                  <span>Share</span>
                </span>
                <span className={youtubeActionClass}>
                  <SaveIcon />
                  <span>Save</span>
                </span>
                <span className={youtubeActionClass}>
                  <ThanksIcon />
                  <span>Thanks</span>
                </span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#26262f] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <MoreIcon />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-3 w-full max-w-[430px] rounded-xl border border-[#dedfd9] bg-white p-3 shadow-xl shadow-black/5">
          <h3 className="mb-2 text-[12.5px] font-bold text-[#343432]">زیرنویس یوتیوب</h3>

          <div className="mt-2.5 flex gap-2.5">
            <div
              className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-[#dedfd9] bg-[#f0f3f2]"
              role="group"
              aria-label="اندازهٔ زیرنویس"
            >
              {captionConfig.sizes.map((size) => {
                const pressed = selectedSize === size;

                return (
                  <button
                    key={size}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={pressed}
                    aria-label={`اندازه ${sizeLabels[size]}`}
                    title={sizeLabels[size]}
                    onClick={() => setSelectedSize(size)}
                    className={[
                      "inline-flex min-h-8 min-w-0 flex-1 items-center justify-center border-0 border-s border-[#dedfd9] px-2 text-[13px] transition-colors duration-150 first:border-s-0 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#fff,inset_0_0_0_4px_#b42345]",
                      enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                      pressed ? "bg-[#b42345] text-white" : "bg-transparent text-[#343432]",
                      enabled && !pressed ? "hover:bg-[#fbfcfa]" : "",
                    ].join(" ")}
                  >
                    <b
                      className={[
                        "font-sans font-extrabold leading-none",
                        size === "small" ? "text-[0.82em]" : "text-[1.1em]",
                      ].join(" ")}
                    >
                      A
                    </b>
                  </button>
                );
              })}
            </div>

            <div
              className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-[#dedfd9] bg-[#f0f3f2]"
              role="group"
              aria-label="رنگ زیرنویس"
            >
              {captionConfig.colors.map((color) => {
                const pressed = selectedColor === color.hex;
                const label = color.hex === "#ffd400" ? labels.yellowLabel : labels.whiteLabel;

                return (
                  <button
                    key={color.hex}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={pressed}
                    aria-label={`رنگ ${label}`}
                    title={label}
                    onClick={() => setSelectedColor(color.hex)}
                    className={[
                      "inline-flex min-h-8 min-w-0 flex-1 items-center justify-center border-0 border-s border-[#dedfd9] px-2 transition-colors duration-150 first:border-s-0 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#fff,inset_0_0_0_4px_#b42345]",
                      enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                      pressed ? "bg-[#b42345]" : "bg-transparent",
                      enabled && !pressed ? "hover:bg-[#fbfcfa]" : "",
                    ].join(" ")}
                  >
                    <span
                      className="size-3.5 rounded-full shadow-[0_0_0_1.5px_rgba(0,0,0,0.42)]"
                      style={{ backgroundColor: color.hex }}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
