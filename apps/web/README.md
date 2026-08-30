# وب‌سایت راست‌چین

وب‌سایت عمومی فارسی‌محور [rastchin.tools](https://rastchin.tools) محل معرفی، مستندات، حریم خصوصی، تاریخچهٔ تغییرات، پشتیبانی و بازخورد مجموعه‌ابزار راست‌چین است. زبان طبیعیِ تحت پشتیبانی فقط فارسی است.

این برنامه یکی از واحدهای قابل‌استقرار مونوریپوی عمومی [`omega-do-it-solutions/rastchin`](https://github.com/omega-do-it-solutions/rastchin) است. برنامه‌های دیگر در `apps/browser-extension`، ‏`apps/vscode-extension` و `apps/desktop-integrator` قرار دارند.

## مسئولیت‌های این برنامه

- صفحات عمومی فارسی RTL و فرادادهٔ SEO
- اطلاعات محصول مرورگر، VS Code و دسکتاپ
- سیاست عمومی حریم خصوصی و تاریخچهٔ انتشار
- فرم بازخورد و endpoint کوچک PHP/SendGrid آن
- خروجی استاتیک تولید برای میزبان فعلی
- همگام‌سازی متن انتشار با فضای کاری مرورگر

این برنامه مسئول منطق تزریق مرورگر، patch کردن VS Code، یکپارچه‌سازی Electron، انتشار در فروشگاه، حساب کاربری، analytics، پایگاه داده یا API عمومی نیست.

## فناوری

- Next.js 15 App Router و React 19
- TypeScript
- Tailwind CSS 4 به‌همراه تم مرکزی راست‌چین در daisyUI 5
- next-themes برای حالت روشن/تیرهٔ صریح
- GSAP و Lenis برای animation و scrolling تدریجی
- PHP 8.4 به‌همراه cURL برای ارسال اختیاری بازخورد

Next.js از `output: "export"` استفاده می‌کند. `pnpm build` پوشهٔ `out/` را می‌سازد و مجوز و اعلان‌های برنامه را در خروجی قابل‌توزیع کپی می‌کند. `pnpm start` خروجی ساخته‌شده را بدون اجرای development server مربوط به Next.js به‌عنوان فرایند تولید سرو می‌کند. endpoint مربوط به PHP از `public/api/feedback.php` در خروجی کپی می‌شود و به میزبان استقرار دارای PHP نیاز دارد.

## توسعه از ریشهٔ مخزن

نیازمندی‌ها Node.js 24 LTS و pnpm 11 هستند.

```bash
pnpm install
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env
pnpm dev
```

نشانی <http://localhost:3000> را باز کنید. محیط نمونه هیچ اعتبارنامه‌ای ندارد و صفحات استاتیک به آن نیاز ندارند. ارسال بازخورد به مقادیر server-only مربوط به SendGrid نیاز دارد که در [docs/feedback-endpoint.md](docs/feedback-endpoint.md) توضیح داده شده‌اند.

فرمان‌های مفید ریشه:

| فرمان | کاربرد |
| --- | --- |
| `pnpm dev` | اجرای development server این برنامه با `APP_ENV=development` |
| `pnpm preview:web` | سرو خروجی ساخته‌شدهٔ `out/` با `APP_ENV=production` |
| `pnpm --filter @rastchin/web check` | lint، بررسی نوع و راستی‌آزمایی همگام‌سازی انتشار |
| `pnpm --filter @rastchin/web build` | راستی‌آزمایی و ساخت خروجی استاتیک |
| `pnpm --filter @rastchin/web sync:release` | همگام‌سازی نسخه/changelog مرورگر و ساخت |
| `pnpm --filter @rastchin/web sync:release:check` | بررسی همگام‌سازی بدون نوشتن |

پیش از نسخهٔ آمادهٔ انتشار، `pnpm check` و `pnpm build` کامل ریشه را اجرا کنید.

## نقشهٔ سورس

```text
app/          درخت route در Next.js و composition ریشه
components/   بخش‌های محصول و رابط پایدار سایت
content/      متن فارسی، فرادادهٔ انتشار و دادهٔ changelog
lib/          قالب‌بندی framework-neutral، ‏SEO و ثابت‌های سایت
public/       دارایی استاتیک و endpoint بازخورد PHP
styles/       ثبت فونت
scripts/      همگام‌سازی انتشار و محافظ‌های استقرار دستی
docs/         تصمیم‌های عملیاتی و runbookهای وب‌سایت
```

رشته‌های فنی مانند فرمان، مسیر، URL و نسخه باید در رابط فارسی RTL به‌صورت LTR باقی بمانند. هنگام تغییر صفحه، HTML معنایی، فوکوس صفحه‌کلید، reduced motion و هر دو پوسته را حفظ کنید. پیش از ساخت primitive دیداری سفارشی، از componentهای daisyUI استفاده کنید.

## همگام‌سازی انتشار مرورگر

مرجع اصلی، working tree فعلی `apps/browser-extension` است؛ نه مخزن تو‌در‌تو یا Git ref راه دور. انتشار مرورگر باید manifest، نسخهٔ بسته و نخستین ورودی changelog یکسان داشته باشد.

```bash
pnpm --filter @rastchin/web sync:release:check
pnpm --filter @rastchin/web sync:release
```

فرمان نوشتن، `content/extension-release.ts` و `content/changelog.ts` را به‌روزرسانی و سپس `out/` را می‌سازد. خروجی تولیدشده نادیده گرفته می‌شود و هرگز به‌عنوان `ready-to-upload/` کپی یا commit نمی‌شود.

## بازخورد و استقرار

endpoint بازخورد، JSON محدود را اعتبارسنجی می‌کند، از honeypot و محدودیت نرخ اتمیک برای هر IP استفاده می‌کند و پیام plain-text/HTML پاک‌سازی‌شده را با SendGrid می‌فرستد. صفحهٔ حریم خصوصی، فیلدهای واردشده، IP، ‏User-Agent، پردازش SendGrid و دورهٔ نگه‌داری حداکثر ۱۲ماهه را اعلام می‌کند.

پیش از تغییر یا اجرای این مرز، راهنماهای زیر را بخوانید:

- [endpoint بازخورد](docs/feedback-endpoint.md)
- [استقرار Hetzner](docs/hetzner-deploy.md)
- [تصمیم‌های وب‌سایت](docs/project-decisions.md)
- [چک‌لیست هماهنگ انتشار](docs/launch-roadmap.md)

استقرار دستی است و به مجوز صریح مالک نیاز دارد. نام میزبان، نام حساب، مسیر راه دور، API key، رمز عبور و کلید خصوصی باید خارج از Git بمانند.

## مشارکت و مجوز

از [راهنمای مشارکت](../../CONTRIBUTING.md) ریشه شروع کنید و وب‌سایت را در ایشو یا پول‌ریکوئست خود به‌عنوان برنامهٔ مالک مشخص کنید. تغییر متمرکز وب‌سایت باید فرمان check و build همین برنامه را اجرا کند؛ تغییر مرز بازخورد افزون بر آن به lint با PHP 8.4 و آزمون مرز درخواست نیاز دارد.

کد دست‌اول راست‌چین تحت Apache License 2.0 است؛ [LICENSE](LICENSE) را ببینید. Vazirmatn تحت SIL Open Font License در [`public/fonts/OFL.txt`](public/fonts/OFL.txt) باقی می‌ماند. سایر جزئیات انتساب و نشان تجاری در [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) و [سیاست نشان تجاری](../../TRADEMARK.md) ریشه آمده‌اند.
