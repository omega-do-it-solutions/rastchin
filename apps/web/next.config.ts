import type { NextConfig } from "next";

const appEnv = process.env.APP_ENV;

if (appEnv !== "development" && appEnv !== "production") {
  throw new Error("APP_ENV must be either development or production");
}

const nextConfig: NextConfig = {
  // Static pages need no Next.js server. The exported feedback endpoint still
  // requires a PHP-capable host to execute out/api/feedback.php.
  output: "export",
  // Every route exports as a folder with index.html — static hosts serve these without rewrites.
  trailingSlash: true,
  // No image optimization server in static export.
  images: { unoptimized: true },
};

export default nextConfig;
