#!/usr/bin/env node
/**
 * Fails if a path the browser will request is written without appPath().
 *
 *   npm run check:paths        (also run first by npm run test:e2e)
 *
 * Online the app lives under /app (src/lib/base-path.ts). Next.js adds that
 * prefix to <Link>, redirect() and router.push, but not to a path written by
 * hand. Missing it does not break anything locally, where there is no prefix,
 * and the end-to-end suites call the API directly, so they cannot see it
 * either: on 17 Sep 2026 the People screen reached production sending "Add a
 * person" to the website instead of the app. This check reads the source.
 *
 * Rules, for everything under src/ except the API routes themselves:
 *   1. a literal starting "/api/" is written directly inside appPath(…)
 *   2. fetch(), sendBeacon() and window.location.assign() are never handed a
 *      literal path directly
 *   3. a plain <a href> to a path uses appPath() (<Link> does not need it)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(fileURLToPath(import.meta.url), "..", "..");
const srcDir = join(appDir, "src");
// sync-client.ts calls another ClinicOS — the clinic's online copy — at the
// full address the clinic pasted in, which already carries that copy's /app.
// Its paths are the other server's, and appPath() would add this one's prefix.
const skip = [
  /^app[\\/]api[\\/]/,
  /^middleware\.ts$/,
  /^lib[\\/]session-cookie\.ts$/,
  /^lib[\\/]base-path\.ts$/,
  /^lib[\\/]sync-client\.ts$/,
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const problems = [];
for (const file of files(srcDir)) {
  const rel = relative(srcDir, file);
  if (skip.some((re) => re.test(rel))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*(\*|\/\*|import )/.test(code)) return;
    const at = `src/${rel}:${i + 1}`;
    for (const m of code.matchAll(/(["'`])\/api\//g)) {
      if (!/appPath\(\s*$/.test(code.slice(0, m.index))) problems.push(`${at}  "/api/…" not inside appPath(): ${line.trim()}`);
    }
    if (/\b(fetch|sendBeacon|location\.assign)\(\s*["'`]\//.test(code)) {
      problems.push(`${at}  a literal path handed straight to the browser: ${line.trim()}`);
    }
    if (/<a\b[^>]*\bhref=(\{\s*)?["'`]\//.test(code)) {
      problems.push(`${at}  <a href> to a path without appPath(): ${line.trim()}`);
    }
  });
}

if (problems.length) {
  console.error(`Paths the browser requests must go through appPath() (see src/lib/base-path.ts):\n\n${problems.join("\n")}\n`);
  process.exit(1);
}
console.log("check-app-paths: every hand-written path goes through appPath().");
