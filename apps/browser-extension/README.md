# افزونهٔ مرورگر راست‌چین

راست‌چین خواندن متن فارسی را در ابزارهای وب پشتیبانی‌شده آسان‌تر می‌کند. این افزونه جهت RTL فارسی‌محور و فونت Vazirmatn همراه خود را اعمال می‌کند و در عین حال کد، فرمان، URL، نشانی ایمیل، مسیر و متن انگلیسیِ موجود در محتوای ترکیبی را خوانا نگه می‌دارد. زبان طبیعیِ تحت پشتیبانی فقط فارسی است.

این افزونه local-first است: متن صفحه، promptها، پیام‌ها، سندها، نظرها و زیرنویس‌ها برای پردازش RTL یا فونت در خود مرورگر پردازش می‌شوند و جایی بارگذاری نمی‌شوند.

- مونوریپو: [omega-do-it-solutions/rastchin](https://github.com/omega-do-it-solutions/rastchin)
- پوشهٔ برنامه: `apps/browser-extension`

## محیط‌های پشتیبانی‌شده

manifest در حال حاضر ChatGPT، ‏Claude، ‏Microsoft Copilot، ‏Gemini، ‏Google AI Studio، ‏Perplexity، ‏DeepSeek، ‏NotebookLM، ‏Qwen، ‏Arena، ‏GitHub، ‏Visual Studio Marketplace، ‏Trello، ‏Notion، ‏Gmail، ‏Google Translate، ‏Google Docs و Sheets، ‏WhatsApp Web، ‏Telegram Web و YouTube را پوشش می‌دهد. سطح پشتیبانی در سایت‌ها متفاوت است: برخی مدیریت کامل جهت را دریافت می‌کنند و برخی عمداً فقط بهبود محدود تایپوگرافی یا زیرنویس دارند.

فایل `manifest.json` مرجع اصلی میزبان‌ها و ماژول‌های تزریق‌شدهٔ تحت پشتیبانی است.

## حریم خصوصی و مجوزها

راست‌چین هیچ analytics، تله‌متری، tracking pixel یا مسیر بارگذاری محتوای صفحه ندارد. تنظیمات نمایش از طریق `chrome.storage.sync` ذخیره می‌شود و ممکن است Chrome آن‌ها را میان مرورگرهای واردشدهٔ خود کاربر همگام کند.

مجوزهای Manifest V3 این کاربردها را دارند:

- `storage` کلید سراسری، کلیدهای هر پلتفرم و تنظیمات ظاهر زیرنویس YouTube را نگه می‌دارد. از آن برای نگه‌داری محتوای صفحه استفاده نمی‌شود.
- `activeTab` هنگامی که کاربر اکشن افزونه را اجرا می‌کند، دسترسی موقت و وابسته به کنش کاربر را به تب فعلی می‌دهد.
- `sidePanel` رابط side panel مرورگر را فراهم می‌کند.
- `tabs` به side panel باز اجازه می‌دهد شناسه و URL تب فعال را بخواند و به تغییر تب فعال یا URL آن واکنش نشان دهد. به این ترتیب حتی وقتی content script نتواند پاسخ دهد، وضعیت سایت پشتیبانی‌شده دقیق می‌ماند. راست‌چین تاریخچهٔ مرور را فهرست یا نگه‌داری نمی‌کند و URL تب‌ها را انتقال نمی‌دهد.

content scriptها فقط روی میزبان‌های صریح `manifest.json` اجرا می‌شوند. برای توضیح کامل، [متن حریم خصوصی Chrome Web Store](store/chrome/privacy-dashboard-fa.md) را ببینید.

## نقشهٔ کد

```text
manifest.json              تعریف Chrome Manifest V3
src/background/            چرخهٔ نصب، به‌روزرسانی و side panel
src/core/                  runtime مشترک جهت، فونت، bidi و recipe
src/platforms/             recipeها و مرزهای ایمنی ویژهٔ میزبان
src/ui/popup/              اکشن فشردهٔ افزونه
src/ui/side-panel/         وضعیت و تنظیمات هر پلتفرم
src/ui/welcome/            راهنمای نخستین نصب
src/ui/whats-new/          نکات برجستهٔ انتشار
src/assets/                آیکن‌ها و فونت Vazirmatn محلی
test/                      آزمون‌های رگرسیون Node بدون وابستگی
scripts/                   ساخت انتشار، QA و بررسی خروجی
store/chrome/              محتوای صفحهٔ فروشگاه، حریم خصوصی، تصویر و ارسال
```

adapter هر پلتفرم باید هنگام تغییر چیدمان میزبان فقط همان بخش را متوقف کند. کد، ویرایشگر، خروجی ترمینال، URL و محتوای صریح LTR را وارد قواعد گستردهٔ RTL نکنید. هرگز گردآوری یا انتقال شبکه‌ای محتوای صفحه را اضافه نکنید.

## توسعهٔ محلی

نیازمندی‌ها Node.js 24، ‏pnpm 11، ‏Bash، ‏`rsync` و Chrome 114 یا جدیدتر هستند. از ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm install
pnpm --filter rastchin-browser-extension test
pnpm --filter rastchin-browser-extension run build:unpacked
pnpm --filter rastchin-browser-extension run verify:unpacked
```

افزونه bundler یا نصب وابستگی در زمان اجرا ندارد. اسکریپت ساخت، سورس بازبینی‌شده، manifest، مجوز Apache، اعلان پروژه و اعلان‌های اشخاص ثالث را در `apps/browser-extension/unpacked/` کپی می‌کند.

برای آزمایش در Chrome:

1. `chrome://extensions` را باز کنید.
2. **Developer mode** را فعال کنید.
3. **Load unpacked** را انتخاب کنید.
4. پوشهٔ `apps/browser-extension/unpacked/` را انتخاب کنید.
5. در QA دستی فقط از حساب آزمایشی و محتوای غیرحساس استفاده کنید.

اسکریپت‌های QA مرورگر برای هر میزبان متغیر `CHROMIUM_BIN` را می‌پذیرند؛ پیش‌نیازها و فرمان در ابتدای هر اسکریپت مستند شده است.

## ساخت بستهٔ فروشگاه

از ریشهٔ مونوریپو اجرا کنید:

```bash
pnpm --filter rastchin-browser-extension run verify:store-assets
pnpm --filter rastchin-browser-extension run package:store
```

خروجی تأییدشدهٔ بارگذاری در این مسیر نوشته می‌شود:

```text
apps/browser-extension/dist/rastchin-v<version>-chrome-web-store.zip
```

فرمان بسته‌بندی، برابری نسخه‌ها را بررسی می‌کند، همهٔ آزمون‌ها را اجرا می‌کند، درخت unpacked را دوباره می‌سازد، برابری سورس و اعلان‌های حقوقی را می‌سنجد، ZIP می‌سازد و محتوای آن را بررسی می‌کند. مسیرها و فایل‌های تولیدشدهٔ `unpacked/`، ‏`dist/`، ‏ZIP، ‏CRX، کلید، پروفایل و QA محلی عمداً از Git خارج‌اند.

پیش از آماده‌سازی انتشار، [نسخه‌بندی](docs/VERSIONING.md) و [چک‌لیست ارسال](store/chrome/submission-checklist.md) را ببینید. ساخت خروجی آن را منتشر نمی‌کند.

## مشارکت و امنیت

پیش از تغییر adapter پلتفرم یا مجوز، [راهنمای مشارکت](../../CONTRIBUTING.md) مخزن را بخوانید. آسیب‌پذیری‌ها را از کانال خصوصی [SECURITY.md](../../SECURITY.md) گزارش کنید، نه در ایشوی عمومی.

## مجوز و نشان‌های تجاری

سورس راست‌چین تحت [مجوز Apache 2.0](LICENSE) است. Vazirmatn تحت OFL-1.1 باقی می‌ماند؛ [اعلان‌های اشخاص ثالث](THIRD_PARTY_NOTICES.md) را ببینید. مجوز Apache حقی برای استفاده از نام یا لوگوی راست‌چین نمی‌دهد؛ [سیاست نشان تجاری](../../TRADEMARK.md) مخزن را ببینید.

بستهٔ فضای کاری فقط برای جلوگیری از انتشار تصادفی در npm با `private` علامت‌گذاری شده است؛ این مقدار حقوق Apache-2.0 سورس را تغییر نمی‌دهد.

راست‌چین از وب‌سایت‌ها و محصولات شخص ثالثی که پشتیبانی می‌کند مستقل است.
