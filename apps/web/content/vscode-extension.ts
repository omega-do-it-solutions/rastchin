export type VscodeExtensionRelease = {
  version: string;
  extensionId: string;
  directInstallUrl: string | null;
  marketplaceUrl: string | null;
};

/** Public release details from the Visual Studio Marketplace listing. */
export const vscodeExtensionRelease: VscodeExtensionRelease = {
  version: "0.3.12",
  extensionId: "OmegaDoITSolutions.rastchin-vscode",
  directInstallUrl: "vscode:extension/OmegaDoITSolutions.rastchin-vscode",
  marketplaceUrl:
    "https://marketplace.visualstudio.com/items?itemName=OmegaDoITSolutions.rastchin-vscode",
};

export const vscodeExtensionFaq = [
  {
    id: "after-install",
    q: "بعد از نصب، راست‌چین خودکار فعال می‌شود؟",
    a: "در Markdown Preview بله. برای پنل‌های Claude Code و Codex، افزونه ابتدا یک درخواست شفاف نشان می‌دهد و فقط بعد از تأیید شما patch سازگار را اعمال می‌کند.",
  },
  {
    id: "code-and-links",
    q: "کد، command و لینک‌ها هم راست‌چین می‌شوند؟",
    a: "نه. RastChin جهت هر بخش را جدا تشخیص می‌دهد؛ متن فارسی RTL می‌شود اما کد، URL، ایمیل، مسیر فایل، terminal و diff در جهت LTR و فونت monospace می‌مانند.",
  },
  {
    id: "agent-files",
    q: "آیا فایل‌های VS Code تغییر می‌کنند؟",
    a: "خیر. فایل‌های اصلی VS Code مثل workbench.html و product.json تغییر نمی‌کنند. یکپارچه‌سازی Agentها فقط با رضایت شما روی webview همان افزونه انجام می‌شود و backup و مسیر بازیابی دارد.",
  },
  {
    id: "updates",
    q: "بعد از آپدیت Claude Code یا Codex چه می‌شود؟",
    a: "RastChin تغییر نسخه را تشخیص می‌دهد و پیشنهاد بررسی و اعمال دوباره می‌دهد. آپدیت Agent بدون تأیید شما patch نمی‌شود و نسخه‌های ناسازگار با وضعیت UNSUPPORTED گزارش می‌شوند.",
  },
] as const;
