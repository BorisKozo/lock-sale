/**
 * Lock catalog builder.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx catalog.ts <imageDir> <boxNumber> [outFile.json] [--html-only]
 *
 * Pairing rule: files are sorted by the integer embedded in their name, then
 * paired by SORTED POSITION (not by arithmetic on the numbers), so gaps in the
 * numbering don't break pairing. Photo #1 of each pair = the sticker photo.
 *
 * Re-running is safe: locks already in the JSON (matched by first-photo id) are
 * preserved verbatim, so any fields you add by hand later are never overwritten.
 * Pass --html-only to regenerate the HTML from the JSON without calling the API.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

type Shape = "rhombus" | "circle" | null;
interface Lock {
  id: string;                 // stable identity = stem of the first photo
  box: number;
  stickerNumber: string | null;
  stickerShape: Shape;
  confidence: number;         // 0..1, model's self-reported read confidence
  needsReview: boolean;
  photos: string[];           // relative paths, [sticker photo, other angle]
  [k: string]: unknown;       // room for fields you add manually later
}

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic)$/i;
const MEDIA: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp",
};

function firstInt(name: string): number {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

async function readSticker(client: Anthropic, file: string): Promise<Pick<Lock, "stickerNumber" | "stickerShape" | "confidence">> {
  const data = fs.readFileSync(file).toString("base64");
  const media_type = MEDIA[path.extname(file).toLowerCase()] ?? "image/jpeg";
  const prompt =
    "This photo shows a lock with a small numbered sticker on it. " +
    "Read ONLY the sticker. Return strict JSON, no prose, no code fences: " +
    '{"number": <string or null>, "shape": <"rhombus" | "circle" | null>, "confidence": <0..1>}. ' +
    "shape must be exactly rhombus or circle. If you cannot read a value with confidence, use null. Never guess.";
  const msg = await client.messages.create({
    model: "claude-sonnet-5", // swap to "claude-haiku-4-5-20251001" for cheaper/faster bulk runs
    max_tokens: 200,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: media_type as any, data } },
      { type: "text", text: prompt },
    ] }],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");
  try {
    const j = JSON.parse(text.replace(/```json|```/g, "").trim());
    const shape: Shape = j.shape === "rhombus" || j.shape === "circle" ? j.shape : null;
    return {
      stickerNumber: j.number != null ? String(j.number) : null,
      stickerShape: shape,
      confidence: typeof j.confidence === "number" ? j.confidence : 0,
    };
  } catch {
    return { stickerNumber: null, stickerShape: null, confidence: 0 };
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function renderHtml(locks: Lock[], htmlDir: string): string {
  const core = new Set(["id", "box", "stickerNumber", "stickerShape", "confidence", "needsReview", "photos", "readSource"]);
  const extra = [...new Set(locks.flatMap(l => Object.keys(l)))].filter(k => !core.has(k));
  const rel = (p: string) => path.relative(htmlDir, path.resolve(p)).split(path.sep).join("/");
  const rows = locks.map((l, i) => `
    <tr${l.needsReview ? ' class="review"' : ""}>
      <td>${i + 1}</td>
      <td>${esc(l.box)}</td>
      <td>${esc(l.stickerNumber)}</td>
      <td>${esc(l.stickerShape)}</td>
      ${extra.map(k => `<td>${esc(l[k])}</td>`).join("")}
      <td class="ph">${l.photos.map(p => `<a href="${esc(rel(p))}" target="_blank"><img src="${esc(rel(p))}" loading="lazy"></a>`).join("")}</td>
    </tr>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>Lock catalog</title>
<style>
  body{font:14px system-ui,sans-serif;margin:24px;color:#1a1a1a}
  h1{font-size:18px} .meta{color:#666;margin-bottom:16px}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f4f4f5;position:sticky;top:0} tr:nth-child(even){background:#fafafa}
  tr.review{background:#fff7ed} .ph img{height:96px;margin-right:6px;border-radius:4px;border:1px solid #ccc}
</style>
<h1>Lock catalog</h1>
<p class="meta">${locks.length} locks &middot; rows highlighted amber need a manual sticker check.</p>
<table><thead><tr>
  <th>ID</th><th>Box</th><th>Sticker #</th><th>Shape</th>${extra.map(k => `<th>${esc(k)}</th>`).join("")}<th>Photos</th>
</tr></thead><tbody>${rows}
</tbody></table>`;
}

async function main() {
  const [imageDir, boxArg, outArg] = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const htmlOnly = process.argv.includes("--html-only");
  if (!imageDir || (!htmlOnly && !boxArg)) {
    console.error("Usage: tsx catalog.ts <imageDir> <boxNumber> [out.json] [--html-only]");
    process.exit(1);
  }
  const outFile = outArg ?? "catalog.json";
  const htmlFile = outFile.replace(/\.json$/i, "") + ".html";
  const box = Number(boxArg);

  const existing: Lock[] = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : [];
  const byId = new Map(existing.map(l => [l.id, l]));

  if (!htmlOnly) {
    const files = fs.readdirSync(imageDir).filter(f => IMG_RE.test(f))
      .sort((a, b) => firstInt(a) - firstInt(b) || a.localeCompare(b))
      .map(f => path.join(imageDir, f));

    const client = new Anthropic();
    const locks: Lock[] = [];
    for (let i = 0; i < files.length; i += 2) {
      const pair = files.slice(i, i + 2);
      const id = path.parse(pair[0]).name;
      if (byId.has(id)) { locks.push(byId.get(id)!); continue; } // preserve manual edits
      const read = await readSticker(client, pair[0]);
      const lock: Lock = {
        id, box, ...read,
        needsReview: read.confidence < 0.6 || read.stickerNumber == null || read.stickerShape == null,
        photos: pair,
      };
      locks.push(lock);
      fs.writeFileSync(outFile, JSON.stringify(locks, null, 2)); // incremental save
      console.log(`${id}: #${lock.stickerNumber} ${lock.stickerShape} (${(read.confidence * 100).toFixed(0)}%)`);
    }
    fs.writeFileSync(outFile, JSON.stringify(locks, null, 2));
    fs.writeFileSync(htmlFile, renderHtml(locks, path.dirname(path.resolve(htmlFile))));
  } else {
    fs.writeFileSync(htmlFile, renderHtml(existing, path.dirname(path.resolve(htmlFile))));
  }
  console.log(`Wrote ${outFile} and ${htmlFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
