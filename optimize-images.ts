/**
 * Downscale the catalog photos for fast web delivery.
 *
 * Usage:
 *   npx tsx optimize-images.ts [srcDir] [outDir]
 *   defaults: Images  ->  images-optimized
 *
 * Every image under srcDir is resized so its long edge is 1024px, keeping the
 * original aspect ratio (never upscaled). Output is JPEG quality 75, written to
 * the same relative path under outDir, so "Images/Box 2/IMG_7799.JPG" becomes
 * "images-optimized/Box 2/IMG_7799.JPG". The server then serves this folder.
 *
 * Safe to re-run: existing outputs are simply overwritten.
 */
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic|tiff?)$/i;
const MAX_EDGE = 1024; // long edge; short edge scales to keep aspect ratio
const QUALITY = 75;

const [srcArg, outArg] = process.argv.slice(2);
const SRC = path.resolve(srcArg ?? "Images");
const OUT = path.resolve(outArg ?? "images-optimized");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return IMG_RE.test(e.name) ? [full] : [];
  });
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source directory not found: ${SRC}`);
    process.exit(1);
  }
  const files = walk(SRC);
  if (files.length === 0) {
    console.error(`No images found under ${SRC}`);
    process.exit(1);
  }
  console.log(`Optimizing ${files.length} images: ${SRC} -> ${OUT} (long edge ${MAX_EDGE}px, JPEG q${QUALITY})`);

  let count = 0;
  let totalBytes = 0;
  for (const file of files) {
    const rel = path.relative(SRC, file);
    const outPath = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // fit "inside" a square MAX_EDGE box bounds the long edge to MAX_EDGE while
    // preserving aspect ratio, regardless of orientation.
    await sharp(file)
      .rotate() // honour EXIF orientation before resizing
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toFile(outPath);
    const { size } = fs.statSync(outPath);
    totalBytes += size;
    count++;
    console.log(`  ${rel} -> ${(size / 1024).toFixed(0)} KB`);
  }
  console.log(`Done: ${count} images, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
