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
 *
 * The gh-pages branch is force-pushed as a single fresh commit each time
 * (no history) via a temporary git worktree, so the branch never grows.
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = __dirname;
const CLIENT = path.join(ROOT, "app", "client");
const OUT_DIR = path.join(ROOT, "dist-public");
const CATALOG = path.join(ROOT, "catalog.json");
const IMAGES_OPTIMIZED = path.join(ROOT, "images-optimized");
const WORKTREE = path.join(ROOT, ".gh-pages-worktree");
const DEPLOY_BRANCH = "gh-pages-deploy";

// Quote a path for the shell (handles spaces, e.g. "Google Drive").
const q = (p: string) => `"${p}"`;

function run(command: string, opts: Parameters<typeof execSync>[1] = {}) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit", ...opts });
}

async function main() {
  if (!fs.existsSync(CATALOG)) {
    console.error(`catalog.json not found at ${CATALOG}`);
    process.exit(1);
  }

  // Keep the optimized photos in sync with the current Images/ + catalog.json
  // before publishing (safe to re-run; see optimize-images.ts).
  console.log("Refreshing optimized images...");
  run("npx tsx optimize-images.ts", { cwd: ROOT });

  console.log("Building static client...");
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  run(`npx vite build --base=./ --outDir ${q(OUT_DIR)} --emptyOutDir`, {
    cwd: CLIENT,
    env: {
      ...process.env,
      VITE_DATA_URL: "./locks.json",
      VITE_READ_ONLY: "true",
    },
  });

  console.log("Copying catalog + images into the build...");
  fs.copyFileSync(CATALOG, path.join(OUT_DIR, "locks.json"));
  fs.cpSync(IMAGES_OPTIMIZED, path.join(OUT_DIR, "images"), { recursive: true });

  console.log("Publishing dist-public/ to the gh-pages branch...");
  // Best-effort cleanup from a previous run; fine if these fail (nothing to clean).
  try {
    run(`git worktree remove ${q(WORKTREE)} --force`, { cwd: ROOT, stdio: "ignore" });
  } catch {}
  fs.rmSync(WORKTREE, { recursive: true, force: true });
  try {
    run(`git branch -D ${DEPLOY_BRANCH}`, { cwd: ROOT, stdio: "ignore" });
  } catch {}

  try {
    run(`git worktree add --detach ${q(WORKTREE)}`, { cwd: ROOT });
    run(`git checkout --orphan ${DEPLOY_BRANCH}`, { cwd: WORKTREE });
    try {
      run("git rm -rf --quiet .", { cwd: WORKTREE, stdio: "ignore" });
    } catch {}
    fs.cpSync(OUT_DIR, WORKTREE, { recursive: true });
    run("git add -A", { cwd: WORKTREE });
    run('git commit -m "Deploy public site" --quiet', { cwd: WORKTREE });
    run(`git push origin ${DEPLOY_BRANCH}:gh-pages --force`, { cwd: WORKTREE });
  } finally {
    try {
      run(`git worktree remove ${q(WORKTREE)} --force`, { cwd: ROOT });
    } catch {}
  }

  console.log("Done. Site: https://boriskozo.github.io/lock-sale/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
