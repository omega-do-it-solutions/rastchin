import type { Metadata } from "next";
import { dir, htmlLang, ogLocale } from "@/lib/i18n/config";
import { fa as dict } from "@/content/dictionaries/fa";
import { SITE } from "@/lib/site";
import { JsonLd } from "@/lib/seo/jsonld";
import { extensionVersionLabel } from "@/content/extension-release";

import { ScrollProvider } from "@/components/scroll/scroll-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/hero/hero";
import { Marquee } from "@/components/sections/marquee";
import { PlatformsWall } from "@/components/sections/platforms-wall";
import { Browsers } from "@/components/sections/browsers";
import { Stats } from "@/components/sections/stats";
import { YouTubeCaptions } from "@/components/sections/youtube-captions";
import { Privacy } from "@/components/sections/privacy";
import { Credits } from "@/components/sections/credits";
import { FinalCta } from "@/components/sections/final-cta";
import { ToolHub } from "@/components/sections/tool-hub";
import { Section, Eyebrow } from "@/components/ui/section";
import {
  ArrowIcon,
  BrowserIcon,
  CodeIcon,
  ShieldIcon,
  TypeIcon,
  SlidersIcon,
} from "@/components/ui/icons";

const FEATURE_ICONS = {
  chat: BrowserIcon,
  mixed: CodeIcon,
  font: TypeIcon,
  privacy: ShieldIcon,
  control: SlidersIcon,
};

const featureCards = [
  {
    id: "chat",
    title: "فارسی خوانا در ChatGPT و Claude",
    body: "پاسخ‌های فارسی مرتب‌تر دیده می‌شوند و متن‌های بلند راحت‌تر خوانده می‌شوند.",
  },
  {
    id: "mixed",
    title: "کد و لینک سالم می‌ماند",
    body: "URL، ایمیل و قطعه‌کد به جهت اشتباه هل داده نمی‌شوند.",
  },
  {
    id: "font",
    title: "فونت فارسی بهتر می‌شود",
    body: "Vazirmatn متن فارسی را نرم‌تر، تمیزتر و طبیعی‌تر نشان می‌دهد.",
  },
  {
    id: "privacy",
    title: "متن‌ها به سرور نمی‌روند",
    body: "پردازش نمایش در مرورگر انجام می‌شود؛ prompt و پیام ارسال نمی‌شود.",
  },
  {
    id: "control",
    title: "برای هر سایت جدا کنترل داری",
    body: "روی ChatGPT روشن کن، روی سایت دیگر خاموش نگه دار.",
  },
] as const;

const installSteps = [
  {
    step: "۱",
    title: "افزونه را به مرورگر اضافه کن",
    body: "نصبش بیشتر از چند ثانیه طول نمی‌کشد و نیاز به حساب کاربری یا تنظیمات عجیب ندارد.",
  },
  {
    step: "۲",
    title: "ChatGPT، Claude یا سایت دلخواهت را باز کن",
    body: "همان‌جا می‌بینی متن‌های فارسی مرتب‌تر شده‌اند و لازم نیست چیزی را دستی راست‌چین کنی.",
  },
  {
    step: "۳",
    title: "اگر لازم بود، سایت‌به‌سایت تنظیمش کن",
    body: "می‌توانی برای هر محیط جدا تصمیم بگیری که فقط فونت بهتر شود یا پشتیبانی کامل‌تری بگیری.",
  },
] as const;

const pageDict = {
  ...dict,
  platforms: {
    ...dict.platforms,
    eyebrow: "پوشش پلتفرم‌ها",
    title: "فارسی در چت با هوش مصنوعی و ابزارهای روزمره",
    sub: "از ChatGPT و Claude تا Gemini، GitHub، Notion، Gmail، Google Translate و YouTube؛\nراست‌چین کمک می‌کند متن فارسی را در ابزارهای روزمره‌ات راحت‌تر بخوانی.",
  },
  browsers: {
    ...dict.browsers,
    eyebrow: "افزونه فارسی مرورگر",
    title: "Chrome تنها انتخابت نیست",
    sub: "اگر مرورگرت افزونه‌های Chrome را نصب می‌کند، راست‌چین هم می‌تواند متن فارسی را در ChatGPT و ابزارهای روزمره خواناتر کند.",
    more: "قابل استفاده روی Chrome، Edge، Brave، Opera، Vivaldi و مرورگرهای Chromium مشابه",
  },
  finalCta: {
    title: "متن فارسی در {tool} به‌هم می‌ریزد؟\nراست‌چینش کن.",
    sub: "رایگان، ساده و بدون ارسال متن به سرور",
  },
} as const;

