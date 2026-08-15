/**
 * Build and publish a read-only static snapshot of the catalog to GitHub
 * Pages (the `gh-pages` branch of the `origin` remote).
 *
 * Usage:
 *   npx tsx deploy-public.ts
 *
 * The public site has no backend: the client fetches a static locks.json
 * (a copy of catalog.json) and images/ (a copy of images-optimized/) that
 * get baked into the build, and the edit UI is compiled out (VITE_READ_ONLY).
 * Re-run this any time you want to publish your latest local edits.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import ghpages from "gh-pages";

const ROOT = __dirname;
const CLIENT = path.join(ROOT, "app", "client");
const OUT_DIR = path.join(ROOT, "dist-public");
const CATALOG = path.join(ROOT, "catalog.json");
const IMAGES_OPTIMIZED = path.join(ROOT, "images-optimized");

function run(cmd: string, args: string[], opts: Parameters<typeof execFileSync>[2] = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

async function main() {
  if (!fs.existsSync(CATALOG)) {
    console.error(`catalog.json not found at ${CATALOG}`);
    process.exit(1);
  }

  // Keep the optimized photos in sync with the current Images/ + catalog.json
  // before publishing (safe to re-run; see optimize-images.ts).
  console.log("Refreshing optimized images...");
  run(process.execPath, [path.join(ROOT, "node_modules", ".bin", "tsx"), "optimize-images.ts"], {
    cwd: ROOT,
  });

  console.log("Building static client...");
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  run(
    process.execPath,
    [
      path.join(CLIENT, "node_modules", ".bin", "vite"),
      "build",
      "--base=./",
      "--outDir",
      OUT_DIR,
      "--emptyOutDir",
    ],
    {
      cwd: CLIENT,
      env: {
        ...process.env,
        VITE_DATA_URL: "./locks.json",
        VITE_READ_ONLY: "true",
      },
    },
  );

  console.log("Copying catalog + images into the build...");
  fs.copyFileSync(CATALOG, path.join(OUT_DIR, "locks.json"));
  fs.cpSync(IMAGES_OPTIMIZED, path.join(OUT_DIR, "images"), { recursive: true });

  console.log("Publishing dist-public/ to the gh-pages branch...");
  await new Promise<void>((resolve, reject) => {
    ghpages.publish(OUT_DIR, { branch: "gh-pages", dotfiles: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log("Done. Once GitHub Pages is enabled for this repo (Settings > Pages > branch: gh-pages), your site will be live in a minute or two.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
