<p align="center">
  <img src="docs/assets/rastchin-logo.png" alt="لوگوی پلکانی راست‌چین" width="128">
</p>

<h1 align="center">RastChin | راست‌چین</h1>

<p align="center">
  ابزارهای فارسی‌محور، local-first و RTL برای مرورگر، VS Code، برنامه‌های دسکتاپ و عامل‌های هوش مصنوعی پشتیبانی‌شده
</p>

<p align="center">
  <a href="https://github.com/omega-do-it-solutions/rastchin/actions/workflows/ci.yml"><img alt="وضعیت CI" src="https://github.com/omega-do-it-solutions/rastchin/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="مجوز Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://nodejs.org/"><img alt="Node.js 24" src="https://img.shields.io/badge/Node.js-24-5FA04E.svg"></a>
</p>

راست‌چین مجموعه‌ای متن‌باز برای خواناتر کردن متن فارسی و ترکیب‌های فارسی–انگلیسی و نوشتن متن طبیعی فارسی برای رابط محصول است. پردازش متن در افزونه‌ها و برنامهٔ دسکتاپ روی دستگاه شما انجام می‌شود؛ راست‌چین محتوای صفحه، گفتگو یا سند را برای خودش ارسال نمی‌کند. مهارت عامل نیز سرویس یا تله‌متری راست‌چین ندارد، اما متن ارسالی به Codex یا Claude طبق شرایط و کنترل‌های حریم خصوصی همان ارائه‌دهنده پردازش می‌شود.

این پروژه جهت نوشتار، تایپوگرافی، نشانه‌گذاری متن ترکیبی و رفتار کادر نوشتن فارسی را بهتر می‌کند و در عین حال کد، فرمان، مسیر، URL، ‏diff و سایر محتوای فنی را LTR نگه می‌دارد. همچنین مهارت مشترک عامل‌ها، متن رابط را با توجه به بافت به فارسی طبیعی برمی‌گرداند و ساختار فنی فایل را حفظ می‌کند. این مونوریپو مرجع عمومی برنامه‌ها و افزونهٔ عامل راست‌چین است. زبان طبیعیِ تحت پشتیبانی فقط فارسی است و انگلیسی تنها در متن ترکیبی و اصطلاحات فنی حفظ می‌شود.

## برنامه‌ها

| برنامه | نسخه | مسئولیت | وضعیت |
| --- | ---: | --- | --- |
| [افزونهٔ مرورگر](apps/browser-extension/README.md) | 1.1.71 | رفتار RTL مبتنی بر Manifest V3 برای وب‌سایت‌های صریحاً پشتیبانی‌شده، popup و side panel | بسته‌های مستقل Chrome و Firefox |
| [افزونهٔ VS Code](apps/vscode-extension/README.md) | 0.3.14 | Markdown Preview و یکپارچه‌سازی برگشت‌پذیر Claude Code/Codex با رضایت کاربر | مسیر انتشار مستقل VSIX |
| [یکپارچه‌ساز دسکتاپ](apps/desktop-integrator/README.md) | 0.3.2 | کشف محلی و یکپارچه‌سازی RTL در حافظه برای برنامه‌های رسمی دسکتاپ پشتیبانی‌شده | پایدار برای ChatGPT/Codex؛ Claude در نسخه‌های آینده |
| [افزونهٔ عامل و مهارت فارسی](plugins/rastchin-persian/README.md) | 0.1.0 | ترجمه، بازبینی و بومی‌سازی طبیعی رابط محصول با حفظ placeholder، کد، markup و ساختار فایل | یک مهارت مشترک با بسته‌بندی Codex و Claude |

هر برنامه و افزونهٔ عامل نسخه و مسیر انتشار مستقل دارد. نسخهٔ ریشه، یعنی `0.1.0`، زیرساخت مونوریپو را توصیف می‌کند و نسخهٔ هماهنگ همهٔ خروجی‌ها نیست.

