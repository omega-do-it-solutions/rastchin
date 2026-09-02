# چک‌لیست انتشار در Firefox Add-ons

این چک‌لیست برای ساخت و ارسال دستی نسخهٔ Firefox راست‌چین به addons.mozilla.org است. ساخت ZIP به‌معنی امضا یا انتشار نیست.

## ساخت و بررسی

از ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm --filter rastchin-browser-extension package:firefox
```

خروجی قابل‌ارسال:

```text
apps/browser-extension/dist/rastchin-v<version>-firefox-add-ons.zip
```

ZIP باید فایل‌های افزونه را مستقیماً در ریشه داشته باشد، نه یک پوشهٔ اضافی. بسته شامل manifest مخصوص Firefox، سورس خوانا، فونت محلی، `LICENSE`، ‏`NOTICE` و اعلان‌های اشخاص ثالث است.

## آزمون موقت در Firefox

1. `about:debugging` را باز کنید.
2. **This Firefox** و سپس **Load Temporary Add-on** را انتخاب کنید.
3. فایل `apps/browser-extension/unpacked-firefox/manifest.json` یا ZIP ساخته‌شده را انتخاب کنید.
4. بررسی کنید کلیک روی آیکون افزونه پنل کناری را باز می‌کند.
5. نصب اولیه، تنظیم‌های سراسری/میزبان، ذخیرهٔ تنظیم‌ها و میزبان‌های تغییریافته را با محتوای ساختگی بررسی کنید.
6. در `about:addons` اعلام «بدون جمع‌آوری داده» و مجوزها را بازبینی کنید.

نصب موقت پس از بستن Firefox پایدار نیست. نسخهٔ قابل‌توزیع عمومی باید توسط Mozilla امضا شود.

## ارسال به AMO

1. وارد Firefox Add-ons Developer Hub شوید و **Submit a New Add-on** را انتخاب کنید.
2. انتشار فهرست‌شده در AMO را انتخاب و ZIP تأییدشده را بارگذاری کنید.
3. متن [listing-fa.md](listing-fa.md)، سیاست [privacy-policy-fa.md](privacy-policy-fa.md)، مجوز Apache-2.0 و اطلاعات پشتیبانی را وارد کنید.
4. اعلام کنید افزونه minify یا bundle نشده و سورس داخل بسته خوانا است.
5. اخطارها و خطاهای validator را پیش از ارسال نهایی رفع کنید.
6. پس از تأیید، فایل امضاشده را از AMO نصب و smoke test کوتاه را روی کانال واقعی تکرار کنید.

شناسهٔ Gecko برابر `rastchin@rastchin.tools` و حداقل نسخهٔ پشتیبانی‌شده Firefox دسکتاپ `142.0` است. این حداقل با validator مشترک دسکتاپ/Android سازگار است، اما بسته فقط برای Firefox دسکتاپ فهرست می‌شود و `gecko_android` را اعلام نمی‌کند. کلید یا راز AMO نباید وارد Git یا لاگ شود.

## منابع رسمی

- `https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/`
- `https://extensionworkshop.com/documentation/publish/package-your-extension/`
- `https://extensionworkshop.com/documentation/publish/submitting-an-add-on/`
- `https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/`
