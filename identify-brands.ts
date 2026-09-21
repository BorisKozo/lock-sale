/**
 * Best-effort brand/model identification for locks that don't have one yet.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx identify-brands.ts [boxNumber]
 *
 * Looks at both photos of each lock and asks Claude vision for its best
 * guess at brand and model, based on visible markings, keyway shape, logo,
 * or overall design. These are guesses, not verified reads — check
 * brandSource for provenance, and expect some to be wrong or "Possibly X".
 *
 * Only fills in locks where format, brand, model, keys, AND comments are
 * ALL still empty — i.e. completely untouched locks — so it never overwrites
 * anything you (or a previous run of this script) set, and skips locks
 * you've partially reviewed even if you left brand/model blank on purpose.
 * Safe to re-run: pass a box number to scope it, or omit to cover every
 * still-untouched lock in the catalog.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic)$/i;
const MEDIA: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp",
};

function imageBlock(file: string) {
  const data = fs.readFileSync(file).toString("base64");
  const media_type = MEDIA[path.extname(file).toLowerCase()] ?? "image/jpeg";
  return { type: "image" as const, source: { type: "base64" as const, media_type: media_type as any, data } };
}

async function identify(client: Anthropic, photos: string[]): Promise<{ brand: string | null; model: string | null }> {
  const prompt =
    "These photos are different views of the SAME lock (padlock, cylinder, cam lock, etc.). " +
    "Examine ALL of them: a logo or marking may appear on only one. Based on visible markings, " +
    "keyway shape, logo, finish, or overall design, give your best guess at the brand and model. " +
    "Return strict JSON, no prose, no code fences: " +
    '{"brand": <string or null>, "model": <string or null>}. ' +
    "If you recognize the brand but not the specific model, name the brand and set model to null. " +
    "If you're not fully confident, still give your best guess as the plain brand name — never add " +
    'hedging words like "Possibly" or "Probably" (guesses are flagged separately). ' +
    "Use null only if you truly have no idea. Never invent a specific model number you can't actually see or infer.";
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 200,
    messages: [{ role: "user", content: [...photos.map(imageBlock), { type: "text", text: prompt }] }],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");
  try {
    const j = JSON.parse(text.replace(/```json|```/g, "").trim());
    const clean = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim().replace(/^(possibly|probably|maybe)\s+/i, "") || null : null;
    return { brand: clean(j.brand), model: clean(j.model) };
  } catch {
    return { brand: null, model: null };
  }
}

async function main() {
  const boxArg = process.argv[2];
  const box = boxArg ? Number(boxArg) : undefined;
  const outFile = "catalog.json";
  const locks: any[] = JSON.parse(fs.readFileSync(outFile, "utf8"));

  const isEmpty = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
  const client = new Anthropic();
  let count = 0;
  for (const lock of locks) {
    if (box !== undefined && lock.box !== box) continue;
    if (!isEmpty(lock.format) || !isEmpty(lock.brand) || !isEmpty(lock.model) ||
        !isEmpty(lock.keys) || !isEmpty(lock.comments)) continue;
    const photos = (lock.photos as string[]).filter((p: string) => IMG_RE.test(p) && fs.existsSync(p));
    if (photos.length === 0) continue;

    const guess = await identify(client, photos);
    // Re-read right before writing so edits saved from the app while the
    // (slow) API calls were running aren't clobbered by a stale in-memory copy.
    const fresh: any[] = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const target = fresh.find((l) => l.id === lock.id);
    if (!target) continue;
    if (!isEmpty(target.brand) || !isEmpty(target.model)) continue; // user filled it meanwhile
    target.brand = guess.brand ?? "";
    target.model = guess.model ?? "";
    if (guess.brand || guess.model) target.brandSource = "ai-guess";
    fs.writeFileSync(outFile, JSON.stringify(fresh, null, 2)); // incremental save
    count++;
    console.log(`${lock.id}: brand=${JSON.stringify(guess.brand)} model=${JSON.stringify(guess.model)}`);
  }
  console.log(`Done: identified ${count} lock(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
