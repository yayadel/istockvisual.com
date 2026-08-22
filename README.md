# StockVisual

Astro + Cloudflare (Pages / D1 / R2) stock-visual site. Sanity holds content metadata, Better Auth + D1 handles membership, and GitHub connects to Cloudflare for deploys.

Live site: [https://stockvisual.org](https://stockvisual.org)

## Stack

- **Frontend / SSR**: Astro 7 + `@astrojs/cloudflare`
- **Categories**: `Photos / Illustrations / Vectors / 3D` in [`src/config/categories.ts`](src/config/categories.ts)
- **CMS**: Sanity ([`sanity/`](sanity/))
- **Object storage**: Cloudflare R2 (binding: `MEDIA`)
- **Database / membership**: Cloudflare D1 + Better Auth (binding: `DB`)
- **AI edit**: [`/tools/ai-edit`](src/pages/tools/ai-edit.astro) placeholder (no live model yet)

If Sanity is not configured, the site falls back to local demo assets so the UI can run first.

## Quick start

### 1. Install dependencies

```bash
npm install
npm install --prefix sanity
```

### 2. Local environment variables

```bash
copy .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

- `BETTER_AUTH_SECRET`: a long random string (`openssl rand -hex 32`)
- `BETTER_AUTH_URL`: `http://localhost:4325`
- Sanity variables can stay empty (demo assets will be used)

### 3. Local D1 migrations

```bash
npm run db:migrate:local
```

### 4. Import keywords (local CSV → D1)

`keyword_store/kwdata_172-ok.csv` imports only the **KEYWORD** column (column 3) and skips rows where **VALUE = 0**. The `keyword` table has a `used` field (`0` = unused, `1` = used).

```bash
npm run keywords:import          # local D1
npm run keywords:import:remote   # production D1 (create the remote DB first)
```

Optional flags: `node scripts/import-keywords.mjs --dry-run` (SQL only) and `--limit=1000`.

### 5. Keywords → generated assets

The host prompt lives in [`host_prompt.txt`](host_prompt.txt) (runtime copy: [`src/data/host-prompt.txt`](src/data/host-prompt.txt)). Flow:

1. Claim the next unused keyword from D1 (`POST /api/generate/prepare`)
2. A **Cursor Agent text model** builds JSON metadata from `host_prompt.txt` + the keyword
3. A **Cursor Agent image model** generates the image from `imagePrompt`
4. The agent calls `POST /api/generate/import` to write R2 + `generated_asset` + `keyword_content`
5. The detail page shows title, description, palette, tags, related searches, and usage notes

```bash
npm run dev
npm run agent:prepare          # lock a keyword and print the prompt
# In Cursor: generate one asset with the built-in models and import it
# Or by hand: npm run agent:import -- meta.json image.jpg <keywordId>
```

Open `/tools/generate` in the browser, click **Prepare keyword**, then finish generation and import in Cursor.

**Database relations (extensible)**

| Table | Purpose |
|---|---|
| `keyword` | Keyword library; `used` / `usedAt` mark consumption |
| `generated_asset` | Generated asset, with `keywordId` foreign key |
| `keyword_content` | Generic join table (can attach `sanity_asset` later) |

Code: `src/lib/keyword-content.ts`  
HTTP: `GET /api/keywords/stats`, `GET /api/keywords/:id/content`, `GET /api/content/:type/:id/keyword`

```bash
npm run dev                    # start the dev server first
npm run generate:asset         # CLI: generate one asset
# or open /tools/generate and use the button
```

### Local AI (`.dev.vars`)

Default is **Ollama** (not Cloudflare AI):

```env
LOCAL_AI_TEXT_URL=http://127.0.0.1:11434/v1
LOCAL_AI_TEXT_MODEL=qwen2.5:7b
LOCAL_AI_IMAGE_URL=http://127.0.0.1:11434
LOCAL_AI_IMAGE_MODEL=flux
LOCAL_AI_IMAGE_PROVIDER=ollama
```

Start Ollama and pull models:

```bash
ollama pull qwen2.5:7b
ollama pull flux
```

For **Automatic1111**, set `LOCAL_AI_IMAGE_PROVIDER=sdwebui` and `LOCAL_AI_IMAGE_URL=http://127.0.0.1:7860`.

See [`.dev.vars.example`](.dev.vars.example) for `GENERATE_API_SECRET` and `ADMIN_EMAILS`.

> `database_id` in `wrangler.jsonc` starts as a placeholder. Local `migrations apply --local` works; before production, run `wrangler d1 create istockvisual-db` and replace the ID.

### 6. Start the site

```bash
npm run dev
```

Open <http://localhost:4325>.

### 7. (Optional) Sanity Studio

1. Create a project on [sanity.io](https://www.sanity.io)
2. Set `SANITY_STUDIO_PROJECT_ID` / `SANITY_STUDIO_DATASET`
3. Put the same `projectId` / `dataset` in root `.dev.vars` (`SANITY_PROJECT_ID`, etc.)
4. Run:

```bash
npm run sanity:dev
```

Create an `asset` document in Studio and set `r2ObjectKey` to the matching R2 object key.

## Main routes

| Path | Description |
|---|---|
| `/` | Home |
| `/photos` `/illustrations` `/vectors` `/3d` | Category indexes |
| `/:category/:slug` | Asset detail |
| `/login` `/signup` `/account` | Membership |
| `/tools/ai-edit` | AI edit placeholder |
| `/api/auth/*` | Better Auth |
| `/api/download/:id` | Controlled download (login required; Pro assets need `plan=pro`) |

## Cloudflare resources (free-tier start)

Create these in the Cloudflare Dashboard / Wrangler:

1. **D1**: `istockvisual-db` → write `database_id` into [`wrangler.jsonc`](wrangler.jsonc)
2. **R2**: `istockvisual-media` → binding `MEDIA`
3. Apply remote migrations:

```bash
npm run db:migrate:remote
```

Recommended env vars (Pages / Workers):

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` (production origin, e.g. `https://stockvisual.org`)
- `SANITY_PROJECT_ID`
- `SANITY_DATASET`
- `SANITY_API_TOKEN` (read-only, optional)
- `PUBLIC_SANITY_PROJECT_ID` / `PUBLIC_SANITY_DATASET` (if the build should read public config)

## GitHub → Cloudflare deploy

1. Push this repo to GitHub
2. Cloudflare Dashboard → **Workers & Pages** → Create → connect the GitHub repo
3. Build settings:
   - Build command: `npm run build`
   - Deploy / output: Astro Cloudflare adapter (this repo uses `wrangler.jsonc` + `npm run build`; `npx wrangler deploy` or the Pages Workers integration)
4. Bind the same D1 and R2, and set the env vars above
5. Run `npm run db:migrate:remote` before the first production deploy

## Download access

1. User must be signed in
2. If Sanity `isPremium === true`, the user must have `plan === 'pro'`
3. Stream the file from R2 `MEDIA` by `r2ObjectKey`

`plan` / `planExpiresAt` already live on the D1 `user` table. Payments (Stripe, etc.) can be added later without a schema change.

## Core layout

```
src/
  config/categories.ts
  lib/auth.ts | sanity.ts | r2.ts
  pages/...
  components/...
sanity/                 # headless CMS Studio
migrations/0001_init.sql
wrangler.jsonc
```

`keyword_store/` is gitignored because of size; it stays local only.

## Out of scope for now

- Stripe / subscription billing loop
- Live AI inference and metering
- OAuth social login
- Bulk asset import pipeline
