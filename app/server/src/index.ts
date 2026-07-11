import express from "express";
import * as fs from "fs";
import * as path from "path";

// Project root = the "Sale" folder that holds catalog.json and Images/.
// This file lives at app/server/src/index.ts, so go up three levels.
const ROOT = path.resolve(__dirname, "../../..");
const CATALOG = path.join(ROOT, "catalog.json");
// Prefer the web-optimized photos (see optimize-images.ts); fall back to the
// full-size originals if that folder hasn't been generated yet.
const OPTIMIZED = path.join(ROOT, "images-optimized");
const IMAGES = fs.existsSync(OPTIMIZED) ? OPTIMIZED : path.join(ROOT, "Images");
const PORT = Number(process.env.PORT) || 3001;

const app = express();

// The whole point at this stage: hand the client the catalog JSON as-is.
app.get("/api/locks", (_req, res) => {
  try {
    const raw = fs.readFileSync(CATALOG, "utf8");
    res.type("application/json").send(raw);
  } catch (err) {
    res.status(500).json({ error: `Could not read catalog.json: ${String(err)}` });
  }
});

// Serve the lock photos so the client can show thumbnails.
app.use("/images", express.static(IMAGES));

app.listen(PORT, () => {
  console.log(`Lock catalog server listening on http://localhost:${PORT}`);
  console.log(`  catalog: ${CATALOG}`);
  console.log(`  images:  ${IMAGES}`);
});
