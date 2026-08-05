/**
 * scripts/data/fetchCache.ts
 *
 * Tiny download cache used by `npm run build-data`. Source datasets are large and
 * come from public servers, so every response is cached under `.cache/data/`
 * (git-ignored) and re-used on subsequent runs. Delete that directory to force a
 * fresh download.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const CACHE_DIR = resolve(process.cwd(), ".cache", "data");

/** Number of attempts made for each download before giving up. */
const MAX_ATTEMPTS = 5;

/** Fetches `url`, retrying with exponential backoff — these public services rate-limit. */
async function downloadWithRetries(url: string): Promise<Buffer> {
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * 2 ** (attempt - 1);
      console.log(`    retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delayMs / 1000}s (${lastError})`);
      await new Promise<void>((settle) => setTimeout(settle, delayMs));
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
      lastError = `HTTP ${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${url} → ${lastError}`);
}

/**
 * Downloads `url` (or reads the cached copy) and returns the raw bytes. The cache
 * key includes a hash of the URL, so changing a query parameter re-downloads
 * instead of silently reusing the previous response.
 */
export async function fetchBinary(url: string, cacheName: string): Promise<Buffer> {
  const digest = createHash("sha1").update(url).digest("hex").slice(0, 8);
  const cachePath = join(CACHE_DIR, `${digest}-${cacheName}`);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath);
  }

  console.log(`  downloading ${url}`);
  const bytes = await downloadWithRetries(url);

  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, bytes);
  return bytes;
}

/** Downloads `url` (or reads the cached copy) and parses it as JSON. */
export async function fetchJson<T>(url: string, cacheName: string): Promise<T> {
  const bytes = await fetchBinary(url, cacheName);
  return JSON.parse(bytes.toString("utf8")) as T;
}

/** Downloads `url` (or reads the cached copy) and returns it as text. */
export async function fetchText(url: string, cacheName: string): Promise<string> {
  return (await fetchBinary(url, cacheName)).toString("utf8");
}
