# Lock Catalog app

A minimal read-only viewer for `../catalog.json`.

- **server/** — Express + TS. Serves the catalog JSON and the lock photos.
  - `GET /api/locks` → the parsed contents of `../../catalog.json`
  - `GET /images/**` → static files from `../../Images`
- **client/** — Vite + React + TS + MUI. Fetches `/api/locks` and renders the
  locks in a stock MUI table. No editing yet.

## Run (dev)

From this `app/` folder:

```
npm run install:all     # installs server + client + this folder's deps
npm run dev             # starts server (:3001) and client (:5173) together
```

Then open http://localhost:5173 — the Vite dev server proxies `/api` and
`/images` to the Express server on :3001.

Or run each side on its own:

```
npm --prefix server run dev     # http://localhost:3001
npm --prefix client run dev     # http://localhost:5173
```
