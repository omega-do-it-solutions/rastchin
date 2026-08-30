# Chrome Web Store Assets

مسیرهای نسبی این سند از `apps/browser-extension/` محاسبه می‌شوند.

بر اساس راهنمای رسمی Chrome Web Store، دارایی‌های حداقلی برای listing شامل آیکون
128px، یک promotional image کوچک 440x280 و حداقل یک screenshot با اندازه 1280x800
یا 640x400 است. برای screenshotها حداکثر 5 فایل قابل ارسال است.

## فایل‌های الزامی برای حداقل انتشار

- آیکون `128x128px` در manifest: `src/assets/icons/thumbnails/icon128.png`
- `images/promo-small-440x280.png`
- چهار screenshot با اندازه `1280x800px`

## فایل‌های آماده فعلی

- `images/promo-small-440x280.png`
- `images/screenshot-1-ai-tools-1280x800.png`
- `images/screenshot-2-settings-1280x800.png`
- `images/screenshot-3-trello-1280x800.png`
- `images/screenshot-4-youtube-1280x800.png`

## فایل اختیاری ولی توصیه‌شده

- `images/promo-marquee-1400x560.png`

Brief طراحی هر فایل در `store/chrome/creative-briefs-fa.md` ثبت شده است. خروجی‌های generated قبلی حذف شده‌اند؛ خروجی‌های نهایی گرافیست باید در `store/chrome/images/` و با نام‌های بالا export شوند.

## نکته انتشار

Promo tile نباید صرفاً اسکرین‌شات خام باشد. screenshotها باید full-bleed باشند و
نباید padding، border، گوشه گرد یا تزئینات اضافه اطراف تصویر داشته باشند.

بعد از export نهایی، ابعاد فایل‌ها را از ریشه monorepo با این دستور بررسی کنید:

```bash
pnpm --filter rastchin-browser-extension run verify:store-assets
```
