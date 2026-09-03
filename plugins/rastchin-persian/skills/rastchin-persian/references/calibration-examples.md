# Calibration examples

These examples show intent and quality. They are not exact golden strings: more
than one natural Persian rendering can be correct when meaning, context, tone,
and protected material are preserved.

## Product copy

| Context | Source or weak Persian | Natural direction | Why |
| --- | --- | --- | --- |
| Onboarding button | `Get started` | `شروع کنید` | A concise action, not a literal construction. |
| Empty search | `No results found. Try a different search.` | `نتیجه‌ای پیدا نشد. عبارت دیگری را جست‌وجو کنید.` | Says what happened and what to try. |
| Generic retry | `Something went wrong. Try again.` | `مشکلی پیش آمد. دوباره تلاش کنید.` | Natural and does not invent a cause. |
| Notification inbox | `You're all caught up.` | `همهٔ اعلان‌ها را دیدید.` | Localizes the idiom to the actual state. |
| Save failure | `We couldn't save your changes.` | `تغییرات ذخیره نشد.` | Drops an unnecessary English-style `we`. |
| Card failure | `Your card was declined.` | `پرداخت با این کارت انجام نشد.` | Clear and non-accusatory. |
| Back button | `پشت` | `بازگشت` | Uses navigation meaning, not spatial literalism. |
| Required field | `این فیلد مورد نیاز است.` | `این فیلد را تکمیل کنید.` | Gives the user a clear action without changing the target object. |

## Context changes short labels

`Continue` is usually `ادامه` on a wizard button. For paused media it may need
`ادامهٔ پخش`. Never choose a short-label translation without checking what the
control actually does.

## Protected material

Source:

```text
Delete “{projectName}”? This can't be undone.
```

Natural direction:

```text
«{projectName}» حذف شود؟ این کار قابل بازگشت نیست.
```

`{projectName}` appears exactly once and remains byte-for-byte unchanged.

Source:

```text
Press Ctrl+K to search in RastChin.
```

Natural direction:

```text
برای جست‌وجو در RastChin، Ctrl+K را فشار دهید.
```

`Ctrl+K` and `RastChin` remain exact even though their position changes naturally.

## Review behavior

Weak:

```text
به روز رسانی ها به صورت خودکار نصب میشود.
```

Focused correction:

```text
به‌روزرسانی‌ها به‌صورت خودکار نصب می‌شوند.
```

Already good:

```text
برای ادامه وارد شوید.
```

Report that the second string is already natural. Do not force a synonym merely
to make a change.
