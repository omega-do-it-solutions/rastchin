import type { Metadata } from "next";
import { htmlLang } from "@/lib/i18n/config";
import { fa as dict } from "@/content/dictionaries/fa";
import { buildMetadata } from "@/lib/seo/metadata";
import { changelog } from "@/content/changelog";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export function generateMetadata(): Metadata {
  return buildMetadata("changelog");
}

export default function ChangelogPage() {
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(htmlLang, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));

  return (
    <>
      <Header dict={dict} />
      <main className="mx-auto max-w-3xl px-6 py-16 md:px-10">
        <h1 className="font-display text-4xl font-bold">{dict.changelogPage.title}</h1>
        <p className="mt-2 text-lg text-muted">{dict.changelogPage.intro}</p>

        <div className="mt-12 space-y-10">
          {changelog.map((e) => (
            <section key={e.version} className="border-s-2 border-crimson/30 ps-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="ltr-token font-display text-2xl font-bold text-crimson">
                  v{e.version}
                </span>
                {e.date ? <span className="text-sm text-muted">{formatDate(e.date)}</span> : null}
              </div>
              <h2 className="mt-2 text-lg font-semibold">{e.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {e.notes.map((n, i) => (
                  <li key={i} className="flex gap-3 text-muted">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <Footer dict={dict} />
    </>
  );
}
