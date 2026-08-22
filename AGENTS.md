# StockVisual agent notes

Content lives on the **Cloudflare Worker** (`https://stockvisual.org`, D1 + R2). Agents generate one asset at a time, then import via HTTP. Do not treat localhost as the catalog.

## Sequential content generation (always)

When making assets (image + meta + import), do **one keyword at a time**. Never batch image prompts or parallel image jobs.

For a job of **N** assets (N is the demand count for this process):

1. Lock N topics on production first: `npm run agent:prepare -- --count N`  
   This writes `.tmp/keyword-batch.json` and sets `used=1` + `lockBatchId` on those rows so another process claiming M topics cannot see them.
2. For each pending keyword in the batch (serial):
   - Meta: `npm run agent:meta:gemma` (takes next pending from the batch file). Only use `npm run agent:meta` (Gemini) if the user explicitly asks.
   - Generate **one** image from `meta.imagePrompt`. Save using `meta.imagePageTitle` (Title Case; strip `<>:"/\|?*`).
   - Import: `node scripts/agent-import.mjs <meta.json> <image.jpg> <keywordId>`
3. Confirm success, then start the next pending keyword in the same batch.

Generate/import scripts default to **https://stockvisual.org** (production D1/R2). Override only with `GENERATE_BASE_URL` when intentionally hitting another Worker.

Title/tag casing: English title case; acronyms (PDF, UAE, AI, UI, 3D, 4Kâ¦) stay uppercase. Titles name the scene, not a search-query sentence. No âStock Imageâ / âFree Downloadâ in the title.

If the user asks for N assets, still run N serial loops inside one locked batch.

## Backlinks (serial, official submit only)

Do **not** spam comments, forums, Reddit threads, or guestbooks. Run the operator one target at a time:

1. `npm run backlinks:list` â show catalog + status (`.tmp/backlinks/status.json`)
2. `npm run backlinks:preview` then `npm run backlinks:run` â next automatable target (GitHub Awesome PR). Needs a **classic** `GITHUB_TOKEN` with `public_repo` (fine-grained tokens usually cannot fork + PR). Store it in `.dev.vars`.
3. Dev.to draft (optional): `npm run backlinks:run -- --id=devto-resource-index` with `DEV_TO_API_KEY`; add `--publish` only when the article should go live
4. Directory forms (AlternativeTo, Product Hunt, â¦): `npm run backlinks:kit` then `npm run backlinks:run -- --id=alternativeto --include-manual --open`. After the live listing exists: `npm run backlinks:done -- --id=alternativeto --url=<listing-url>`

Packets land in `.tmp/backlinks/packets/`. Public press kit: `https://stockvisual.org/info/press`. Anchors stay brand / URL / âsourceâ â never âFree Stock Photosâ. Skip AI directories until a public AI tool ships. Skip lists that ban AI-generated photography.

## Cursor Cloud specific instructions

Cloud Agents clone this GitHub repo. There is **no** `.dev.vars` on the VM. Import targets production unless `GENERATE_BASE_URL` is set.

Required **Cursor Dashboard â Cloud Agents â Secrets** (Runtime Secrets, never commit):

| Name | Purpose |
|------|---------|
| `GENERATE_BASE_URL` | Use `https://stockvisual.org` (Environment Variable is fine) |
| `GENERATE_API_SECRET` | Same value as the Worker secret `GENERATE_API_SECRET` (local `.dev.vars` key `GENERATE_API_SECRET_REMOTE`) |
| `TOGETHER_API_KEY` | Required for default meta (`npm run agent:meta:gemma`) |
| `GEMINI_API_KEY` | Only if the user asks for Gemini meta |
| `GITHUB_TOKEN` | Optional. Enables `npm run backlinks:run` GitHub Awesome PRs |
| `DEV_TO_API_KEY` | Optional. Enables Dev.to drafts via the backlink operator |

Do **not** start `astro dev` or Wrangler for content jobs. Do **not** git-commit generated JPEGs or `.tmp` meta unless the user asks. Do **not** open a PR just to import an asset â success is a live page on stockvisual.org.

Default mobile/cloud task: **generate and import exactly 1 asset**, then stop and report the public URL (`/{category}/{slug}`). For N>1, lock with `node scripts/agent-prepare.mjs --count=N` first, then serial loops.

If `python3` is required, prefer `python3` then `python`. `npm install` is already in `.cursor/environment.json`.

### Copy-paste prompt (phone)

```
Generate and import exactly 1 stock asset for stockvisual.org.
Follow AGENTS.md: agent-prepare --count=1 (or claim via meta), npm run agent:meta:gemma, generate one image from imagePrompt, then agent-import.mjs.
Do not batch images. Do not commit images. Do not open a PR. Reply with the live asset URL when import succeeds.
```
