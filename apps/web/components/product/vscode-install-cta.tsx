import { clsx } from "@/lib/clsx";
import { CodeIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { vscodeExtensionRelease } from "@/content/vscode-extension";

export function VscodeInstallCta({
  align = "start",
  className,
}: {
  align?: "start" | "center";
  className?: string;
}) {
  const { directInstallUrl, marketplaceUrl } = vscodeExtensionRelease;
  const primaryClass = clsx(
    "group inline-flex min-h-14 w-full flex-wrap items-center justify-center gap-3 rounded-xl bg-crimson px-5 py-3.5 text-center text-sm font-semibold text-crimson-content shadow-[0_18px_45px_-22px_rgb(var(--crimson))] transition sm:w-auto sm:px-6 sm:text-base",
    directInstallUrl
      ? "hover:-translate-y-0.5 hover:bg-crimson-pressed hover:text-crimson-pressed-content"
      : "cursor-default opacity-90",
  );

  const primaryContent = (
    <>
      <span className="grid size-8 place-items-center rounded-lg bg-white/15">
        <CodeIcon className="size-5" />
      </span>
      <span>نصب مستقیم در Visual Studio Code</span>
      {!directInstallUrl ? (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
          به‌زودی
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={clsx(
        "flex flex-col gap-2.5",
        align === "center" ? "items-center text-center" : "items-start text-start",
        className,
      )}
    >
      {directInstallUrl ? (
        <a href={directInstallUrl} className={primaryClass}>
          {primaryContent}
        </a>
      ) : (
        <span
          className={primaryClass}
          role="link"
          aria-disabled="true"
          title="لینک نصب مستقیم پس از انتشار در Marketplace فعال می‌شود"
        >
          {primaryContent}
        </span>
      )}

      {marketplaceUrl ? (
        <a
          href={marketplaceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-wrap items-center justify-center gap-1.5 text-sm font-medium text-muted underline decoration-hairline underline-offset-4 transition hover:text-text"
        >
          یا مشاهده در Visual Studio Marketplace
          <ExternalLinkIcon className="size-3.5" />
        </a>
      ) : (
        <span
          className="inline-flex flex-wrap items-center justify-center gap-1.5 text-sm text-muted/75"
          aria-disabled="true"
          title="لینک Marketplace هنوز اضافه نشده است"
        >
          یا مشاهده در Visual Studio Marketplace
          <ExternalLinkIcon className="size-3.5" />
          <span className="text-xs">· پس از انتشار</span>
        </span>
      )}
    </div>
  );
}
