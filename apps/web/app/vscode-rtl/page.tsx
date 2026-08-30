import type { Metadata } from "next";
import { fa as dict } from "@/content/dictionaries/fa";
import { VscodeExtensionPage } from "@/components/product/vscode-extension-page";
import { JsonLd } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { vscodeExtensionFaq, vscodeExtensionRelease } from "@/content/vscode-extension";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata("vscode-rtl");
}

export default function VscodeRtlPage() {
  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RastChin for VS Code",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: vscodeExtensionRelease.version,
    inLanguage: "fa-IR",
    url: `${SITE.url}/vscode-rtl/`,
    description:
      "افزونه رایگان برای خواناتر کردن متن فارسی در VS Code Markdown Preview، Claude Code و Codex بدون خراب شدن کد و لینک.",
    publisher: { "@type": "Organization", name: SITE.vendor, url: SITE.url },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(vscodeExtensionRelease.marketplaceUrl
      ? { downloadUrl: vscodeExtensionRelease.marketplaceUrl }
      : {}),
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: vscodeExtensionFaq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <>
      <VscodeExtensionPage dict={dict} />
      <JsonLd data={softwareApp} />
      <JsonLd data={faq} />
    </>
  );
}
