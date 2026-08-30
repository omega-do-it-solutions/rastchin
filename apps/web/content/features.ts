import type { Feature } from "./types";

/** The 5 product pillars, grounded in the extension, no over-claiming. Reveals are all distinct. */
export const features: Feature[] = [
  {
    id: "detection",
    reveal: "slide-start",
    title: "تشخیص هوشمند فارسی",
    body: "حروف و نشانه‌های فارسی مثل پ، چ، ژ و گ را میان متن انگلیسی تشخیص می‌دهد.",
  },
  {
    id: "codesafe",
    reveal: "clip-reveal",
    title: "محافظت از متن ترکیبی",
    body: "کد، URL، ایمیل و جدول در فرمت درست خودشان باقی می‌مانند.",
  },
  {
    id: "vazirmatn",
    reveal: "slide-end",
    title: "فونت استاندارد Vazirmatn",
    body: "فونت خوانای فارسی فقط روی متن فارسی اعمال می‌شود.",
  },
  {
    id: "control",
    reveal: "scale-up",
    title: "کنترل سایت‌به‌سایت",
    body: "افزونه را برای کل مرورگر یا فقط سایت فعلی روشن و خاموش کن.",
  },
  {
    id: "privacy",
    reveal: "fade-up",
    title: "پردازش محلی و امن",
    body: "همه‌چیز در مرورگر انجام می‌شود؛ متن و prompt ارسال نمی‌شود.",
  },
];
