# Chrome Web Store Privacy Dashboard

این متن‌ها برای پر کردن بخش Privacy و permission justification در Chrome Web Store
Developer Dashboard آماده شده‌اند.

## Single Purpose

RastChin خوانایی متن فارسی را در سایت‌های پشتیبانی‌شده بهتر می‌کند: راست‌چینی
فارسی‌محور، تایپوگرافی Vazirmatn، حفظ خوانایی متن‌های فارسی/انگلیسی ترکیبی و کنترل
نمایش زیرنویس فارسی YouTube.

## Data Usage

RastChin متن صفحه، promptها، پیام‌ها، سندها، کارت‌ها، کامنت‌ها، زیرنویس‌ها،
اطلاعات شناسایی شخصی، اطلاعات مالی، اطلاعات سلامت، موقعیت مکانی، تاریخچه مرور وب
یا فعالیت کاربر را جمع‌آوری، ارسال، فروش یا برای تبلیغات استفاده نمی‌کند.

پردازش RTL، فونت و تشخیص متن ترکیبی داخل مرورگر انجام می‌شود. تنها داده ذخیره‌شده
ترجیح‌های نمایشی کاربر است؛ مثل روشن/خاموش بودن افزونه، روشن/خاموش بودن هر پلتفرم
و تنظیمات نمایش زیرنویس YouTube. این تنظیمات در `chrome.storage.sync` ذخیره می‌شود
و ممکن است توسط Chrome بین دستگاه‌های همان کاربر sync شود.

بازخورد و پشتیبانی خارج از افزونه و از طریق قالب‌های ایشوی عمومی GitHub انجام
می‌شود. افزونه هیچ محتوایی را به ایشو اضافه نمی‌کند و کاربر نباید اطلاعات خصوصی
را در گزارش عمومی قرار دهد.

## Limited Use Disclosure

RastChin's use and transfer of information received from Chrome APIs adheres to the
Chrome Web Store User Data Policy, including the Limited Use requirements.

## Permission Justifications

### `storage`

برای ذخیره ترجیح‌های نمایشی کاربر استفاده می‌شود: وضعیت روشن/خاموش افزونه،
تنظیمات هر پلتفرم و تنظیمات زیرنویس YouTube. این permission برای ذخیره متن صفحه،
prompt، پیام، کامنت یا سند کاربر استفاده نمی‌شود.

### `activeTab`

پس از اقدام مستقیم کاربر روی افزونه، دسترسی موقت و محدود به تب فعلی را فراهم می‌کند
تا popup/side panel بتواند وضعیت و کنترل همان سایت را ارائه کند. این permission
برای جمع‌آوری تاریخچه مرور یا ارسال محتوای صفحه به سرور استفاده نمی‌شود.

### `sidePanel`

برای نمایش رابط کناری افزونه داخل Chrome استفاده می‌شود تا کاربر بتواند تنظیمات
راست‌چین را بدون خروج از صفحه مدیریت کند.

### `tabs`

پنل کناری ممکن است بدون یک user gesture تازه باز بماند و باید هنگام عوض شدن تب یا
URL، وضعیت سایت فعال را به‌روز کند؛ حتی روی صفحه‌ای که content script در دسترس نیست.
افزونه با `chrome.tabs.query` فقط ID و URL تب فعال پنجره فعلی را برای تشخیص پلتفرم
می‌خواند و به رویدادهای activation/navigation گوش می‌دهد. history مرور enumerate یا
ذخیره نمی‌شود، عنوان و محتوای صفحه جمع‌آوری نمی‌شود و URL تب به سرور ارسال نمی‌شود.

## Host Access Justification

RastChin فقط روی دامنه‌های مشخص‌شده در `manifest.json` اجرا می‌شود. این دسترسی‌ها
برای اعمال RTL، فونت و تنظیمات نمایشی روی سایت‌های پشتیبانی‌شده لازم هستند.
افزونه روی دامنه‌های خارج از این فهرست اجرا نمی‌شود و محتوای صفحه را به سرور ارسال
نمی‌کند.

## Privacy Policy URL

`https://github.com/omega-do-it-solutions/rastchin/blob/main/apps/browser-extension/store/chrome/privacy-policy-fa.md`

## Support URL

`https://github.com/omega-do-it-solutions/rastchin/issues/new/choose`
