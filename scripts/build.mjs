import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const rootManifestPath = new URL("../manifest.json", import.meta.url);
const sourcePluginPath = new URL("../index.js", import.meta.url);
const distDirectory = new URL("../dist/", import.meta.url);
const distManifestPath = new URL("../dist/manifest.json", import.meta.url);
const distPluginPath = new URL("../dist/index.js", import.meta.url);

const [manifestJson, pluginSource] = await Promise.all([
  readFile(rootManifestPath, "utf8"),
  readFile(sourcePluginPath),
]);

const hash = createHash("sha256").update(pluginSource).digest("hex");
const baseManifest = JSON.parse(manifestJson);

const distManifest = {
  ...baseManifest,
  main: "index.js",
  hash,
};

const rootManifest = {
  ...baseManifest,
  main: "dist/index.js",
  hash,
};

await mkdir(distDirectory, { recursive: true });
await Promise.all([
  writeFile(distPluginPath, pluginSource),
  writeFile(distManifestPath, `${JSON.stringify(distManifest, null, 2)}\n`),
  writeFile(rootManifestPath, `${JSON.stringify(rootManifest, null, 2)}\n`),
]);

console.log("Built Revenge plugin files:");
console.log("- dist/manifest.json");
console.log("- dist/index.js");
console.log(`Updated manifest hash: ${hash}`);
