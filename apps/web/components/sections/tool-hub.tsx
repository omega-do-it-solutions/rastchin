import Image from "next/image";
import Link from "next/link";
import { desktopProducts, productBySlug } from "@/content/products";
import { vscodeExtensionRelease } from "@/content/vscode-extension";
import { ArrowIcon, BrowserIcon, CheckIcon } from "@/components/ui/icons";
import { Eyebrow, Section } from "@/components/ui/section";
import { PlatformLogo } from "@/components/ui/platform-logo";

const browser = productBySlug.browser;
const vscode = productBySlug["vscode-rtl"];

export function ToolHub() {
  return (
    <Section id="products" className="border-y border-hairline bg-surface/55">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div data-reveal-stagger className="max-w-3xl">
          <div data-reveal>
            <Eyebrow>محصولات RastChin</Eyebrow>
          </div>
          <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-5xl">
            یک هسته RTL، برای هرجایی که کار می‌کنی
          </h2>
          <p data-reveal className="mt-4 text-lg leading-8 text-muted text-pretty">
            امروز در مرورگر، VS Code و اپ‌های دسکتاپ ChatGPT و Codex. هر ابزار برای ساختار همان محیط طراحی می‌شود تا فارسی خوانا و بخش‌های فنی سالم بمانند.
          </p>
        </div>

        <div data-reveal className="flex items-center gap-3 rounded-full border border-green/20 bg-green/[0.06] px-4 py-2 text-sm text-muted">
          <span className="size-2 rounded-full bg-green shadow-[0_0_0_5px_rgb(var(--green)/0.1)]" aria-hidden />
          سه ابزار در یک ریپوی عمومی
        </div>
      </div>

      <div className="mt-12 grid auto-rows-fr gap-5 lg:grid-cols-2">
        <article data-reveal="slide-start" className="group relative overflow-hidden rounded-2xl border border-hairline bg-bg/75 p-6 transition-colors hover:border-crimson/35 md:p-8">
          <div className="pointer-events-none absolute -start-16 -top-20 size-56 rounded-full bg-blue/[0.08] blur-3xl" aria-hidden />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-blue/10 text-blue">
                <BrowserIcon className="size-7" />
              </span>
              <span className="rounded-full border border-green/20 bg-green/[0.07] px-3 py-1 text-xs font-medium text-green">
                محصول اصلی
              </span>
            </div>

            <p className="mt-7 text-sm text-muted">{browser.label}</p>
            <h3 className="mt-2 text-2xl font-bold md:text-3xl">{browser.name}</h3>
            <p className="mt-4 grow leading-8 text-muted">{browser.summary}</p>

            <ul className="mt-6 space-y-2.5 text-sm text-text/80">
              {browser.highlights.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CheckIcon className="mt-1 size-4 shrink-0 text-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              href={browser.ctaHref ?? browser.href}
              className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-crimson/35 hover:text-crimson"
            >
              {browser.ctaLabel}
              <ArrowIcon className="size-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </article>

        <article data-reveal="slide-end" className="group relative overflow-hidden rounded-2xl border border-crimson/25 bg-crimson/[0.045] p-6 transition-colors hover:border-crimson/50 md:p-8">
          <div className="pointer-events-none absolute -end-20 -top-20 size-64 rounded-full bg-crimson/[0.14] blur-3xl" aria-hidden />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <Image
                src="/brand/rastchin-vscode-icon.png"
                alt=""
                width={56}
                height={56}
                className="size-14 rounded-2xl shadow-lg shadow-crimson/10"
              />
              <span className="ltr-token rounded-full border border-crimson/20 bg-crimson/[0.07] px-3 py-1 text-[11px] text-crimson" dir="ltr">
                v{vscodeExtensionRelease.version}
              </span>
            </div>

            <p className="mt-7 text-sm text-muted">{vscode.label}</p>
            <h3 className="mt-2 text-2xl font-bold md:text-3xl" dir="ltr">{vscode.name}</h3>
            <p className="mt-4 grow leading-8 text-muted">{vscode.summary}</p>

            <ul className="mt-6 space-y-2.5 text-sm text-text/80">
              {vscode.highlights.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CheckIcon className="mt-1 size-4 shrink-0 text-crimson" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              href={vscode.href}
              className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl bg-crimson px-4 py-2.5 text-sm font-semibold text-crimson-content transition hover:-translate-y-0.5 hover:bg-crimson-pressed hover:text-crimson-pressed-content"
            >
              {vscode.ctaLabel}
              <ArrowIcon className="size-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </article>
      </div>

      <div className="mt-5 grid auto-rows-fr gap-5 lg:grid-cols-2">
        {desktopProducts.map((product) => (
          <article
            key={product.id}
            data-reveal
            className={`relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 ${product.availability === "stable"
              ? "border-green/20 bg-green/[0.035]"
              : "border-dashed border-hairline bg-surface/35"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <PlatformLogo id={product.platformLogo} name={product.name} className="size-12" />
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${product.availability === "stable"
                ? "border-green/20 bg-green/[0.06] text-green"
                : "border-warn/20 bg-warn/[0.06] text-warn"
              }`}>
                {product.status}
              </span>
            </div>
            <p className="mt-6 text-xs text-muted">{product.label}</p>
            <h3 className="mt-2 text-xl font-semibold" dir="ltr">{product.name}</h3>
            <p className="mt-3 grow leading-7 text-muted">{product.summary}</p>
            <p className="mt-6 border-t border-hairline pt-4 text-xs leading-6 text-muted">
              {product.note}
            </p>
            {product.href ? (
              <a
                href={product.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex w-fit items-center gap-2 text-sm font-semibold text-text transition hover:text-crimson"
              >
                مشاهدهٔ سورس
                <ArrowIcon className="size-4" />
              </a>
            ) : null}
          </article>
        ))}
      </div>

      <div data-reveal className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-hairline bg-bg/60 px-5 py-4 text-sm text-muted">
        <p>
          محصول مشترک همه نسخه‌ها: تشخیص دقیق فارسی، فونت خوانا و محافظت از کد و لینک.
        </p>
        <Link href="/feedback/" className="inline-flex items-center gap-2 font-semibold text-text transition hover:text-crimson">
          پیشنهاد محیط بعدی
          <ArrowIcon className="size-4" />
        </Link>
      </div>
    </Section>
  );
}
