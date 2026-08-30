import { SITE } from "@/lib/site";
import { faq } from "@/content/faq";

export function softwareAppJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    alternateName: SITE.nameFa,
    applicationCategory: "BrowserApplication",
    operatingSystem: "Chrome",
    softwareVersion: SITE.version,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    inLanguage: "fa-IR",
    url: `${SITE.url}/`,
    publisher: { "@type": "Organization", name: SITE.vendor },
    ...(SITE.storeUrl ? { downloadUrl: SITE.storeUrl } : {}),
  };
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
