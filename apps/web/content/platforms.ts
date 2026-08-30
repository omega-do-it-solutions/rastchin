import type { Platform } from "./types";

const aiScope = "RTL فارسی‌محور + فونت + حفظ متن ترکیبی";

/** Website catalog for every extension-supported platform. ids match the extension registry and public/logos/<id>.svg. */
export const platforms: Platform[] = [
  // --- AI (full Persian RTL + font + mixed-content safety) ---
  { id: "chatgpt", name: "ChatGPT", category: "ai", support: "full", scopeNote: aiScope },
  { id: "claude", name: "Claude", category: "ai", support: "full", scopeNote: aiScope },
  { id: "gemini", name: "Gemini", category: "ai", support: "full", scopeNote: aiScope },
  { id: "copilot", name: "Copilot", category: "ai", support: "full", scopeNote: aiScope },
  { id: "perplexity", name: "Perplexity", category: "ai", support: "full", scopeNote: aiScope },
  { id: "deepseek", name: "DeepSeek", category: "ai", support: "full", scopeNote: aiScope },
  { id: "notebooklm", name: "NotebookLM", category: "ai", support: "full", scopeNote: aiScope },
  { id: "aistudio", name: "Google AI Studio", category: "ai", support: "full", scopeNote: aiScope },
  { id: "qwen", name: "Qwen", category: "ai", support: "full", scopeNote: aiScope },
  { id: "arena", name: "Arena", category: "ai", support: "full", scopeNote: aiScope },

  // --- Work (scoped / font-only by design) ---
  {
    id: "github",
    name: "GitHub",
    category: "work",
    support: "scoped",
    scopeNote: "متن‌های فارسی و ویرایشگرها",
  },
  {
    id: "vsMarketplace",
    name: "VS Marketplace",
    category: "work",
    support: "scoped",
    scopeNote: "توضیحات فارسی افزونه‌ها",
  },
  {
    id: "trello",
    name: "Trello",
    category: "work",
    support: "scoped",
    scopeNote: "فقط توضیحات و کامنت کارت",
  },
  {
    id: "notion",
    name: "Notion",
    category: "work",
    support: "font-only",
    scopeNote: "فقط فونت (شامل notion.site)",
  },
  {
    id: "googleWorkspace",
    name: "Google Docs/Sheets",
    category: "work",
    support: "scoped",
    scopeNote: "فقط کامنت‌ها و پاسخ‌ها",
  },
  {
    id: "googleTranslate",
    name: "Google Translate",
    category: "work",
    support: "scoped",
    scopeNote: "ورودی و خروجی فارسی",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "work",
    support: "font-only",
    scopeNote: "فقط فونت",
  },

  // --- Communication ---
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "communication",
    support: "scoped",
    scopeNote: "پیام، نوشتن، جست‌وجو و عنوان گفت‌وگو",
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "communication",
    support: "scoped",
    scopeNote: "پیام، نوشتن، جست‌وجو و عنوان گفت‌وگو",
  },

  // --- Media ---
  {
    id: "youtube",
    name: "YouTube",
    category: "media",
    support: "captions",
    scopeNote: "زیرنویس فارسی + کنترل اندازه و رنگ",
  },
];

export const platformsByCategory = {
  ai: platforms.filter((p) => p.category === "ai"),
  work: platforms.filter((p) => p.category === "work"),
  communication: platforms.filter((p) => p.category === "communication"),
  media: platforms.filter((p) => p.category === "media"),
};
