# تصمیم‌ها و قوانین سایت RastChin

این فایل تصمیم‌هایی را ثبت می‌کند که مستقیماً روی `rastchin.tools` و ارتباط آن با
سایر بخش‌های پروژه اثر دارند. تصمیم‌های کل محصول در `../../../docs/product.md`
قرار دارند.

## ریپوی عمومی یکپارچه

تصمیم: سایت و سه ابزار محلی در یک monorepo عمومی نگهداری می‌شوند:

```text
apps/
  web/
  browser-extension/
  vscode-extension/
  desktop-integrator/
```

- `apps/web` مالک صفحه‌ها، محتوای عمومی، privacy، feedback و static export است.
- هر ابزار دیگر release مستقل خودش را دارد، اما source، issueها، CI و راهنمای
  مشارکت همگی در ریپوی `omega-do-it-solutions/rastchin` هستند.
- `.git` دیگری داخل `apps/` ساخته یا کپی نمی‌شود.
- `node_modules`، `.next`، `out`، VSIX، ZIP، DMG، AppImage و artifactهای مشابه
  ساخته می‌شوند ولی وارد Git نمی‌شوند.
- همهٔ کدهای اصلی پروژه زیر Apache-2.0 هستند؛ مجوز کد حق استفاده از نام و نشان
  RastChin را نمی‌دهد. جزئیات در `LICENSE` و `TRADEMARK.md` ریشهٔ ریپو است.

## مدل routeهای سایت

`rastchin.tools` هاب عمومی ابزارهای فارسی و RTL است.

- `/` معرفی اکوسیستم و افزونهٔ مرورگر است.
- `/vscode-rtl/` صفحهٔ افزونهٔ VS Code است.
- `/privacy/`، `/feedback/` و `/changelog/` قراردادهای عمومی پایدار هستند.
- routeهای جدید باید با static export سازگار باشند، مگر تغییر معماری جداگانه‌ای
  تصویب شود.
- CTA دانلود فقط به marketplace یا release رسمی و قابل‌راستی‌آزمایی وصل می‌شود.

## همگام‌سازی release مرورگر

منبع رسمی نسخه و changelog افزونه، workspace همسایه یعنی
`apps/browser-extension` است. script به ریپوی جداگانه، `origin/main` یا network
fetch وابسته نیست.

1. نسخه‌های `manifest.json` و `package.json` افزونه باید برابر باشند.
2. اولین entry در `src/ui/shared/changelog-data.js` باید همان نسخه را داشته باشد.
3. پس از آماده‌شدن release، `pnpm --filter @rastchin/web sync:release` اجرا شود.
4. script فایل‌های `content/extension-release.ts` و `content/changelog.ts` را
   همگام و سایت را build می‌کند.
5. `pnpm --filter @rastchin/web sync:release:check` فقط وضعیت را بررسی می‌کند.
6. خروجی نهایی فقط `apps/web/out` است و در Git ثبت نمی‌شود.

نسخه در copy صفحه hard-code نمی‌شود و privacy/footer از
`extensionVersionLabel()` استفاده می‌کنند.

## فرم feedback

- UI فرم و endpoint سمت سرور هر دو متعلق به سایت هستند.
- ابزارهای نصب‌شده می‌توانند کاربر را با queryهای `source`، `version` و `type` به
  `/feedback/` هدایت کنند، اما نباید خودشان متن صفحه، prompt، سند یا secret ارسال
  کنند.
- endpoint فقط JSON محدودشده را می‌پذیرد، honeypot و rate limit اتمیک دارد و
  پیام را با SendGrid تحویل می‌دهد.
- SendGrid key و تنظیمات سرور هرگز وارد JavaScript، static artifact یا Git
  نمی‌شوند.
- صفحهٔ privacy فیلدهای فرم، IP، User-Agent، پردازش SendGrid و نگهداری حداکثر
  ۱۲ماهه را شفاف توضیح می‌دهد.

## hosting و deploy

- `pnpm --filter @rastchin/web build` static export را در `apps/web/out` می‌سازد.
- deploy دستی فقط همین پوشه را به document root میزبان PHP منتقل می‌کند.
- host، user، port، remote path و credential باید در زمان اجرا ارائه شوند؛ هیچ
  مقدار اختصاصی زیرساخت در ریپو قرار نمی‌گیرد.
- dry run و تأیید صریح مالک قبل از deploy production الزامی است.
- CI عادی build و verify می‌کند و به production وصل نمی‌شود.

## حریم خصوصی و مرز محصول

- پردازش RTL افزونه‌ها و desktop integrator محلی است.
- سایت account، database، telemetry یا analytics پنهان ندارد.
- endpoint feedback تنها مسیر ارسال دادهٔ اختیاری کاربر است.
- هر integration باید در نسخهٔ ناشناخته یا ناسازگار fail closed کند و نباید
  فایل امضاشدهٔ vendor را بدون رضایت و مسیر recovery تغییر دهد.
