export type ProductSlug = "browser" | "vscode-rtl";

export type Product = {
  slug: ProductSlug;
  href: string;
  name: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  status: string;
  ctaLabel: string;
  ctaHref?: string;
  repo?: string;
  highlights: string[];
  details: { title: string; body: string }[];
};

export type DesktopProduct = {
  id: "desktop-integrator" | "claude-plugin";
  availability: "stable" | "future";
  name: string;
  platformLogo: "chatgpt" | "claude";
  label: string;
  status: string;
  summary: string;
  note: string;
  href?: string;
};

export const products: Product[] = [
  {
    slug: "browser",
    href: "/",
    name: "RastChin",
    label: "افزونه مرورگر",
    eyebrow: "وب و ابزارهای روزمره",
    title: "فارسیِ خوانا در مرورگر",
    summary:
      "راست‌چین متن فارسی را در ChatGPT، Notion، Gmail، یوتیوب و ابزارهای مشابه خواناتر می‌کند، بدون این‌که کد و لینک‌ها را به‌هم بریزد.",
    status: "مسیر نصب از Chrome Web Store بعد از نهایی‌شدن listing فعال می‌شود.",
    ctaLabel: "مشاهده افزونه مرورگر",
    ctaHref: "/#features",
    repo: "https://github.com/omega-do-it-solutions/rastchin/tree/main/apps/browser-extension",
    highlights: [
      "تشخیص هوشمند متن فارسی",
      "حفظ LTR برای کد، URL و متن انگلیسی",
      "پردازش محلی در مرورگر",
    ],
    details: [
      {
        title: "برای ابزارهای وب",
        body: "تمرکز اصلی روی محیط‌هایی است که فارسی در UI انگلیسی بدخوان می‌شود؛ از AI chat تا Gmail، Notion و زیرنویس یوتیوب.",
      },
      {
        title: "بدون ارسال محتوا",
        body: "افزونه برای اصلاح نمایش متن کار می‌کند و متن صفحه، prompt یا سندهای کاربر را به سرور ارسال نمی‌کند.",
      },
    ],
  },
  {
    slug: "vscode-rtl",
    href: "/vscode-rtl/",
    name: "RastChin for VS Code",
    label: "افزونه VS Code",
    eyebrow: "Markdown Preview، Claude Code و Codex",
    title: "فارسی خوانا داخل VS Code",
    summary:
      "RastChin متن فارسی را در Markdown Preview، Claude Code و Codex راست‌چین و خوانا می‌کند و کد، لینک و مسیر فایل‌ها را LTR نگه می‌دارد.",
    status: "نسخه 0.3.12 در Visual Studio Marketplace منتشر شده است.",
    ctaLabel: "مشاهده RastChin for VS Code",
    repo: "https://github.com/omega-do-it-solutions/rastchin/tree/main/apps/vscode-extension",
    highlights: [
      "Markdown Preview رسمی VS Code",
      "Patch اختیاری و قابل‌بازیابی برای Claude/Codex",
      "حفظ LTR برای command، URL، path، terminal و diff",
    ],
    details: [
      {
        title: "برای جریان کار توسعه",
        body: "تمرکز این ابزار روی خوانایی فارسی در محیط توسعه است، مخصوصاً جایی که خروجی‌های Markdown و گفتگوهای AI در VS Code نمایش داده می‌شوند.",
      },
      {
        title: "فعال‌سازی شفاف Agentها",
        body: "Markdown Preview بلافاصله فعال است؛ patch پنل‌های Agent فقط بعد از نمایش plan و تأیید صریح کاربر انجام می‌شود.",
      },
    ],
  },
];

export const productBySlug = Object.fromEntries(
  products.map((product) => [product.slug, product]),
) as Record<ProductSlug, Product>;

export const desktopProducts: DesktopProduct[] = [
  {
    id: "desktop-integrator",
    availability: "stable",
    name: "RastChin Desktop Integrator",
    platformLogo: "chatgpt",
    label: "ابزار دسکتاپ محلی",
    status: "پایدار برای ChatGPT و Codex",
    summary:
      "یکپارچه‌سازی محلی RTL برای اپ‌های دسکتاپ ChatGPT و Codex، با تشخیص هدف، بررسی سازگاری و پاک‌سازی قابل‌بازیابی.",
    note: "برای Windows، macOS و Linux؛ بدون تغییر فایل‌های امضاشدهٔ vendor",
    href: "https://github.com/omega-do-it-solutions/rastchin/tree/main/apps/desktop-integrator",
  },
  {
    id: "claude-plugin",
    availability: "future",
    name: "RastChin for Claude",
    platformLogo: "claude",
    label: "پلاگین آینده",
    status: "در حال بررسی",
    summary:
      "پشتیبانی اختصاصی فارسی برای Claude Desktop و جریان‌های تعاملی Agent، با همان دقت RTL/LTR راست‌چین.",
    note: "در حال طراحی و ارزیابی مسیر انتشار",
  },
];