const finalCtaTools = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Copilot",
  "Perplexity",
  "NotebookLM",
  "GitHub",
  "Gmail",
  "Notion",
  "Google Translate",
  "YouTube",
] as const;

const faq = [
  {
    q: "چطور ChatGPT را برای فارسی راست‌چین کنیم؟",
    a: "با نصب راست‌چین، متن‌های فارسی در ChatGPT و ابزارهای مشابه خواناتر می‌شوند و راست‌به‌چپ فقط روی بخش‌های فارسی اعمال می‌شود. کد، لینک، ایمیل و متن انگلیسی در جهت طبیعی خود باقی می‌مانند.",
  },
  {
    q: "آیا راست‌چین فقط روی ChatGPT کار می‌کند؟",
    a: "نه. راست‌چین علاوه بر ChatGPT روی Claude، Gemini، Copilot، Perplexity، NotebookLM، GitHub، Gmail، Notion، Google Translate و YouTube هم برای متن فارسی یا بخش‌های پشتیبانی‌شده کار می‌کند.",
  },
  {
    q: "آیا راست‌چین کردن متن، کدها و لینک‌ها را خراب می‌کند؟",
    a: "هدف راست‌چین برعکس‌کردن کل صفحه نیست. این افزونه طوری طراحی شده که متن‌های ترکیبی فارسی و انگلیسی خواناتر شوند و در عین حال کد، URL، جدول و قطعه‌های فنی به‌هم نریزند.",
  },
  {
    q: "آیا متن‌های من به سرور راست‌چین ارسال می‌شوند؟",
    a: "نه. پردازش نمایش متن در خود مرورگر انجام می‌شود و خود افزونه متن صفحه، پیام‌ها یا promptها را برای سرور راست‌چین ارسال نمی‌کند.",
  },
  {
    q: "روی چه مرورگرهایی می‌توانم از راست‌چین استفاده کنم؟",
    a: "راست‌چین یک افزونه Chromium است و روی Chrome، Edge، Brave، Opera و مرورگرهای مشابه که از افزونه‌های کروم پشتیبانی می‌کنند قابل استفاده است.",
  },
] as const;

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

function softwareAppJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    alternateName: SITE.nameFa,
    applicationCategory: "BrowserApplication",
    operatingSystem: "Chrome, Edge, Brave, Opera, Chromium",
    softwareVersion: SITE.version,
    inLanguage: "fa-IR",
    url: `${SITE.url}/`,
    description:
      "افزونه‌ای برای راست‌چین کردن متن فارسی در ChatGPT، Claude و ابزارهای هوش مصنوعی بدون خراب شدن کد، لینک و متن انگلیسی.",
    publisher: {
      "@type": "Organization",
      name: SITE.vendor,
      url: SITE.url,
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    ...(SITE.storeUrl ? { downloadUrl: SITE.storeUrl } : {}),
  };
}

function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    alternateName: SITE.nameFa,
    url: SITE.url,
    description:
      "راست‌چین افزونه‌ای برای خواناتر کردن متن فارسی در ChatGPT، Claude و محیط‌های انگلیسی است.",
    brand: {
      "@type": "Brand",
      name: SITE.name,
    },
  };
}

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: `${SITE.name} Tools`,
    url: SITE.url,
    inLanguage: "fa-IR",
    description:
      "وب‌سایت راست‌چین برای راست‌چین کردن متن فارسی در چت‌های هوش مصنوعی و محیط‌های انگلیسی.",
  };
}

function webPageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "راست‌چین کردن ChatGPT و Claude برای فارسی",
    url: `${SITE.url}/`,
    inLanguage: "fa-IR",
    isPartOf: {
      "@type": "WebSite",
      name: `${SITE.name} Tools`,
      url: SITE.url,
    },
    about: [
      "راست‌چین کردن ChatGPT",
      "راست‌چین کردن Claude",
      "متن فارسی در ابزارهای هوش مصنوعی",
      "حل مشکل RTL فارسی",
    ],
  };
}

