import Image from "next/image";
import type { Dictionary } from "@/content/dictionaries/types";
import { vscodeExtensionFaq, vscodeExtensionRelease } from "@/content/vscode-extension";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ScrollProvider } from "@/components/scroll/scroll-provider";
import { Accordion } from "@/components/ui/accordion";
import { Eyebrow, Section } from "@/components/ui/section";
import {
  CheckIcon,
  CodeIcon,
  GridIcon,
  LockIcon,
  ShieldIcon,
  SlidersIcon,
  TypeIcon,
} from "@/components/ui/icons";
import { VscodeInstallCta } from "./vscode-install-cta";

const NAV_ITEMS = [
  { href: "#surfaces", label: "پشتیبانی" },
  { href: "#features", label: "امکانات" },
  { href: "#activation", label: "فعال‌سازی" },
  { href: "#safety", label: "امنیت" },
  { href: "#faq", label: "پرسش‌ها" },
];

const SURFACES = [
  {
    title: "Markdown Preview",
    label: "رسمی و فوری",
    labelDir: "rtl",
    body: "راست‌چین و Vazirmatn از مسیر رسمی Markdown API، بلافاصله بعد از نصب.",
    icon: TypeIcon,
  },
  {
    title: "Claude Code",
    label: "Chat + Plan",
    labelDir: "ltr",
    body: "پاسخ‌ها، composer، سؤال‌های تعاملی و Plan Preview با حفظ کد و مسیرها.",
    icon: CodeIcon,
  },
  {
    title: "Codex / ChatGPT",
    label: "Agent webview",
    labelDir: "ltr",
    body: "پاسخ‌های کامل یا متوقف‌شده، فهرست‌ها، جدول‌ها و question cardهای فارسی.",
    icon: GridIcon,
  },
] as const;

const FEATURES = [
  {
    title: "تشخیص جهت برای هر بخش",
    body: "هر paragraph، message، list item و table cell مستقل بررسی می‌شود؛ نه کل صفحه با یک جهت ثابت.",
    icon: SlidersIcon,
  },
  {
    title: "LTR امن برای متن فنی",
    body: "کد، command، URL، email، path، terminal و diff در جهت طبیعی و فونت monospace باقی می‌مانند.",
    icon: CodeIcon,
  },
  {
    title: "Vazirmatn داخل افزونه",
    body: "فونت فارسی همراه VSIX است و برای بارگذاری آن download یا network request انجام نمی‌شود.",
    icon: TypeIcon,
  },
  {
    title: "کنترل و بازیابی روشن",
    body: "Patchها قابل بررسی، اعمال دوباره و restore هستند؛ قبل از write هم سازگاری نسخه کنترل می‌شود.",
    icon: ShieldIcon,
  },
] as const;

const ACTIVATION_STEPS = [
  {
    number: "۱",
    title: "افزونه را نصب کن",
    body: "از دکمه مستقیم VS Code یا صفحه Visual Studio Marketplace استفاده کن.",
  },
  {
    number: "۲",
    title: "Apply RTL Patches را انتخاب کن",
    body: "Markdown Preview از قبل فعال است؛ برای Agentها اعلان نصب، plan دقیق تغییرات را آماده می‌کند.",
  },
  {
    number: "۳",
    title: "Plan را تأیید و Reload کن",
    body: "بعد از Apply Patches، در صورت درخواست پنجره را reload کن و پاسخ فارسی Agent را ببین.",
  },
] as const;

