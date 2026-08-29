# Chrome Web Store Submission Checklist

این چک‌لیست برای آماده‌سازی انتشار RastChin در Chrome Web Store از monorepo عمومی
پروژه است. ساخت بسته به‌معنی انتشار نیست و ارسال نهایی فقط با تصمیم maintainer
دارای دسترسی Developer Dashboard انجام می‌شود.

## 1. Build Package

از ریشه ریپو اجرا کن:

```bash
pnpm --filter rastchin-browser-extension run verify:store-assets
pnpm --filter rastchin-browser-extension run package:store
```

خروجی قابل آپلود:

```text
apps/browser-extension/dist/rastchin-v<version>-chrome-web-store.zip
```

این ZIP فقط از `apps/browser-extension/unpacked/` ساخته می‌شود و شامل Apache
`LICENSE`، فایل `NOTICE`، اعلان‌های third-party و مجوز OFL فونت است. خود پوشه‌های
`dist/` و `unpacked/`، فایل‌های local، ZIP داخلی، CRX، PEM و `node_modules` وارد
بسته نمی‌شوند.

## 2. Upload

در Chrome Web Store Developer Dashboard:

- آیتم ردشده RastChin را باز کن: `https://chrome.google.com/webstore/devconsole`
- از بخش **Package** فایل ZIP ساخته‌شده در `apps/browser-extension/dist/` را upload کن.
- اگر dashboard خطای manifest یا permission داد، قبل از ادامه ZIP را دوباره با
  `pnpm --filter rastchin-browser-extension run verify:store-zip` بررسی کن.

## 3. Store Listing

- Extension name: `RastChin راست‌چین - Persian RTL & Font`
- Short description: از `store/chrome/listing-fa.md` کپی شود.
- Full description: از `store/chrome/listing-fa.md` کپی شود.
- Category: `Productivity`
- Language: اگر Persian/Farsi در dashboard قابل انتخاب بود، فارسی را انتخاب کن؛
  در غیر این صورت English را انتخاب کن و متن فارسی را در listing نگه دار.
- Website: `https://rastchin.tools/`
- Support URL: `https://rastchin.tools/feedback/`
- Privacy policy URL: `https://rastchin.tools/privacy/`
- Submission note:

```text
We updated the Chrome Web Store listing to remove excessive brand/site keyword lists. The description now focuses on the extension's core functionality, and the full supported-site list is referenced via the official website instead of repeated in store metadata.
```

## 4. Images

دارایی‌های الزامی:

- آیکون `128x128px` داخل ZIP: `src/assets/icons/thumbnails/icon128.png`
- Small promo tile: `440x280`
- حداقل 1 screenshot و حداکثر 5 screenshot با اندازه `1280x800` یا `640x400`

دارایی‌های آماده فعلی:

- `store/chrome/images/promo-small-440x280.png`
- `store/chrome/images/screenshot-1-ai-tools-1280x800.png`
- `store/chrome/images/screenshot-2-settings-1280x800.png`
- `store/chrome/images/screenshot-3-trello-1280x800.png`
- `store/chrome/images/screenshot-4-youtube-1280x800.png`

دارایی پیشنهادی:

- Marquee promo tile: `1400x560`

چک‌لیست نام‌گذاری و brief طراحی در `store/chrome/assets-checklist.md` و
`store/chrome/creative-briefs-fa.md` ثبت شده است.

## 5. Privacy

از `store/chrome/privacy-dashboard-fa.md` استفاده کن:

- Single purpose
- Data usage
- Limited Use disclosure
- Permission justifications
- Host access justification

به‌خصوص justification مربوط به `tabs` باید توضیح دهد که side panel فقط ID و URL
تب فعال را برای تشخیص سایت پشتیبانی‌شده و دنبال کردن تغییر tab/navigation می‌خواند؛
افزونه history را enumerate یا نگهداری نمی‌کند و URL تب را ارسال نمی‌کند.

## 6. Final Review Before Submit

- `manifest.json` و `package.json` هر دو نسخه یکسان داشته باشند.
- لینک‌های website، feedback و privacy روی سایت live باز شوند.
- فرم feedback سایت ایمیل تست را با موفقیت ارسال کند.
- ZIP نهایی بعد از آخرین تغییرات دوباره با
  `pnpm --filter rastchin-browser-extension run package:store` ساخته شده باشد.
- هیچ فایل secret، config local، ZIP قدیمی، CRX، PEM یا artifact توسعه داخل ZIP نباشد.

## Official References

- Chrome Web Store upload flow: `https://developer.chrome.com/docs/webstore/publish`
- Chrome Web Store image requirements: `https://developer.chrome.com/docs/webstore/images`
- Chrome Web Store program policies: `https://developer.chrome.com/docs/webstore/program-policies/policies`
- Chrome Web Store user data FAQ: `https://developer.chrome.com/docs/webstore/program-policies/user-data-faq`
