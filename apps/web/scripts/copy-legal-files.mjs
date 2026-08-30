import { access, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportRoot = path.join(appRoot, "out");
const legalFiles = [
  ["LICENSE", "LICENSE.txt"],
  ["NOTICE", "NOTICE.txt"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
];

await access(exportRoot);

for (const [sourceName, outputName] of legalFiles) {
  await copyFile(path.join(appRoot, sourceName), path.join(exportRoot, outputName));
}

console.log(`copied ${legalFiles.length} legal files into the static export`);