خروجی‌های عمومی و checksum آن‌ها در [GitHub Releases](https://github.com/omega-do-it-solutions/rastchin/releases) با tag مستقل هر برنامه منتشر می‌شوند. نصب نسخه‌های Windows، ‏macOS و Linux دستی است و برنامهٔ دسکتاپ در حال حاضر auto-update ندارد. انتشار فایل در GitHub به‌معنی انتشار خودکار در marketplaceها نیست.

## حریم خصوصی و ایمنی

- پردازش متن مرورگر، VS Code و دسکتاپ روی دستگاه کاربر می‌ماند.
- افزونهٔ عامل فقط دستورالعمل و مرجع متنی است؛ MCP، hook اجرایی، حساب، کلید API یا سرویس راست‌چین اضافه نمی‌کند. فایل‌ها و promptهای انتخاب‌شده همچنان می‌توانند توسط Codex یا Claude پردازش شوند.
- راست‌چین هیچ تحلیل‌گر یا تله‌متری اضافه نمی‌کند و حساب کاربری، پایگاه داده، object storage یا API بارگذاری محتوا ندارد.
- دسترسی مرورگر به میزبان‌ها و مجوزهای اعلام‌شده در manifest افزونه محدود است.
- تغییرات VS Code به قصد صریح کاربر، بررسی سازگاری، پشتیبان، نوشتن تراکنشی و بازیابی آگاه از هش نیاز دارند.
- یکپارچه‌ساز دسکتاپ فایل‌های امضاشدهٔ برنامهٔ فروشنده را تغییر نمی‌دهد و پورت اشکال‌زدایی شبکه باز نمی‌کند. این برنامه از پایپ محلی خصوصی استفاده می‌کند، مقادیر حساس محیط را حذف می‌کند و متن گفتگو را ثبت نمی‌کند.
- نسخه، چیدمان، فایل اجرایی، امضا یا هویت بستهٔ ناشناخته به‌صورت امن رد می‌شود.
- بازخورد، درخواست پشتیبانی و گزارش اشکال از طریق [قالب‌های ایشوی GitHub](https://github.com/omega-do-it-solutions/rastchin/issues/new/choose) انجام می‌شود؛ اطلاعات خصوصی یا محتوای کاربر نباید در ایشوی عمومی قرار گیرد.

برای قواعد کامل محصول، [docs/product.md](docs/product.md) و برای مرزهای برنامه‌ها، [docs/architecture.md](docs/architecture.md) را بخوانید.

## شروع سریع

نیازمندی‌ها:

- Node.js 24.18.1 یا جدیدتر در خط Node 24
- pnpm 11.14.0 از طریق Corepack
- Bash برای اسکریپت‌های بسته‌بندی مرورگر
- اختیاری: Chrome 114+، ‏Firefox 142+، ‏VS Code به‌همراه CLI با نام `code` و ابزارهای بسته‌بندی پلتفرم هدف دسکتاپ
- اختیاری برای آزمون افزونهٔ عامل: Codex CLI یا Claude Code با پشتیبانی plugin marketplace

در ریشهٔ مخزن اجرا کنید:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

## فرمان‌های پرکاربرد

| فرمان | کاربرد |
| --- | --- |
| `pnpm dev:browser` | ساخت نسخهٔ unpacked برای Chrome در `apps/browser-extension/unpacked/` |
| `pnpm dev:firefox` | ساخت نسخهٔ unpacked برای Firefox در `apps/browser-extension/unpacked-firefox/` |
| `pnpm package:browser` | ساخت و بررسی هر دو ZIP انتشار Chrome و Firefox |
| `pnpm package:browser:chrome` | ساخت ZIP مخصوص Chrome Web Store |
| `pnpm package:browser:firefox` | ساخت ZIP مخصوص Firefox Add-ons |
| `pnpm dev:vscode` | باز کردن VS Code Extension Development Host؛ نیازمند `code` در `PATH` |
| `pnpm dev:desktop` | اجرای مدیر دسکتاپ در حالت توسعه از سورس |
| `pnpm lint` | اجرای همهٔ linterهای موجود |
| `pnpm typecheck` | اجرای همهٔ بررسی‌کننده‌های نوع |
| `pnpm test` | اجرای همهٔ آزمون‌های رگرسیون برنامه‌ها |
| `pnpm verify` | بررسی سیاست‌های بسته‌بندی/ایمنی برنامه‌ها و مرزهای مخزن عمومی |
| `pnpm verify:agent-plugin` | بررسی هر دو manifest و marketplace عامل، مهارت مشترک و ۲۳ نمونهٔ ارزیابی |
| `pnpm check` | اجرای lint، بررسی نوع، آزمون‌ها و راستی‌آزمایی |
| `pnpm audit:prod` | رد آسیب‌پذیری شناخته‌شدهٔ شدید/بحرانی در وابستگی‌های تولید |

فرمان‌های توسعه و بسته‌بندی متمرکز در README هر برنامه قرار دارند. ساخت یک خروجی، آن را منتشر نمی‌کند.

## نقشهٔ مخزن

```text
apps/
├── browser-extension/      افزونهٔ Manifest V3 برای Chrome و Firefox
├── vscode-extension/       افزونهٔ VS Code
└── desktop-integrator/     مدیر Electron پایدار برای ChatGPT/Codex
plugins/
└── rastchin-persian/       مهارت مشترک و بسته‌بندی افزونه برای Codex و Claude
packages/                   ویژهٔ قراردادهای اثبات‌شدهٔ میان‌برنامه‌ای
docs/
├── product.md              رفتار محصول و مرزهای انتشار
├── architecture.md         نقشهٔ فشردهٔ معماری مونوریپو
├── migration/              منشأ سورس‌های واردشده
└── ai/                     راهنمای پایدار مهندسی OmegaForge
scripts/                    راستی‌آزمایی سراسری مخزن
.agents/plugins/            فهرست marketplace برای Codex
.claude-plugin/             فهرست marketplace برای Claude
.github/                    CI، گردش‌کار بسته‌ها و قالب‌های مشارکت
```

فایل پیاده‌سازی را مستقیماً میان برنامه‌ها وارد نکنید. کد مشترک فقط زمانی در `packages/` قرار می‌گیرد که دست‌کم دو برنامه از یک قرارداد پایدار یکسان استفاده کنند و قواعد ایمنی ویژهٔ میزبان آن‌ها حفظ شود.

مخزن‌های اولیه به‌صورت snapshotهای پاک وارد شدند و تاریخچه‌های نامرتبط Git با هم ترکیب نشدند. کامیت دقیق منابع در [docs/migration/source-snapshots.md](docs/migration/source-snapshots.md) ثبت شده است.

## مشارکت

از مشارکت در کد، آزمون، متن فارسی، نمونه‌های ارزیابی بومی‌سازی، مستندات فارسی، دسترس‌پذیری و adapterهای سازگاری استقبال می‌کنیم. از [CONTRIBUTING.md](CONTRIBUTING.md) شروع کنید و README و ماتریس آزمون بخش مالک را دنبال کنید. پیش از مشارکت [آیین‌نامه رفتاری](CODE_OF_CONDUCT.md) را بخوانید.

آسیب‌پذیری‌ها را از مسیر خصوصی [SECURITY.md](SECURITY.md) گزارش کنید. برای پرسش‌های نصب و استفاده به [SUPPORT.md](SUPPORT.md) مراجعه کنید. نگه‌دارندگان باید از [RELEASING.md](RELEASING.md) پیروی کنند؛ تغییرات سراسری مخزن در [CHANGELOG.md](CHANGELOG.md) ثبت می‌شود.

## مجوز، انتساب و نشان‌های تجاری

سورس و مستندات دست‌اول تحت [مجوز Apache 2.0](LICENSE) هستند. انتساب لازم در [NOTICE](NOTICE) آمده و کد، فونت و دارایی‌های اشخاص ثالث، شرایط درج‌شده در [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) و اعلان‌های هر برنامه را حفظ می‌کنند.

نام‌های RastChin و راست‌چین، لوگوی پلکانی و هویت‌های رسمی محصول متعلق به **Omega Do IT Solutions** هستند. Apache-2.0 حق استفاده از کد را می‌دهد، نه اجازهٔ معرفی یک توزیع تغییریافته به‌عنوان انتشار رسمی راست‌چین. [TRADEMARK.md](TRADEMARK.md) را ببینید.

OpenAI، ‏ChatGPT، ‏Codex، ‏Anthropic، ‏Claude، ‏Meta، ‏Meta AI، ‏Linear، ‏Google Chrome، ‏Mozilla Firefox، ‏Microsoft، ‏Visual Studio Code، ‏GitHub، ‏Electron و سایر نام‌های اشاره‌شده متعلق به صاحبان خود هستند. راست‌چین یک پروژهٔ مستقل سازگاری است و از سوی این مالکان تأیید نشده است.
