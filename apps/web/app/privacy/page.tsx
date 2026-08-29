import Link from "next/link";
import type { Metadata } from "next";
import { fa as dict } from "@/content/dictionaries/fa";
import { buildMetadata } from "@/lib/seo/metadata";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ArrowIcon } from "@/components/ui/icons";
import { extensionVersionLabel } from "@/content/extension-release";

export function generateMetadata(): Metadata {
  return buildMetadata("privacy");
}

export default function PrivacyPage() {
  const pp = dict.privacyPage;

  return (
    <>
      <Header dict={dict} showNav={false} />
      <main className="mx-auto max-w-3xl px-6 py-16 md:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text"
        >
          <ArrowIcon className="size-4" />
          {dict.actions.backToHome}
        </Link>

        <h1 className="mt-6 font-display text-4xl font-bold">{pp.title}</h1>
        <p className="mt-2 text-sm text-muted">
          آخرین به‌روزرسانی: {extensionVersionLabel()}
        </p>
        <p className="mt-6 text-lg leading-relaxed text-muted text-pretty">{pp.intro}</p>

        <div className="mt-12 space-y-10">
          {pp.sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-xl font-semibold">{s.heading}</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-muted">
                {s.body.map((b, j) => (
                  <p key={j}>{b}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <Footer dict={dict} />
    </>
  );
}
