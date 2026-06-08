import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rawUrl = process.argv[2];

if (!rawUrl) {
  console.error("Usage: node scripts/verify-install-url.mjs <revenge-plugin-folder-url>");
  console.error("Example: node scripts/verify-install-url.mjs https://cdn.jsdelivr.net/gh/YOUR_USERNAME/relationship-notifier@main/");
  process.exit(1);
}

const folderUrl = rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`;
const manifestUrl = new URL("manifest.json", folderUrl);

async function readUrl(url) {
  if (url.protocol === "file:") {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      text: await readFile(fileURLToPath(url), "utf8"),
    };
  }

  const response = await fetch(url, { cache: "no-store" });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") ?? "",
    text: await response.text(),
  };
}

let manifestResponse;
try {
  manifestResponse = await readUrl(manifestUrl);
} catch (error) {
  console.error(`Could not reach ${manifestUrl}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (!manifestResponse.ok) {
  console.error(`Manifest request failed: ${manifestResponse.status} ${manifestResponse.statusText}`);
  console.error(`Checked URL: ${manifestUrl}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(manifestResponse.text);
} catch {
  console.error(`Manifest URL did not return JSON: ${manifestUrl}`);
  console.error(`Content-Type: ${manifestResponse.contentType || "unknown"}`);
  console.error("If this is a GitHub HTML page, use GitHub Pages, jsDelivr, or raw.githubusercontent.com instead of the github.com repository page.");
  process.exit(1);
}

for (const key of ["name", "description", "authors", "main", "hash"]) {
  if (manifest[key] == null) {
    console.error(`Manifest is missing required key: ${key}`);
    process.exit(1);
  }
}

const scriptUrl = new URL(manifest.main || "index.js", folderUrl);
let scriptResponse;
try {
  scriptResponse = await readUrl(scriptUrl);
} catch (error) {
  console.error(`Could not reach ${scriptUrl}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (!scriptResponse.ok) {
  console.error(`Plugin script request failed: ${scriptResponse.status} ${scriptResponse.statusText}`);
  console.error(`Checked URL: ${scriptUrl}`);
  process.exit(1);
}

console.log("Revenge can reach this plugin layout:");
console.log(`- Folder:   ${folderUrl}`);
console.log(`- Manifest: ${manifestUrl}`);
console.log(`- Script:   ${scriptUrl}`);
