# Lock Sale Catalog

Tools for cataloging and selling a personal lock collection: each lock is
photographed as a numbered-sticker shot plus an angle shot, `catalog.ts`
pairs the two and reads the sticker with Claude vision, and a small viewer
app lets you browse, search, and edit the catalog.

**Public site (read-only):** https://boriskozo.github.io/lock-sale/

## What's here

- `catalog.ts` — pairs photos by sorted position, reads each sticker via
  Claude vision, writes `catalog.json` (+ `catalog.html` for a quick look).
- `optimize-images.ts` — resizes the photos for the web (long edge 1024px,
  JPEG q75) into `images-optimized/`.
- `catalog.json` — the data: one entry per lock (box, sticker #, shape,
  format, brand, model, keys, comments, photo paths).
- `app/` — the viewer/editor (private, local use only):
  - `server/` — Express API: `GET /api/locks`, `PATCH /api/locks/:id`,
    serves the photos, keeps a 10-deep rolling backup of `catalog.json`.
  - `client/` — React + MUI table with search, a lightbox, and an edit
    dialog for format/brand/model/keys/comments.
- `deploy-public.ts` — builds a static, read-only snapshot of the app (no
  backend, no edit UI) and publishes it to the `gh-pages` branch.

## Running the private editor

```
cd app
npm run install:all
npm run dev
```

Then open http://localhost:5173. Requires `ANTHROPIC_API_KEY` in `.env`
(see `.env.example`) if you're re-running `catalog.ts`.

## Publishing the public site

```
npx tsx deploy-public.ts
```

Rebuilds the static snapshot from the current `catalog.json` +
`images-optimized/` and force-pushes it to `gh-pages`. GitHub Pages
picks it up within a minute or two.
