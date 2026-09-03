# فاز ۲ — چک‌لیست smoke / verify دستی

این فایل ماتریس کوتاه verify دستی برای baseline سخت‌شده‌ی فاز ۲ است تا اجراهای
بعدی (بعد از `Reload Window`، update شدن `Codex`/`Claude Code`، یا re-install شدن
VSIX روی lab) را سریع smoke کنیم.

## آنچه به‌صورت خودکار پوشش داده شده

- `pnpm --filter rastchin-vscode test` — مجموعه‌ی کامل تست‌های jsdom، patcher،
  transaction و lifecycle شامل:
  - کارت approval Codex: حالت معمول، **drift** (بدون `data-codex-approval-surface`)،
    no-op بودن fallback وقتی surface حاضر است، و گزینه‌ی **streamed** بعد از mount.
  - option_picker کدکس: pillهای bare با `role="radio"`/`role="checkbox"` که نه
    surface دارند نه `radiogroup`، با گارد ضد overreach برای کنترل‌های bare غیرمرتبط.
  - لیست‌های فارسی در پاسخ‌های Markdown کدکس: promotion والد `ol/ul` برای حفظ فاصله‌ی
    marker از لبه‌ی راست، همراه با گارد برای دست‌نخوردن لیست انگلیسی و code block.
  - میان‌برهای `Ctrl+RightShift`/`Ctrl+LeftShift` روی composer Codex و Claude:
    toggle on/off، انحصار متقابل rtl↔ltr، no-op وقتی composer فوکوس نیست، و گاردِ
    کلیدهای غیر `Ctrl`/غیر `Shift`؛ و no-throw در Plan Preview.
  - diagnostics نسخه‌ی **active**: مقایسه‌ی عددی نسخه (`2.1.10 > 2.1.9`،
    `26.616.51431 > 26.616.41845`) و سناریوی «فقط نسخه‌ی stale وصله‌شده».
  - patch-health: تشخیص patch حذف‌شده/قدیمی در startup و registry/focus، دکمه‌های
    **Re-apply Now**، **Later** و **View Details**، snooze دقیق ۲۴ساعته و مسیر
    diagnostic-only برای layout ناسازگار.
- نگاشت زنده‌ی باندل (drift map): hookهای اصلی روی نسخه‌های active
  (`claude 2.1.185`, `codex 26.616.51431`) حاضرند؛ drift پوششی option_picker
  در کدکس شناسایی و با fallback محدود به shape واقعی همان surface پوشش داده شده است.
- patch/status روی lab: نسخه‌ی active = `patched` (شاهد فایل‌محور؛ نسخه‌ای که VS Code
  بارگذاری می‌کند، marker ما را دارد).

## دستورهای smoke (هر بار اجرا قبل از checkpoint)

```bash
cd /absolute/path/to/rastchin
pnpm --filter rastchin-vscode test
pnpm --filter rastchin-vscode run package

# این دو مسیر باید مخصوص lab و جدا از profile روزانه باشند.
export RASTCHIN_VSCODE_USER_DATA_DIR="/absolute/path/to/rastchin-vscode-lab/user-data"
export RASTCHIN_VSCODE_EXTENSIONS_DIR="/absolute/path/to/rastchin-vscode-lab/extensions"

code --user-data-dir "$RASTCHIN_VSCODE_USER_DATA_DIR" \
     --extensions-dir "$RASTCHIN_VSCODE_EXTENSIONS_DIR" \
     --install-extension "apps/vscode-extension/rastchin-vscode-0.3.14.vsix" --force
node - <<'NODE'
const path = require('path');
const patcher = require('./apps/vscode-extension/src/patcher');
const extensionsRoot = process.env.RASTCHIN_VSCODE_EXTENSIONS_DIR;
if (!extensionsRoot || !path.isAbsolute(extensionsRoot)) {
  throw new Error('RASTCHIN_VSCODE_EXTENSIONS_DIR must be an absolute lab path');
}
console.log(JSON.stringify(patcher.patchAll({ extensionsRoot, includeClaude: true, includeCodex: true }), null, 2));
const s = patcher.status({ extensionsRoot });
for (const i of s.claude) console.log('claude', i.version, 'active=' + i.active, 'patched=' + i.patched);
for (const i of s.codex)  console.log('codex ', i.version, 'active=' + i.active, 'patched=' + i.patched);
NODE
```

انتظار: برای هر سطح، سطری با `active=true patched=true` ببینی. اگر `active=true
patched=false` دیدی یعنی نسخه‌ی فعال بعد از update وصله نشده → `Re-apply Patches`.

## ماتریس verify دستی زنده (GUI — هنوز debt)

این شش مورد فقط با تعامل انسانی روی پنجره‌ی lab با session لاگین‌شده‌ی
Codex/Claude قابل تأییدند؛ jsdom + شاهد فایل‌محور آن‌ها را تا حد منطق پوشش می‌دهد
ولی render نهایی باید چشمی دیده شود.

| # | سناریو | چطور | انتظار |
|---|--------|------|--------|
| 1 | Codex approval UI | تب `CODEX`: «یک فایل تست به نام codex-rtl-approval.txt … سؤال تأیید را فارسی بپرس» | سؤال/گزینه‌ها RTL؛ radio/checkbox سمت درست؛ command/path داخل کارت LTR+مونو؛ هنگام stream شدن گزینه‌ها RTL پایدار |
| 2 | Codex composer | همان تب، تایپ فارسی در composer | composer RTL + فونت Vazirmatn؛ متن انگلیسی/کد LTR |
| 3 | Claude composer | تب `CLAUDE CODE`: «یک فایل موقت به نام claude-rtl-check.txt بساز …» | composer و bubble فارسی RTL؛ preview/plaintext درست؛ statusهای انگلیسی LTR |
| 4 | میان‌برها | composer فارسی، `Ctrl+RightShift` و `Ctrl+LeftShift` روی هر دو سطح | RTL/LTR دستی toggle شود و با فشار دوباره برگردد |
| 5 | startup بعد از reload | `Reload Window` روی lab | بعد از reload، نسخه‌ی active همچنان patch؛ RTL بدون اجرای دستی برمی‌گردد |
| 6 | بازیابی پس از update | Codex یا Claude Code را update کنید، سپس VS Code را reload یا پنجره را دوباره focus کنید | اعلان patch-health ظاهر شود؛ **View Details** برنامهٔ فقط‌خواندنی را باز کند؛ **Later** همان نسخه را ۲۴ ساعت snooze کند؛ راست‌کلیک روی کارت RastChin در Extensions فرمان **Re-apply Patches** را نشان دهد |

## invariantهایی که نباید بشکنند (هنگام smoke چشمی چک شوند)

- command / code / path → LTR + monospace.
- statusهای انگلیسی (`Thinking`, `Worked for 3s`, `Actioning`, `Calculating`,
  `Puttering…`) → LTR.
- bubble/composer/plaintext/review preview فعلی Codex و Claude → بدون regress.
- `Markdown Preview` → سالم.
