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

// Rolling backups of catalog.json, taken right before each edit is written.
const BACKUP_DIR = path.join(ROOT, "data", "backups");
const BACKUP_COUNT = 10;

// Snapshot the current catalog.json into BACKUP_DIR, then drop all but the
// BACKUP_COUNT most recent snapshots.
function backupCatalog() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(CATALOG, path.join(BACKUP_DIR, `catalog-${stamp}.json`));

  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("catalog-") && f.endsWith(".json"))
    .sort();
  for (const stale of backups.slice(0, -BACKUP_COUNT)) {
    fs.unlinkSync(path.join(BACKUP_DIR, stale));
  }
}

const app = express();
app.use(express.json());

// The whole point at this stage: hand the client the catalog JSON as-is.
app.get("/api/locks", (_req, res) => {
  try {
    const raw = fs.readFileSync(CATALOG, "utf8");
    res.type("application/json").send(raw);
  } catch (err) {
    res.status(500).json({ error: `Could not read catalog.json: ${String(err)}` });
  }
});

// Fields the client is allowed to edit. Everything else (id, box, stickerNumber,
// photos, ...) is derived from the source photos and stays read-only here.
const EDITABLE_FIELDS = ["format", "brand", "model", "keys", "comments"] as const;

// Update one lock's editable fields. No create/delete — the set of locks and
// their identifying data come only from catalog.ts.
app.patch("/api/locks/:id", (req, res) => {
  let locks: any[];
  try {
    locks = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  } catch (err) {
    return res.status(500).json({ error: `Could not read catalog.json: ${String(err)}` });
  }

  const lock = locks.find((l) => l.id === req.params.id);
  if (!lock) return res.status(404).json({ error: `No lock with id ${req.params.id}` });

  for (const field of EDITABLE_FIELDS) {
    if (field in req.body) lock[field] = req.body[field];
  }

  try {
    backupCatalog();
    fs.writeFileSync(CATALOG, JSON.stringify(locks, null, 2));
  } catch (err) {
    return res.status(500).json({ error: `Could not write catalog.json: ${String(err)}` });
  }
  res.json(lock);
});

// Serve the lock photos so the client can show thumbnails.
app.use("/images", express.static(IMAGES));

app.listen(PORT, () => {
  console.log(`Lock catalog server listening on http://localhost:${PORT}`);
  console.log(`  catalog: ${CATALOG}`);
  console.log(`  images:  ${IMAGES}`);
});
