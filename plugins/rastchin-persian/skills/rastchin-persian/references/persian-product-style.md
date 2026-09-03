# Persian product style

Use this reference for multi-string localization, Persian-copy review, or a
product that has not established its own language style. A project glossary and
nearby approved strings override these defaults.

## Voice and sentence shape

- Write for the user's task, not for the source sentence's grammar.
- Prefer short, direct, respectful sentences. Use an implied subject when Persian
  does not need the English `we`, `you`, or `it`.
- Put the reason or condition before the action when that makes the instruction
  easier to scan: `برای ادامه وارد شوید.`
- Use active, concrete wording. Replace vague nominal phrases with a clear verb.
- Keep buttons compact: `ذخیره`، `ادامه`، `بازگشت`، `حذف`، `تلاش دوباره`.
- Make errors useful without blaming the user. Say what failed and, when the
  source provides it, what the user can do next.
- Match the product's established level of formality. Default to modern neutral
  Persian, not slang and not bureaucratic prose.

## Orthography and typography

- Use Persian `ی` and `ک`; reject Arabic `ي` and `ك` in new Persian copy.
- Use نیم‌فاصله where standard Persian morphology requires it, including common
  verb prefixes and suffixes: `می‌شود`، `نمی‌توان`، `به‌روزرسانی`، `فایل‌ها`.
- Do not use نیم‌فاصله inside code, placeholders, URLs, product names, or other
  protected tokens.
- Use one normal space around words and no space before punctuation.
- Prefer Persian punctuation in prose: `،`، `؛`، `؟`. Preserve punctuation that
  belongs to code, markup, a placeholder, or an established product token.
- Use Persian quotation marks `«…»` for ordinary quoted UI content when markup
  and interpolation rules permit it.
- Do not add Unicode direction controls. Keep technical material recognizable by
  preserving it exactly; let the host application own visual bidi isolation.

## Numbers

Follow nearby approved strings first. With no house style:

- Use Persian digits for ordinary quantities and dates presented as Persian
  prose.
- Keep ASCII digits in versions, identifiers, URLs, paths, commands, shortcuts,
  format specifiers, placeholders, and machine-consumed values.
- Preserve number semantics and units. Do not localize decimal separators or
  calendars unless the task explicitly requires it.

## Terminology

Choose the term that a modern Persian-speaking product user will understand.
Do not replace a familiar technical word with an obscure coinage merely to avoid
a loanword.

| Product meaning | Default Persian | Context note |
| --- | --- | --- |
| Account | حساب کاربری | Use `حساب` only when the shorter label is established. |
| Back | بازگشت | Never use literal `پشت` for navigation. |
| Continue | ادامه | Add context such as `ادامهٔ پخش` when the action is not obvious. |
| Delete | حذف | Preserve destructive confirmation and object name. |
| Download | دانلود | Prefer the widely understood product term unless house style differs. |
| Edit | ویرایش | Use for changing existing content. |
| Notifications | اعلان‌ها | Keep consistent across navigation and settings. |
| Preferences / Settings | تنظیمات | Distinguish them only when the product itself does. |
| Save | ذخیره | `ذخیرهٔ تغییرات` when the object must be explicit. |
| Search | جست‌وجو | Use standard نیم‌فاصله. |
| Sign in | ورود | In a sentence: `وارد شوید`. |
| Sign out | خروج | In a sentence: `خارج شوید`. |
| Sync | همگام‌سازی | In a sentence: `همگام می‌شود`. |
| Update | به‌روزرسانی | Distinguish noun from `به‌روزرسانی کنید`. |
| Upload | بارگذاری | Use `آپلود` only when established product language favors it. |

## Final quality questions

- Would a native Persian product writer plausibly publish this sentence?
- Is the user's next action obvious?
- Did English syntax, idiom, pronouns, or passive voice leak into the result?
- Are the same concepts named consistently across neighboring strings?
- Is every technical token still exact and readable?
