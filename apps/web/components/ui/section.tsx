import { clsx } from "@/lib/clsx";

export function Section({
  id,
  children,
  className,
  containerClassName,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <section id={id} className={clsx("scroll-mt-24 py-20 md:py-28", className)}>
      <div className={clsx("mx-auto w-full max-w-content px-6 md:px-10", containerClassName)}>
        {children}
      </div>
    </section>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-crimson",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-crimson" aria-hidden />
      {children}
    </span>
  );
}
