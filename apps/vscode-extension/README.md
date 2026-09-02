# راست‌چین برای VS Code

راست‌چین خوانایی RTL فارسی را در Markdown Preview نرم‌افزار VS Code و webviewهای پشتیبانی‌شدهٔ Claude Code و Codex بهتر می‌کند. این افزونه عمداً فقط فارسی را پشتیبانی می‌کند و کد، فرمان، URL، نشانی ایمیل، مسیر، خروجی ترمینال و diff را LTR و monospace نگه می‌دارد.

- هویت Marketplace: `OmegaDoITSolutions.rastchin-vscode`
- مونوریپو: [omega-do-it-solutions/rastchin](https://github.com/omega-do-it-solutions/rastchin)
- پوشهٔ برنامه: `apps/vscode-extension`

راست‌چین هیچ‌گاه فایل `workbench.html` یا `product.json` خود VS Code را تغییر نمی‌دهد.

## محیط‌های پشتیبانی‌شده

- Markdown Preview در VS Code از طریق contribution pointهای رسمی Markdown.
- webview گفت‌وگوی Claude Code.
- ‏Claude Code Plan Preview، وقتی چیدمان آن بررسی سازگاری را بگذراند.
- webview افزونهٔ Codex / ChatGPT برای VS Code.

فونت Vazirmatn در VSIX قرار دارد؛ بنابراین استفاده از افزونه به دانلود فونت یا درخواست شبکه نیاز ندارد.

## فعال‌سازی امن agent

پشتیبانی Markdown Preview پس از نصب فعال است. پشتیبانی از webviewهای agent یک patch سازگاری صریح است، زیرا این افزونه‌ها API رسمی برای استایل‌دهی ارائه نمی‌کنند:

1. در اعلان راه‌اندازی راست‌چین **Apply RTL Patches** را انتخاب یا فرمان **RastChin for VS Code: Re-apply Patches** را اجرا کنید.
2. برنامهٔ فقط‌خواندنی را در کانال خروجی راست‌چین بازبینی کنید.
3. **Apply Patches** را تأیید کنید.
4. اگر درخواست شد پنجرهٔ VS Code را reload کنید.

نصب‌کننده صرفاً به‌دلیل نصب راست‌چین افزونهٔ دیگری را patch نمی‌کند. مقدار پیش‌فرض `persianRtlClean.patchOnStartup` برابر `false` است و patch دستی نیز به‌طور پیش‌فرض تأیید می‌خواهد.

راست‌چین پیش از هر نوشتن، افزونهٔ فعال را از registry افزونه‌های VS Code پیدا می‌کند و نسخه و چیدمان هدف را اعتبارسنجی می‌کند. چیدمان ناشناخته، ناقص یا تغییریافته با وضعیت `UNSUPPORTED` به‌صورت امن رد می‌شود. هر هدف در یک تراکنش فایل جداگانه با فرادادهٔ پشتیبان، جایگزینی اتمیک و rollback پس از هر خطای نوشتن مدیریت می‌شود.

## به‌روزرسانی و بازیابی

به‌روزرسانی Claude Code یا Codex ممکن است فایل‌های patchشدهٔ آن‌ها را جایگزین کند. راست‌چین در startup، پس از تغییر registry افزونه‌ها و هنگام بازگشت focus به پنجره، نسخه و فایل‌های فعال را به‌صورت فقط‌خواندنی بررسی می‌کند. اگر patch سازگار حذف یا قدیمی شده باشد، اعلان **Re-apply Now**، **Later** و **View Details** نمایش داده می‌شود. **Later** همان مشکل و نسخه را ۲۴ ساعت به تعویق می‌اندازد، اما نسخهٔ جدیدتر agent فوراً دوباره بررسی می‌شود. چیدمان ناشناخته فقط diagnostics نشان می‌دهد و هرگز به‌صورت حدسی patch نمی‌شود.

همان جریان امن را می‌توان همیشه از Command Palette اجرا کرد. همچنین در نمای Extensions روی کارت **RastChin for VS Code** راست‌کلیک کنید و **RastChin for VS Code: Re-apply Patches** را انتخاب کنید. راست‌چین به‌روزرسانی را بی‌صدا patch نمی‌کند و تأیید کاربر، preflight و backup همچنان الزامی‌اند. برای بازیابی اجرا کنید:

```text
RastChin for VS Code: Disable / Restore Patches
```

بازیابی، هش‌ها و فراداده را بررسی می‌کند تا پشتیبان قدیمی نتواند نسخهٔ جدیدتر agent را downgrade کند. hook حذف افزونه نیز برای بازیابی تلاش می‌کند. توجه کنید یکپارچه‌سازی agent لایهٔ سازگاری است؛ تغییر عمدهٔ چیدمان بالادستی ممکن است تا انتشار adapter بازبینی‌شده بدون پشتیبانی بماند.

## فرمان‌ها

- `RastChin for VS Code: Status`
- `RastChin for VS Code: Inspect Agent Patch Plan`
- `RastChin for VS Code: Re-apply Patches`
- `RastChin for VS Code: Disable / Restore Patches`
- `RastChin for VS Code: Clean Legacy Extension Patches`

## تنظیمات

- `persianRtlClean.patchClaudeCode`
- `persianRtlClean.patchCodex`
- `persianRtlClean.patchClaudePlanPreview`
- `persianRtlClean.confirmBeforePatching`
- `persianRtlClean.patchOnStartup`

کلیدهای قدیمی `persianRtlClean.*` عمداً برای سازگاری نصب و تنظیمات حفظ شده‌اند.

## نقشهٔ کد

```text
src/extension.js             فعال‌سازی VS Code، فرمان‌ها، رابط و چرخهٔ عمر
src/patchHealth.js           تشخیص مشکل، امضای نسخه و snooze اعلان بازیابی
src/targets/registry.js      کشف نسخهٔ فعال و چیدمان‌های پشتیبانی‌شده
src/patcher.js               برنامه‌ریزی و هماهنگی اعمال/بازیابی و عیب‌یابی
src/fileTransaction.js       نوشتن اتمیک، پشتیبان، هش و rollback
src/injections.js            دارایی CSS/JavaScript بازبینی‌شده برای هدف‌های agent
src/rtlRules.js              قواعد مشترک جهت و ایمنی کد
media/                       دارایی Markdown Preview، آیکن و فونت محلی
scripts/uninstall.js         hook مستقل بازیابی
test/                        مجموعه‌آزمون‌های Node و jsdom
third_party/                 snapshot منشأ و مجوز MIT اصلی
docs/PHASE2-SMOKE.md         ماتریس راستی‌آزمایی دستی آزمایشگاه
```

تغییر adapterهای agent باید آگاه از نسخه/چیدمان بماند و به‌صورت امن از هدف ناشناخته عبور نکند. selector یا جست‌وجوی فایل‌سیستم را فقط برای عبور دادن نسخهٔ ناشناختهٔ agent گسترده نکنید. قواعد تأیید، پشتیبان، هش، rollback و بازیابی را همراه آزمون حفظ کنید.

## توسعهٔ محلی

از Node.js 24 و pnpm 11 استفاده کنید. در ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm install
pnpm --filter rastchin-vscode test
```

افزونه را از `apps/vscode-extension` در VS Code Extension Development Host اجرا یا اشکال‌زدایی کنید. این پوشه را در VS Code باز کنید و **F5** بزنید، یا از ریشهٔ مونوریپو یک Extension Development Host تازه اجرا کنید:

```bash
pnpm --filter rastchin-vscode run dev
```

فرمان CLI به `code` در `PATH` نیاز دارد. آزمون‌ها به افزونهٔ نصب‌شدهٔ Claude Code یا Codex نیاز ندارند؛ fixtureها کشف، اعتبارسنجی چیدمان، تراکنش، تزریق CSS/JS، ایمنی paste، میان‌بر، Markdown Preview، onboarding و بازیابی را پوشش می‌دهند.

بررسی‌های احراز هویت‌شده و رندرشده توسط میزبان که با jsdom قابل‌اثبات نیستند در [ماتریس آزمون دود دستی](docs/PHASE2-SMOKE.md) مستند شده‌اند. برای این بررسی‌ها از پوشهٔ user-data و افزونهٔ ایزولهٔ VS Code استفاده کنید.

## بسته‌بندی VSIX

در ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm --filter rastchin-vscode test
pnpm --filter rastchin-vscode run package
```

فایل تولیدشده `apps/vscode-extension/rastchin-vscode-<version>.vsix` است. بسته شامل مجوز Apache، اعلان پروژه، اعلان‌های اشخاص ثالث، متن کامل MIT بالادستی و متن OFL فونت Vazirmatn است. فایل‌های VSIX خروجی انتشار تولیدشده‌اند و نباید commit شوند. بسته‌بندی چیزی را در Visual Studio Marketplace منتشر نمی‌کند.

## مشارکت و امنیت

پیش از کار روی adapter، [راهنمای مشارکت](../../CONTRIBUTING.md) مخزن را بخوانید. آسیب‌پذیری‌ها، به‌ویژه موارد مربوط به کشف هدف، اعتماد به مسیر، پشتیبان یا بازیابی را از فرایند خصوصی [SECURITY.md](../../SECURITY.md) گزارش کنید.

## مجوز، اشخاص ثالث و نشان‌های تجاری

سورس راست‌چین تحت [مجوز Apache 2.0](LICENSE) است. کد MIT بالادستیِ نگه‌داری‌شده و فونت Vazirmatn تحت شرایط خود باقی می‌مانند؛ [اعلان‌های اشخاص ثالث](THIRD_PARTY_NOTICES.md) را ببینید.

مجوز Apache حق استفاده از نام یا لوگوی راست‌چین را نمی‌دهد؛ [سیاست نشان تجاری](../../TRADEMARK.md) مخزن را ببینید. Visual Studio Code، ‏Claude، ‏Codex، ‏ChatGPT و سایر نام‌های محصول، نشان تجاری مالکان خود هستند. راست‌چین به این مالکان وابسته نیست و از سوی آن‌ها تأیید نشده است.

بستهٔ فضای کاری فقط برای جلوگیری از انتشار تصادفی در npm با `private` علامت‌گذاری شده است. این مقدار مانع بسته‌بندی VSIX نمی‌شود و حقوق Apache-2.0 سورس را تغییر نمی‌دهد.
