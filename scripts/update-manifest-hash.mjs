import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const rootManifestPath = new URL("../manifest.json", import.meta.url);
const distManifestPath = new URL("../dist/manifest.json", import.meta.url);
const pluginPath = new URL("../dist/index.js", import.meta.url);

const [rootManifestJson, distManifestJson, pluginSource] = await Promise.all([
  readFile(rootManifestPath, "utf8"),
  readFile(distManifestPath, "utf8"),
  readFile(pluginPath),
]);

const hash = createHash("sha256").update(pluginSource).digest("hex");
const rootManifest = JSON.parse(rootManifestJson);
const distManifest = JSON.parse(distManifestJson);

rootManifest.main = "dist/index.js";
rootManifest.hash = hash;
distManifest.main = "index.js";
distManifest.hash = hash;

await Promise.all([
  writeFile(rootManifestPath, `${JSON.stringify(rootManifest, null, 2)}\n`),
  writeFile(distManifestPath, `${JSON.stringify(distManifest, null, 2)}\n`),
]);

console.log(`Updated manifest hash: ${hash}`);
