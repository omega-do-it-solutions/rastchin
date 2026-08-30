import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/vscode-rtl/", priority: 0.8 },
    { path: "/privacy/", priority: 0.6 },
    { path: "/changelog/", priority: 0.6 },
    { path: "/feedback/", priority: 0.5 },
  ];

  return pages.map((p) => ({
    url: `${SITE.url}${p.path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: p.priority,
  }));
}
