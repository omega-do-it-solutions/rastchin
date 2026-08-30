import type { Metadata } from "next";
import { ogLocale } from "@/lib/i18n/config";
import { SITE } from "@/lib/site";

export type SeoPage = "home" | "vscode-rtl" | "privacy" | "changelog" | "feedback";

const titles: Record<SeoPage, string> = {
  home: "راست‌چین، هاب ابزارهای فارسی و RTL",
  "vscode-rtl": "RastChin for VS Code | راست‌چین فارسی در VS Code",
  privacy: "سیاست حریم خصوصی",
  changelog: "تازه‌ها",
  feedback: "ارتباط با ما",
};

const descriptions: Record<SeoPage, string> = {
  home: "RastChin.tools هاب ابزارهای فارسی و RTL است: افزونه مرورگر و RastChin for VS Code برای خواناتر کردن فارسی در محیط‌های انگلیسی.",
  "vscode-rtl":
    "افزونه رایگان RastChin برای راست‌چین و خواناتر کردن فارسی در VS Code Markdown Preview، Claude Code و Codex، بدون خراب شدن کد، لینک و مسیر فایل‌ها.",
  privacy:
    "راست‌چین متنِ صفحه را به هیچ سروری ارسال نمی‌کند، ردیابی پنهان ندارد و فقط تنظیمات ظاهری را ذخیره می‌کند.",
  changelog: "تاریخچهٔ نسخه‌های راست‌چین. هر نسخه، فارسیِ خواناتر.",
  feedback: "فرم ارتباط با تیم راست‌چین برای پیشنهاد، گزارش مشکل و پیام پشتیبانی.",
};

const pathFor = (page: SeoPage): string => (page === "home" ? "/" : `/${page}/`);

/** Per-page metadata for the Persian-only site (single locale, no hreflang alternates). */
export function buildMetadata(page: SeoPage): Metadata {
  const title = titles[page];
  const description = descriptions[page];
  const path = pathFor(page);

  return {
    title: page === "home" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: ogLocale,
      title,
      description,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