export const metadata: Metadata = {
  title: "RastChin | ابزارهای فارسی برای وب، VS Code و AI",
  description:
    "مجموعه ابزارهای RastChin برای خوانایی فارسی در مرورگر، ChatGPT، Claude و VS Code؛ بدون خراب شدن کد، لینک و متن انگلیسی.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: ogLocale,
    url: "/",
    title: "RastChin؛ فارسی خوانا در مرورگر، VS Code و دسکتاپ",
    description:
      "ابزارهای محلی برای خوانایی فارسی در وب، VS Code و اپ‌های دسکتاپ پشتیبانی‌شدهٔ ChatGPT و Codex.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RastChin؛ فارسی خوانا از مرورگر تا VS Code",
    description:
      "ابزارهای فارسی برای مرورگر، ChatGPT، Claude و VS Code؛ دقیق، محلی و امن برای کد و لینک.",
  },
};

function SeoAnswerSection() {
  const reviewedAt = new Intl.DateTimeFormat(htmlLang, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date("2026-08-29"));

  return (
    <Section id="search-intent" className="border-y border-hairline bg-surface/45">
      <div data-reveal-stagger className="mx-auto max-w-3xl text-center">
        <div data-reveal className="flex justify-center">
          <Eyebrow>راهنمای سریع</Eyebrow>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          چطور ChatGPT را برای فارسی راست‌چین کنیم؟
        </h2>
        <p data-reveal className="mt-5 text-lg leading-relaxed text-muted text-pretty">
          اگر متن فارسی در ChatGPT، Claude یا ابزارهای مشابه از سمت نادرست شروع می‌شود،
          لازم نیست کل صفحه را RTL کنید. راست‌چین فقط بخش‌های فارسی را برای خوانایی بهتر
          اصلاح می‌کند تا جمله‌های ترکیبی، کد، لینک و متن انگلیسی به‌هم نریزند و خواندن
          پاسخ‌ها راحت‌تر شود.
        </p>
        <p data-reveal className="mt-4 text-sm text-muted">
          آخرین بروزرسانی: {reviewedAt}
        </p>
      </div>
    </Section>
  );
}

