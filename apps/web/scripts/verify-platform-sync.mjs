import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { platforms } from "../content/platforms.ts";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const extensionDir = process.env.RASTCHIN_EXTENSION_DIR
  ? resolve(process.env.RASTCHIN_EXTENSION_DIR)
  : resolve(appDir, "../browser-extension");
const registryPath = resolve(extensionDir, "src/ui/shared/platform-registry.js");

function fail(message) {
  console.error(`platform sync check failed: ${message}`);
  process.exitCode = 1;
}

const context = { window: {} };
runInNewContext(readFileSync(registryPath, "utf8"), context, { timeout: 1000 });

const extensionPlatforms = context.window.RASTCHIN_PLATFORMS;
if (!Array.isArray(extensionPlatforms)) {
  fail("browser extension registry did not expose RASTCHIN_PLATFORMS");
} else {
  const extensionIds = extensionPlatforms.map((platform) => platform.id);
  const websiteIds = platforms.map((platform) => platform.id);
  const duplicateWebsiteIds = websiteIds.filter((id, index) => websiteIds.indexOf(id) !== index);
  const missingFromWebsite = extensionIds.filter((id) => !websiteIds.includes(id));
  const unsupportedOnWebsite = websiteIds.filter((id) => !extensionIds.includes(id));

  if (duplicateWebsiteIds.length) {
    fail(`duplicate website ids: ${[...new Set(duplicateWebsiteIds)].join(", ")}`);
  }
  if (missingFromWebsite.length) {
    fail(`missing website platforms: ${missingFromWebsite.join(", ")}`);
  }
  if (unsupportedOnWebsite.length) {
    fail(`website lists unsupported platforms: ${unsupportedOnWebsite.join(", ")}`);
  }

  for (const id of websiteIds) {
    if (!existsSync(resolve(appDir, `public/logos/${id}.svg`))) {
      fail(`missing website logo: public/logos/${id}.svg`);
    }
  }

  if (!process.exitCode) {
    console.log(`platform sync check passed: ${websiteIds.length} supported platforms`);
  }
}
