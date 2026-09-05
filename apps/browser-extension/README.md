# افزونهٔ مرورگر راست‌چین

راست‌چین خواندن متن فارسی را در ابزارهای وب پشتیبانی‌شده آسان‌تر می‌کند. این افزونه جهت RTL فارسی‌محور و فونت Vazirmatn همراه خود را اعمال می‌کند و در عین حال کد، فرمان، URL، نشانی ایمیل، مسیر و متن انگلیسیِ موجود در محتوای ترکیبی را خوانا نگه می‌دارد. زبان طبیعیِ تحت پشتیبانی فقط فارسی است.

این افزونه local-first است: متن صفحه، promptها، پیام‌ها، سندها، نظرها و زیرنویس‌ها برای پردازش RTL یا فونت در خود مرورگر پردازش می‌شوند و جایی بارگذاری نمی‌شوند.

- مونوریپو: [omega-do-it-solutions/rastchin](https://github.com/omega-do-it-solutions/rastchin)
- پوشهٔ برنامه: `apps/browser-extension`

## محیط‌های پشتیبانی‌شده

manifest در حال حاضر ChatGPT، ‏Meta AI، ‏Claude، ‏Microsoft Copilot، ‏Gemini، ‏Google AI Studio، ‏Perplexity، ‏DeepSeek، ‏NotebookLM، ‏Qwen، ‏Arena، ‏GitHub، ‏Visual Studio Marketplace، ‏Trello، ‏Notion، ‏Linear، ‏Gmail، ‏Google Translate، ‏Google Docs و Sheets، ‏WhatsApp Web، ‏Telegram Web و YouTube را پوشش می‌دهد. سطح پشتیبانی در سایت‌ها متفاوت است: برخی مدیریت کامل جهت را دریافت می‌کنند و برخی عمداً فقط بهبود محدود تایپوگرافی یا زیرنویس دارند.

فایل `manifest.json` مرجع اصلی میزبان‌ها و ماژول‌های تزریق‌شدهٔ تحت پشتیبانی است.

## حریم خصوصی و مجوزها

راست‌چین هیچ analytics، تله‌متری، tracking pixel یا مسیر بارگذاری محتوای صفحه ندارد. تنظیمات نمایش از طریق WebExtension storage ذخیره می‌شود و ممکن است قابلیت همگام‌سازی حساب مرورگر آن‌ها را میان دستگاه‌های خود کاربر منتقل کند.

مجوزهای Manifest V3 این کاربردها را دارند:

- `storage` کلید سراسری، کلیدهای هر پلتفرم و تنظیمات ظاهر زیرنویس YouTube را نگه می‌دارد. از آن برای نگه‌داری محتوای صفحه استفاده نمی‌شود.
- `activeTab` هنگامی که کاربر اکشن افزونه را اجرا می‌کند، دسترسی موقت و وابسته به کنش کاربر را به تب فعلی می‌دهد.
- `sidePanel` فقط در بستهٔ Chrome حضور دارد و رابط side panel آن مرورگر را فراهم می‌کند. بستهٔ Firefox همین رابط محلی را از طریق `sidebar_action` manifest باز می‌کند و این مجوز Chrome را ندارد.
- `tabs` به side panel باز اجازه می‌دهد شناسه و URL تب فعال را بخواند و به تغییر تب فعال یا URL آن واکنش نشان دهد. به این ترتیب حتی وقتی content script نتواند پاسخ دهد، وضعیت سایت پشتیبانی‌شده دقیق می‌ماند. راست‌چین تاریخچهٔ مرور را فهرست یا نگه‌داری نمی‌کند و URL تب‌ها را انتقال نمی‌دهد.

content scriptها فقط روی میزبان‌های صریح manifest اجرا می‌شوند. برای توضیح کامل، [متن حریم خصوصی Chrome Web Store](store/chrome/privacy-dashboard-fa.md) و [سیاست حریم خصوصی Firefox](store/firefox/privacy-policy-fa.md) را ببینید.

## نقشهٔ کد

```text
manifest.json              مرجع اصلی نسخه، میزبان‌ها و manifest سازگار با Chrome
src/background/            چرخهٔ نصب، به‌روزرسانی و side panel
src/core/                  runtime مشترک جهت، فونت، bidi و recipe
src/platforms/             recipeها و مرزهای ایمنی ویژهٔ میزبان
src/ui/popup/              اکشن فشردهٔ افزونه
src/ui/side-panel/         وضعیت و تنظیمات هر پلتفرم
src/ui/welcome/            راهنمای نخستین نصب
src/ui/whats-new/          نکات برجستهٔ انتشار
src/assets/                آیکن‌ها و فونت Vazirmatn محلی
test/                      آزمون‌های رگرسیون Node و مرورگر واقعی
scripts/                   ساخت انتشار، QA و بررسی خروجی
store/chrome/              محتوای صفحهٔ فروشگاه، حریم خصوصی، تصویر و ارسال
store/firefox/             متن فهرست، حریم خصوصی و چک‌لیست Firefox Add-ons
```

adapter هر پلتفرم باید هنگام تغییر چیدمان میزبان فقط همان بخش را متوقف کند. کد، ویرایشگر، خروجی ترمینال، URL و محتوای صریح LTR را وارد قواعد گستردهٔ RTL نکنید. هرگز گردآوری یا انتقال شبکه‌ای محتوای صفحه را اضافه نکنید.

## توسعهٔ محلی

نیازمندی‌ها Node.js 24، ‏pnpm 11، ‏Bash و `rsync` هستند. برای QA مرورگر واقعی به Chrome 114+ یا Firefox 142+ نیاز دارید. از ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm install
pnpm --filter rastchin-browser-extension test
pnpm --filter rastchin-browser-extension run build:unpacked
pnpm --filter rastchin-browser-extension run verify:unpacked
pnpm --filter rastchin-browser-extension run build:firefox
pnpm --filter rastchin-browser-extension run verify:firefox
```

افزونه bundler یا نصب وابستگی در زمان اجرا ندارد. اسکریپت‌های ساخت، سورس بازبینی‌شده و فایل‌های حقوقی را بدون تغییر کپی می‌کنند. نسخهٔ Chrome در `apps/browser-extension/unpacked/` ساخته می‌شود. نسخهٔ Firefox در `apps/browser-extension/unpacked-firefox/` همان نسخه و میزبان‌ها را با manifest تولیدشدهٔ قطعی Firefox دارد؛ این تبدیل service worker و side panel مخصوص Chrome را با معادل Firefox جایگزین می‌کند.

برای آزمایش در Chrome:

1. `chrome://extensions` را باز کنید.
2. **Developer mode** را فعال کنید.
3. **Load unpacked** را انتخاب کنید.
4. پوشهٔ `apps/browser-extension/unpacked/` را انتخاب کنید.
5. در QA دستی فقط از حساب آزمایشی و محتوای غیرحساس استفاده کنید.

برای آزمایش در Firefox:

1. `about:debugging` را باز کنید.
2. **This Firefox** و سپس **Load Temporary Add-on** را انتخاب کنید.
3. فایل `apps/browser-extension/unpacked-firefox/manifest.json` را انتخاب کنید.
4. روی آیکون راست‌چین کلیک و بازشدن پنل کناری را بررسی کنید.
5. در QA دستی فقط از حساب آزمایشی و محتوای غیرحساس استفاده کنید.

اسکریپت‌های QA مرورگر برای هر میزبان متغیر `CHROMIUM_BIN` را می‌پذیرند؛ پیش‌نیازها و فرمان در ابتدای هر اسکریپت مستند شده است.

### آزمون ویرایشگر Linear

برای اجرای آزمون رگرسیون با ویرایشگر واقعی ProseMirror:

```bash
pnpm --filter rastchin-browser-extension qa:linear-editor
```

نشانی محلی چاپ‌شده را در مرورگر باز کنید. نتیجه باید `PASS` باشد. این آزمون جهت بندهای فارسی و انگلیسی، عنوان کارت، فهرست و جدول، حفظ گره‌های ویرایشگر، ویرایش متن و خاموش‌وروشن‌کردن افزونه را بررسی می‌کند. وابستگی‌های ProseMirror فقط برای توسعه هستند و در بستهٔ افزونه قرار نمی‌گیرند. آزمون‌های سریع `pnpm test` همچنان جداگانه اجرا می‌شوند. برای مقایسه با نسخه‌ای قدیمی، مسیر مطلق فایل `linear-rtl.js` آن را به فرمان آزمون اضافه کنید.

## ساخت بستهٔ فروشگاه

از ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm --filter rastchin-browser-extension run verify:store-assets
pnpm --filter rastchin-browser-extension run package:all
```

خروجی‌های تأییدشدهٔ بارگذاری در این مسیرها نوشته می‌شوند:

```text
apps/browser-extension/dist/rastchin-v<version>-chrome-web-store.zip
apps/browser-extension/dist/rastchin-v<version>-firefox-add-ons.zip
```

فرمان بسته‌بندی، برابری نسخه‌ها را بررسی می‌کند، همهٔ آزمون‌ها را اجرا می‌کند، هر دو درخت unpacked را دوباره می‌سازد، برابری سورس، manifest و اعلان‌های حقوقی را می‌سنجد، دو ZIP می‌سازد و محتوای هرکدام را با قواعد مقصد خودش بررسی می‌کند. برای ساخت جداگانه از `package:store` یا `package:firefox` استفاده کنید. مسیرها و فایل‌های تولیدشدهٔ `unpacked/`، ‏`unpacked-firefox/`، ‏`dist/`، ‏ZIP، ‏CRX/XPI، کلید، پروفایل و QA محلی عمداً از Git خارج‌اند.

پیش از آماده‌سازی انتشار، [نسخه‌بندی](docs/VERSIONING.md)، [چک‌لیست Chrome](store/chrome/submission-checklist.md) و [چک‌لیست Firefox](store/firefox/submission-checklist.md) را ببینید. ساخت خروجی آن را منتشر یا امضا نمی‌کند.

## مشارکت و امنیت

پیش از تغییر adapter پلتفرم یا مجوز، [راهنمای مشارکت](../../CONTRIBUTING.md) مخزن را بخوانید. آسیب‌پذیری‌ها را از کانال خصوصی [SECURITY.md](../../SECURITY.md) گزارش کنید، نه در ایشوی عمومی.

## مجوز و نشان‌های تجاری

سورس راست‌چین تحت [مجوز Apache 2.0](LICENSE) است. Vazirmatn تحت OFL-1.1 باقی می‌ماند؛ [اعلان‌های اشخاص ثالث](THIRD_PARTY_NOTICES.md) را ببینید. مجوز Apache حقی برای استفاده از نام یا لوگوی راست‌چین نمی‌دهد؛ [سیاست نشان تجاری](../../TRADEMARK.md) مخزن را ببینید.

بستهٔ فضای کاری فقط برای جلوگیری از انتشار تصادفی در npm با `private` علامت‌گذاری شده است؛ این مقدار حقوق Apache-2.0 سورس را تغییر نمی‌دهد.

راست‌چین از وب‌سایت‌ها و محصولات شخص ثالثی که پشتیبانی می‌کند مستقل است.