function LocalProblemSolution() {
  return (
    <>
      <Section id="problem">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div data-reveal-stagger="fade-up">
            <div data-reveal>
              <Eyebrow>مشکل کجاست؟</Eyebrow>
            </div>
            <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
              وقتی فارسی در ابزارهای انگلیسی خسته‌کننده می‌شود
            </h2>
            <p data-reveal className="mt-4 text-lg text-muted text-pretty">
              کسی که دنبال راست‌چین کردن ChatGPT یا Claude می‌گردد، فقط یک چیز می‌خواهد:
              متن فارسی را راحت‌تر بخواند.
            </p>
            <ul data-reveal className="mt-7 space-y-3.5">
              {[
                "جمله‌های فارسی و انگلیسی کنار هم نامرتب دیده می‌شوند.",
                "لینک، ایمیل و کد وسط متن، خواندن را سخت‌تر می‌کنند.",
                "کاربر می‌خواهد متن بهتر شود، نه این‌که کل سایت به‌هم بریزد.",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-muted">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-crimson" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div data-reveal="slide-end" className="rounded-2xl border border-red/30 bg-red/[0.06]">
            <div className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-4 py-3" dir="ltr">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ms-3 h-2 w-40 rounded-full bg-hairline" />
            </div>
            <div className="p-6 md:p-8">
              <p
                className="rounded-2xl rounded-tl-sm bg-surface-2/70 px-5 py-4 text-muted"
                style={{
                  direction: "ltr",
                  textAlign: "left",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                سلام، این متن فارسی است mixed با English و لینک example.com
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["چپ‌چین", "سخت‌خوان", "آشفته"].map((label) => (
                  <span key={label} className="rounded-full bg-red/[0.12] px-3 py-1 text-xs font-medium text-red">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="fix" className="border-y border-hairline bg-surface/40">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div data-reveal="slide-start" className="rounded-2xl border border-green/30 bg-green/[0.06]">
            <div className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-4 py-3" dir="ltr">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ms-3 h-2 w-40 rounded-full bg-hairline" />
            </div>
            <div className="p-6 md:p-8">
              <p
                className="rounded-2xl rounded-tl-sm bg-surface-2/70 px-5 py-4 font-vazir text-text"
                dir="rtl"
                style={{ unicodeBidi: "plaintext" }}
              >
                سلام، این متن فارسی است mixed با English و لینک example.com
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["مرتب", "خوانا", "سالم برای کد و لینک"].map((label) => (
                  <span key={label} className="rounded-full bg-green/[0.12] px-3 py-1 text-xs font-medium text-green">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div data-reveal-stagger="fade-up">
            <div data-reveal>
              <Eyebrow>راه‌حل راست‌چین</Eyebrow>
            </div>
            <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
              همان متن، فقط خواناتر
            </h2>
            <p data-reveal className="mt-4 text-lg text-muted text-pretty">
              راست‌چین متن فارسی را مرتب‌تر نشان می‌دهد، بدون این‌که کد، لینک یا کلمات
              انگلیسی از ریخت بیفتند.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function LocalFeatures() {
  return (
    <Section id="features">
      <div data-reveal-stagger className="mx-auto max-w-2xl text-center">
        <div data-reveal>
          <div className="flex justify-center">
            <Eyebrow>چرا کاربر حس خوبی می‌گیرد؟</Eyebrow>
          </div>
        </div>
        <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
          چون فارسی را خواناتر می‌کند، نه پیچیده‌تر
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted text-pretty">
          راست‌چین برای فارسی در ChatGPT، Claude و ابزارهای روزمره ساخته شده؛ همان‌قدر
          ساده که روشنش می‌کنی، همان‌قدر دقیق که متن را مرتب می‌کند.
        </p>
      </div>

      <div className="mt-12 grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-6">
        {featureCards.map((feature, index) => {
          const Icon = FEATURE_ICONS[feature.id];
          return (
            <article
              key={feature.id}
              data-reveal="fade-up"
              className={`rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-crimson/30 lg:col-span-2${
                index === 3 ? " lg:col-start-2" : ""
              }`}
            >
              <span className="grid size-11 place-items-center rounded-lg bg-surface-2 text-text/80">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2.5 leading-relaxed text-muted">{feature.body}</p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

function LocalInstall() {
  return (
    <Section id="install" className="py-14 md:py-16">
      <div dir="ltr" className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div
          dir="rtl"
          data-reveal="slide-start"
          className="relative order-2 w-full lg:order-1 lg:col-start-1 lg:row-start-1"
        >
          <div className="absolute -inset-4 rounded-[2rem] bg-crimson/[0.07] blur-2xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#f7f7f4] p-3 text-[#14120f] shadow-2xl shadow-black/25">
            <div dir="rtl" className="rounded-[1.15rem] border border-black/10 bg-white shadow-xl shadow-black/10">
              <div className="flex items-center justify-between border-b border-black/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <strong className="font-vazir text-base">راست‌چین</strong>
                  <span className="grid size-7 place-items-center rounded-md bg-crimson text-crimson-content">
                    <ArrowIcon className="size-3.5 rotate-180" />
                  </span>
                </div>
                <span dir="ltr" className="rounded-full border border-black/10 bg-[#f1f3ef] px-3 py-1 text-xs text-[#68716b]">
                  {extensionVersionLabel()}
                </span>
              </div>

              <div className="grid grid-cols-3 border-b border-black/10 text-center text-xs font-medium text-[#555]">
                {["اصلی", "تنظیمات", "تازه‌ها"].map((tab) => (
                  <span
                    key={tab}
                    className={`px-3 py-2.5 ${tab === "اصلی" ? "border-b-2 border-crimson text-crimson" : ""}`}
                  >
                    {tab}
                  </span>
                ))}
              </div>

              <div className="p-3.5">
                <div className="rounded-2xl border border-black/10 bg-white p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-right">
                      <h3 className="font-display text-base font-bold">ChatGPT</h3>
                      <p className="mt-1 text-xs text-[#168360]">راست‌چین برای این ابزار فعال است</p>
                    </div>
                    <button
                      type="button"
                      aria-label="راست‌چین فعال است"
                      className="flex h-6 w-11 items-center justify-end rounded-full bg-crimson p-1"
                    >
                      <span className="size-4 rounded-full bg-white shadow" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["۱۸", "ابزار پشتیبانی‌شده"],
                      ["۱۸", "ابزار فعال"],
                    ].map(([value, label]) => (
                      <div key={label} className="rounded-xl bg-[#eef1ef] px-4 py-3 text-center">
                        <p className="font-display text-xl font-bold nums">{value}</p>
                        <p className="mt-1 text-xs text-[#68716b]">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          dir="rtl"
          data-reveal-stagger
          className="order-1 text-right lg:order-2 lg:col-start-2 lg:row-start-1"
        >
          <div data-reveal>
            <Eyebrow>شروع سریع</Eyebrow>
          </div>
          <h2 data-reveal className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight md:text-4xl">
            در چند قدم ساده، متن فارسی را راحت‌تر بخوان
          </h2>
          <p data-reveal className="mt-3 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            همه‌چیز قرار است سریع و بی‌اصطکاک باشد. نصبش کوتاه است و نتیجه‌اش همان‌جا دیده
            می‌شود.
          </p>

          <ol className="relative mt-7 space-y-3.5">
            <span
              className="absolute bottom-6 top-6 w-px bg-gradient-to-b from-crimson/50 via-crimson/30 to-transparent"
              style={{ insetInlineStart: "1.25rem" }}
              aria-hidden
            />
            {installSteps.map((step) => (
              <li
                key={step.step}
                data-reveal="slide-start"
                className="relative flex gap-4 rounded-2xl border border-transparent p-2 ps-0 transition-colors hover:border-hairline hover:bg-surface/60"
              >
                <span className="z-10 grid size-9 shrink-0 place-items-center rounded-full border border-crimson/40 bg-bg font-display text-sm font-bold text-crimson nums">
                  {step.step}
                </span>
                <div className="pt-1">
                  <h3 className="text-base font-semibold md:text-lg">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted md:text-base">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}

function SearchFaq() {
  return (
    <Section id="faq">
      <div className="mx-auto max-w-3xl">
        <div data-reveal-stagger className="text-center">
          <div data-reveal className="flex justify-center">
            <Eyebrow>پرسش‌های پرتکرار</Eyebrow>
          </div>
          <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
            سؤال‌هایی که کاربر قبل از نصب می‌پرسد
          </h2>
        </div>

        <div className="mt-10 space-y-4">
          {faq.map((item) => (
            <article
              key={item.q}
              data-reveal="fade-up"
              className="rounded-xl border border-hairline bg-surface p-6"
            >
              <h3 className="text-lg font-semibold">{item.q}</h3>
              <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

export default function HomePage() {
  const heroCopy = {
    eyebrow: "اکوسیستم فارسی برای وب، VS Code و Agentها",
    title: "فارسیِ خوانا، از مرورگر تا VS Code",
    sub: "RastChin متن فارسی را در ChatGPT، Claude، ابزارهای وب و محیط توسعه خوانا می‌کند؛ Desktop Integrator نیز برای ChatGPT و Codex روی سه سیستم‌عامل پایدار است.",
    trust: "پردازش محلی · بدون ارسال متن · امن برای کد، لینک و مسیر فایل",
    actions: dict.actions,
    secondaryAction: {
      href: "/vscode-rtl/",
      label: "RastChin for VS Code",
    },
    chatUser: dict.hero.chatUser,
    chatReply: dict.hero.chatReply,
  };

  return (
    <ScrollProvider dir={dir}>
      <Header dict={dict} />
      <main>
        <Hero dir={dir} copy={heroCopy} />
        <ToolHub />
        <SeoAnswerSection />
        <LocalProblemSolution />
        <Marquee text="راست‌چین کردن ChatGPT، Claude و ابزارهای هوش مصنوعی برای فارسی" />
        <LocalFeatures />
        <PlatformsWall dict={pageDict} singleLineTitle />
        <Browsers dict={pageDict} />
        <Stats dict={dict} />
        <YouTubeCaptions dict={dict} />
        <Privacy dict={dict} />
        <Credits dict={dict} />
        <LocalInstall />
        <SearchFaq />
        <FinalCta dict={pageDict} rotatingWords={finalCtaTools} compact />
      </main>
      <Footer dict={dict} />
      <JsonLd data={softwareAppJsonLd()} />
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={webPageJsonLd()} />
      <JsonLd data={faqJsonLd()} />
    </ScrollProvider>
  );
}
