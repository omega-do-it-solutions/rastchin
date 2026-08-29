import type { Metadata } from "next";
import { fa as dict } from "@/content/dictionaries/fa";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata("feedback");
}

export default function FeedbackPage() {
  const fp = dict.feedbackPage;

  return (
    <>
      <Header dict={dict} />
      <main className="mx-auto max-w-3xl px-6 py-16 md:px-10">
        <h1 className="font-display text-4xl font-bold">{fp.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">{fp.intro}</p>

        <FeedbackForm labels={fp} />
      </main>
      <Footer dict={dict} />
    </>
  );
}