function VscodePreview() {
  return (
    <div
      data-reveal="slide-end"
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#18171d] text-[#dedbe2] shadow-2xl shadow-black/30"
      dir="ltr"
    >
      <div className="flex h-10 items-center border-b border-white/10 bg-[#211f27] px-4">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="mx-auto text-[11px] text-white/50">RastChin · Visual Studio Code</span>
      </div>

      <div className="grid min-h-[410px] grid-cols-[44px_1fr]">
        <div className="flex flex-col items-center gap-4 border-r border-white/10 bg-[#1d1b22] py-4 text-white/35">
          <CodeIcon className="size-5 text-[#d4476a]" />
          <GridIcon className="size-5" />
          <TypeIcon className="size-5" />
        </div>

        <div className="min-w-0">
          <div className="flex h-10 items-end border-b border-white/10 px-4 text-[11px] text-white/50">
            <span className="border-b-2 border-[#d4476a] px-3 pb-2 text-white/85">CODEX</span>
            <span className="px-3 pb-2">CHAT</span>
          </div>
          <div className="space-y-5 p-5 md:p-6" dir="rtl">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-md bg-[#d4476a]/15 px-2.5 py-1 text-[11px] text-[#f28da7]">
                RTL · Vazirmatn
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/35" dir="ltr">
                Agent response
              </span>
            </div>

            <div>
              <h3 className="font-vazir text-xl font-bold text-white">پاسخ فارسی، بدون آشفتگی</h3>
              <p className="mt-3 font-vazir text-sm leading-8 text-white/70">
                RastChin جهت متن فارسی را اصلاح می‌کند، اما فایل{" "}
                <code className="ltr-token rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-[#e8c277]">
                  src/patcher.js
                </code>{" "}
                و دستورهای فنی را دست‌نخورده نگه می‌دارد.
              </p>
            </div>

            <ol className="space-y-2.5 pe-5 font-vazir text-sm leading-7 text-white/70">
              <li className="list-decimal">متن فارسی از سمت درست شروع می‌شود.</li>
              <li className="list-decimal">
                دستور <code className="ltr-token text-[#e8c277]">pnpm test</code> همچنان LTR است.
              </li>
              <li className="list-decimal">فهرست و شماره‌ها فونت درست خودشان را حفظ می‌کنند.</li>
            </ol>

            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p className="font-vazir text-sm leading-7 text-white/65">
                سؤال Agent هم با گزینه‌های ترکیبی فارسی و English خوانا باقی می‌ماند.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" dir="ltr">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">Codex</span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">Claude Code</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BeforeAfter() {
  const text = "Update افزونه نباید جهت این جمله فارسی را تغییر دهد.";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <article data-reveal="slide-start" className="overflow-hidden rounded-2xl border border-red/25 bg-red/[0.045]">
        <div className="flex items-center justify-between border-b border-hairline bg-surface-2 px-5 py-3">
          <span className="text-sm font-medium text-red">قبل از RastChin</span>
          <span className="ltr-token text-[11px] text-muted">direction: ltr</span>
        </div>
        <div className="p-6 md:p-8">
          <p
            dir="ltr"
            className="min-h-28 rounded-xl bg-bg/70 p-5 text-left font-sans text-lg leading-8 text-muted"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            {text}
          </p>
        </div>
      </article>

      <article data-reveal="slide-end" className="overflow-hidden rounded-2xl border border-green/25 bg-green/[0.045]">
        <div className="flex items-center justify-between border-b border-hairline bg-surface-2 px-5 py-3">
          <span className="text-sm font-medium text-green">بعد از RastChin</span>
          <span className="ltr-token text-[11px] text-muted">direction: rtl</span>
        </div>
        <div className="p-6 md:p-8">
          <p dir="rtl" className="min-h-28 rounded-xl bg-bg/70 p-5 text-right font-vazir text-lg leading-8 text-text">
            {text}
          </p>
        </div>
      </article>
    </div>
  );
}

export function VscodeExtensionPage({ dict }: { dict: Dictionary }) {
  return (
    <ScrollProvider dir="rtl">
      <Header dict={dict} navItems={NAV_ITEMS} />
      <main>
        <section className="relative overflow-hidden border-b border-hairline bg-surface/55">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle at 82% 18%, rgb(var(--crimson) / 0.16), transparent 31%), radial-gradient(circle at 14% 78%, rgb(var(--blue) / 0.09), transparent 28%)",
            }}
          />
          <div className="relative mx-auto grid max-w-content gap-12 px-6 py-16 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
            <div data-reveal-stagger="fade-up" className="max-w-xl">
              <div data-reveal className="flex items-center gap-4">
                <Image
                  src="/brand/rastchin-vscode-icon.png"
                  alt="آیکن RastChin for VS Code"
                  width={68}
                  height={68}
                  priority
                  className="size-16 rounded-2xl shadow-lg shadow-crimson/15"
                />
                <div>
                  <Eyebrow>افزونه رایگان Visual Studio Code</Eyebrow>
                  <p className="mt-1.5 ltr-token text-xs text-muted" dir="ltr">
                    v{vscodeExtensionRelease.version}
                  </p>
                </div>
              </div>

              <h1 data-reveal className="mt-7 font-display text-4xl font-bold md:text-6xl">
                فارسی، سر جای خودش.
                <span className="mt-1 block text-crimson">داخل VS Code.</span>
              </h1>
              <p data-reveal className="mt-6 text-lg leading-9 text-muted text-pretty">
                RastChin متن فارسی را در Markdown Preview، Claude Code و Codex راست‌چین و خوانا می‌کند؛ بدون این‌که کد، لینک و مسیر فایل‌ها به‌هم بریزند.
              </p>

              <div data-reveal>
                <VscodeInstallCta className="mt-8" />
              </div>

              <div data-reveal className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {["رایگان", "بدون حساب کاربری", "بدون ارسال متن", "Windows · macOS · Linux"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <CheckIcon className="size-4 text-green" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <VscodePreview />
          </div>
        </section>

        <Section id="surfaces">
          <div data-reveal-stagger className="mx-auto max-w-3xl text-center">
            <div data-reveal className="flex justify-center">
              <Eyebrow>یک افزونه، سه محیط</Eyebrow>
            </div>
            <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
              هرجا داخل VS Code فارسی می‌خوانی
            </h2>
            <p data-reveal className="mt-4 text-lg leading-8 text-muted">
              نمایش فارسی برای هر سطح با روش متناسب همان محیط اصلاح می‌شود.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {SURFACES.map((surface) => {
              const Icon = surface.icon;
              return (
                <article key={surface.title} data-reveal className="rounded-2xl border border-hairline bg-surface/70 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-crimson/10 text-crimson">
                      <Icon className="size-6" />
                    </span>
                    <span
                      dir={surface.labelDir}
                      className={surface.labelDir === "ltr"
                        ? "ltr-token rounded-full border border-hairline px-2.5 py-1 text-[10px] text-muted"
                        : "rounded-full border border-hairline px-2.5 py-1 text-[10px] text-muted"
                      }
                    >
                      {surface.label}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold" dir="ltr">{surface.title}</h3>
                  <p className="mt-3 leading-8 text-muted">{surface.body}</p>
                </article>
              );
            })}
          </div>
        </Section>

        <Section id="proof" className="border-y border-hairline bg-surface/45">
          <div data-reveal-stagger className="mb-10 max-w-2xl">
            <div data-reveal><Eyebrow>تفاوتی که دیده می‌شود</Eyebrow></div>
            <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
              RTL برای فارسی؛ LTR برای بخش فنی
            </h2>
            <p data-reveal className="mt-4 text-lg leading-8 text-muted">
              RastChin کل پنل را کورکورانه برعکس نمی‌کند. جهت و فونت فقط جایی تغییر می‌کنند که واقعاً متن فارسی وجود دارد.
            </p>
          </div>
          <BeforeAfter />
        </Section>

        <Section id="features">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div data-reveal-stagger>
              <div data-reveal><Eyebrow>دقیق و محتاط</Eyebrow></div>
              <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
                ساخته‌شده برای متن‌های ترکیبی توسعه‌دهنده‌ها
              </h2>
              <p data-reveal className="mt-5 text-lg leading-8 text-muted">
                پاسخ Agent فقط نثر فارسی نیست؛ command، URL، جدول، diff و فایل هم دارد. RastChin این مرزها را حفظ می‌کند.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} data-reveal className="rounded-2xl border border-hairline bg-surface p-6">
                    <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-gold">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-3 leading-8 text-muted">{feature.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </Section>

        <Section id="activation" className="border-y border-hairline bg-surface/45">
          <div data-reveal-stagger className="mx-auto max-w-3xl text-center">
            <div data-reveal className="flex justify-center"><Eyebrow>شروع امن</Eyebrow></div>
            <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
              از نصب تا اولین پاسخ راست‌چین
            </h2>
            <p data-reveal className="mt-4 text-lg leading-8 text-muted">
              Agentها فقط با تأیید خودت تغییر می‌کنند؛ هیچ patch پنهانی در زمان نصب وجود ندارد.
            </p>
          </div>

          <div className="relative mt-12 grid gap-5 lg:grid-cols-3">
            <div className="absolute inset-x-[16%] top-7 hidden h-px bg-hairline lg:block" aria-hidden />
            {ACTIVATION_STEPS.map((step) => (
              <article key={step.number} data-reveal className="relative rounded-2xl border border-hairline bg-bg p-6">
                <span className="relative grid size-14 place-items-center rounded-full border border-crimson/30 bg-crimson/10 font-display text-xl font-bold text-crimson">
                  {step.number}
                </span>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 leading-8 text-muted">{step.body}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="safety">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div data-reveal="slide-start" className="border-b border-hairline p-7 md:p-10 lg:border-b-0 lg:border-l">
                <span className="grid size-14 place-items-center rounded-2xl bg-green/10 text-green">
                  <LockIcon className="size-7" />
                </span>
                <Eyebrow className="mt-7">اعتماد از داخل محصول</Eyebrow>
                <h2 className="mt-4 font-display text-3xl font-bold md:text-4xl">
                  قبل از هر تغییر، می‌دانی چه اتفاقی می‌افتد
                </h2>
                <p className="mt-5 leading-8 text-muted">
                  Plan خواندنی، تأیید صریح، backup و rollback بخشی از جریان اصلی‌اند؛ نه توضیحی که بعداً اضافه شده باشد.
                </p>
              </div>

              <div data-reveal-stagger className="grid gap-px bg-hairline sm:grid-cols-2">
                {[
                  ["بدون دست‌کاری VS Code", "workbench.html و product.json هرگز هدف patch نیستند."],
                  ["بدون network request", "متن و prompt شما برای RastChin یا سرویس دیگری ارسال نمی‌شود."],
                  ["Transaction مستقل", "اگر یک write شکست بخورد، تغییرات همان target rollback می‌شوند."],
                  ["Update-aware", "نسخه جدید Agent بدون تأیید دوباره patch نمی‌شود."],
                ].map(([title, body]) => (
                  <article key={title} data-reveal className="bg-bg p-7 md:p-8">
                    <CheckIcon className="size-5 text-green" />
                    <h3 className="mt-4 font-semibold">{title}</h3>
                    <p className="mt-2 leading-7 text-muted">{body}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="border-t border-warn/20 bg-warn/[0.06] px-6 py-4 text-sm leading-7 text-muted">
              <strong className="text-warn">نکته سازگاری:</strong>{" "}
              پنل‌های Agent API رسمی برای styling ندارند. بنابراین یک آپدیت بزرگ Claude Code یا Codex ممکن است تا انتشار adapter سازگار، موقتاً با وضعیت{" "}
              <code className="ltr-token text-warn">UNSUPPORTED</code> نمایش داده شود.
            </div>
          </div>
        </Section>

        <Section id="faq" className="border-y border-hairline bg-surface/45">
          <div className="mx-auto max-w-3xl">
            <div data-reveal-stagger className="text-center">
              <div data-reveal className="flex justify-center"><Eyebrow>پرسش‌های پرتکرار</Eyebrow></div>
              <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
                قبل از نصب چه باید بدانی؟
              </h2>
            </div>
            <div className="mt-10">
              <Accordion items={[...vscodeExtensionFaq]} />
            </div>
          </div>
        </Section>

        <section className="relative overflow-hidden py-20 md:py-28">
          <div className="pointer-events-none absolute inset-0 bg-crimson/[0.035]" aria-hidden />
          <div data-reveal-stagger className="relative mx-auto max-w-3xl px-6 text-center md:px-10">
            <div data-reveal className="flex justify-center">
              <Image
                src="/brand/rastchin-vscode-icon.png"
                alt=""
                width={72}
                height={72}
                className="size-16 rounded-2xl"
              />
            </div>
            <h2 data-reveal className="mt-6 font-display text-3xl font-bold md:text-5xl">
              VS Code را برای فارسی خواناتر کن
            </h2>
            <p data-reveal className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted">
              متن فارسی مرتب، کد سالم و کنترل کامل روی تغییرات Agentها.
            </p>
            <div data-reveal>
              <VscodeInstallCta align="center" className="mt-8" />
            </div>
            <p data-reveal className="mt-5 ltr-token text-xs text-muted" dir="ltr">
              {vscodeExtensionRelease.extensionId}
            </p>
          </div>
        </section>
      </main>
      <Footer dict={dict} />
    </ScrollProvider>
  );
}
